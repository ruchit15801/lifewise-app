"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import Modal from "@/components/Modal";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  TicketPercent, 
  Calendar, 
  Users, 
  Timer,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  Activity,
  Loader2,
  AlertCircle,
  Trash2
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    discountPercent: "10",
    maxRedemptions: "100",
    expiryDate: "",
    description: "",
    status: "active"
  });

  const fetchCodes = async () => {
    try {
      const res = await fetch(getApiUrl("/api/admin/promo-codes"), {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      const data = await res.json();
      setCodes(data);
    } catch (err) {
      console.error("Failed to fetch codes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const openModal = () => {
    setFormData({
      code: "",
      discountPercent: "10",
      maxRedemptions: "100",
      expiryDate: "",
      description: "",
      status: "active"
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload = {
      ...formData,
      discountPercent: parseFloat(formData.discountPercent),
      maxRedemptions: parseInt(formData.maxRedemptions),
      redemptions: 0
    };

    try {
      const res = await fetch(getApiUrl("/api/admin/promo-codes"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchCodes();
      } else {
        const errorData = await res.json();
        setError(errorData.message || "Something went wrong");
      }
    } catch (err) {
      setError("Failed to connect to the server");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (codeId: string) => {
    if (!confirm("Are you sure you want to terminate this promotion?")) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/promo-codes/${codeId}`), {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "LW-";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, code: result });
  };

  return (
    <MainLayout>
      <main className="p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Promotion Strategy</h1>
            <p className="text-gray-500 mt-1">Manage discount logic and growth campaigns.</p>
          </div>
          
          <button 
            onClick={openModal}
            className="premium-button flex items-center gap-2 font-bold py-3 px-6 shadow-xl shadow-primary-600/20"
          >
            <Plus className="w-5 h-5" />
            Generate Campaign
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {loading ? (
             [1, 2].map(i => (
               <div key={i} className="glass-card h-48 animate-pulse relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
               </div>
             ))
          ) : (
            codes.map((code, idx) => (
              <motion.div
                key={code._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="glass-card bg-white p-0 overflow-hidden group border-2 border-transparent hover:border-primary-100 transition-all duration-300"
              >
                <div className="flex h-full">
                  <div className="w-1/3 bg-primary-600 p-8 flex flex-col items-center justify-center text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-50" />
                    <TicketPercent className="w-10 h-10 mb-4 opacity-50" />
                    <h3 className="text-3xl font-black italic tracking-tighter leading-none">{code.code}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-2">{code.discountPercent}% OFF</p>
                  </div>
                  
                  <div className="flex-1 p-8 relative">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg truncate max-w-[200px]">{code.description || "Active Campaign"}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 font-bold uppercase tracking-widest">
                          <Activity className="w-3 h-3 text-emerald-500" />
                          {code.status || "Live"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleDelete(code._id)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-all active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mt-8">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{code.redemptions || 0} / {code.maxRedemptions || "∞"}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Usage</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                          <Timer className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{code.expiryDate ? new Date(code.expiryDate).toLocaleDateString() : "NEVER"}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Expirations</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}

          {!loading && codes.length === 0 && (
             <div className="col-span-full py-20 text-center glass-card flex flex-col items-center bg-white/50 border-dashed border-2 border-gray-200">
                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center text-primary-200 mb-6">
                    <TicketPercent className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-400 tracking-tight">No Active Promotions</h3>
                <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Generate unique promotional codes to drive platform engagement and subscription growth.</p>
                <button 
                  onClick={openModal}
                  className="mt-8 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 active:scale-95 transition-all"
                >
                    Create First Code
                </button>
             </div>
          )}
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Generate Campaign"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-semibold">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Promo Code</label>
                    <button 
                        type="button" 
                        onClick={generateRandomCode}
                        className="text-primary-600 text-[10px] font-bold uppercase tracking-widest hover:underline"
                    >
                        Auto-Generate
                    </button>
                </div>
                <input 
                  required
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="premium-input w-full font-mono text-lg tracking-widest"
                  placeholder="e.g. LIFWISE10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Discount %</label>
                    <input 
                        required
                        type="number"
                        value={formData.discountPercent}
                        onChange={(e) => setFormData({...formData, discountPercent: e.target.value})}
                        className="premium-input w-full"
                        placeholder="10"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Max Usage</label>
                    <input 
                        required
                        type="number"
                        value={formData.maxRedemptions}
                        onChange={(e) => setFormData({...formData, maxRedemptions: e.target.value})}
                        className="premium-input w-full"
                        placeholder="100"
                    />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Expiry Date</label>
                    <input 
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) => setFormData({...formData, expiryDate: e.target.value})}
                        className="premium-input w-full"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Initial Status</label>
                    <select 
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                        className="premium-input w-full"
                    >
                        <option value="active">Active</option>
                        <option value="scheduled">Scheduled</option>
                    </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Campaign Description</label>
                <input 
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="premium-input w-full"
                  placeholder="e.g. Summer Growth Initiative"
                />
              </div>
            </div>

            <button 
              disabled={isSaving}
              type="submit" 
              className="premium-button w-full flex items-center justify-center gap-2 py-4 shadow-xl shadow-primary-600/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Deploying Campaign...
                </>
              ) : (
                "Finalize Promotion"
              )}
            </button>
          </form>
        </Modal>
      </main>
    </MainLayout>
  );
}
