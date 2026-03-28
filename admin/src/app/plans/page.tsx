"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import Modal from "@/components/Modal";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Settings2, 
  Trash2, 
  CheckCircle2, 
  Zap, 
  Crown, 
  Target,
  Edit3,
  Loader2,
  AlertCircle
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "basic",
    price: "",
    interval: "monthly",
    status: "active",
    features: [""]
  });

  const fetchPlans = async () => {
    try {
      const res = await fetch(getApiUrl("/api/admin/plans"), {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      const data = await res.json();
      setPlans(data);
    } catch (err) {
      console.error("Failed to fetch plans", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openModal = (plan: any = null) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        type: plan.type,
        price: plan.price.toString(),
        interval: plan.interval,
        status: plan.status,
        features: plan.features || [""]
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: "",
        type: "basic",
        price: "",
        interval: "monthly",
        status: "active",
        features: [""]
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleAddFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ""] });
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const handleRemoveFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    setFormData({ ...formData, features: newFeatures });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload = {
      ...formData,
      price: parseFloat(formData.price),
      features: formData.features.filter(f => f.trim() !== "")
    };

    try {
      const url = editingPlan ? getApiUrl(`/api/admin/plans/${editingPlan._id}`) : getApiUrl("/api/admin/plans");
      const method = editingPlan ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchPlans();
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

  const handleDelete = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this service tier?")) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/plans/${planId}`), {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      if (res.ok) {
        fetchPlans();
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const planIcons = {
    basic: Target,
    premium: Zap,
    enterprise: Crown
  };

  return (
    <MainLayout>
      <main className="p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Subscription Architecture</h1>
            <p className="text-gray-500 mt-1">Design and manage tiered service offerings.</p>
          </div>
          
          <button 
            onClick={() => openModal()}
            className="premium-button flex items-center gap-2 font-bold py-3 px-6 shadow-xl shadow-primary-600/20"
          >
            <Plus className="w-5 h-5" />
            New Service Tier
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
             [1, 2, 3].map(i => (
               <div key={i} className="glass-card h-[400px] animate-pulse relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
               </div>
             ))
          ) : (
            plans.map((plan, idx) => {
              const Icon = planIcons[plan.type as keyof typeof planIcons] || Settings2;
              return (
                <motion.div
                  key={plan._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="glass-card p-8 flex flex-col relative overflow-hidden group border-2 border-transparent hover:border-primary-100 transition-all duration-300"
                >
                  <div className="mb-6 flex justify-between items-start">
                    <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-600 shadow-sm relative z-10">
                      <Icon className="w-7 h-7" />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-[-10px] group-hover:translate-y-0 relative z-10">
                      <button 
                        onClick={() => openModal(plan)}
                        className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-all shadow-sm active:scale-95"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(plan._id)}
                        className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-red-600 transition-all shadow-sm active:scale-95"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-3xl font-extrabold text-gray-900 tracking-tight">₹{plan.price.toLocaleString('en-IN')}</span>
                    <span className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">/ {plan.interval}</span>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                    {plan.features?.length > 0 ? (
                      plan.features.map((feature: string, i: number) => (
                        <div key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600 font-semibold">{feature}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 italic">No features defined</p>
                    )}
                  </div>

                  <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {plan.activeUsers || 0} Subscriptions
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${plan.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      {plan.status}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}

          {!loading && plans.length === 0 && (
             <div className="col-span-full py-20 text-center glass-card bg-white/50 border-dashed border-2 border-gray-200">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mx-auto mb-6">
                    <Settings2 className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-400">No Service Tiers Defined</h3>
                <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Initialize your first subscription plan to begin monetizing your governance services.</p>
                <button 
                  onClick={() => openModal()}
                  className="mt-8 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                >
                    Create First Plan
                </button>
             </div>
          )}
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingPlan ? "Edit Service Tier" : "New Service Tier"}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-semibold">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Plan Name</label>
                <input 
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="premium-input w-full"
                  placeholder="e.g. Strategic Premium"
                />
              </div>
              
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Service Type</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="premium-input w-full"
                >
                  <option value="basic">Basic (Target)</option>
                  <option value="premium">Premium (Zap)</option>
                  <option value="enterprise">Enterprise (Crown)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Monthly Price (₹)</label>
                <input 
                  required
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="premium-input w-full"
                  placeholder="999"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Feature Set</label>
                <button 
                  type="button" 
                  onClick={handleAddFeature}
                  className="text-primary-600 text-xs font-bold uppercase tracking-widest hover:underline"
                >
                  + Add Item
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto p-1 pr-2">
                {formData.features.map((feature, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      required
                      type="text"
                      value={feature}
                      onChange={(e) => handleFeatureChange(idx, e.target.value)}
                      className="premium-input flex-1 py-1.5 text-sm"
                      placeholder={`Feature ${idx + 1}`}
                    />
                    <button 
                      type="button"
                      onClick={() => handleRemoveFeature(idx)}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button 
              disabled={isSaving}
              type="submit" 
              className="premium-button w-full flex items-center justify-center gap-2 py-4"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Synchronizing...
                </>
              ) : (
                editingPlan ? "Update Architecture" : "Deploy Tier"
              )}
            </button>
          </form>
        </Modal>
      </main>
    </MainLayout>
  );
}
