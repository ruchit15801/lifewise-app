"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { motion } from "framer-motion";
import { 
  Plus, 
  TicketPercent, 
  Calendar, 
  Users, 
  Timer,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  Activity
} from "lucide-react";

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCodes = async () => {
      try {
        const res = await fetch("/api/admin/promo-codes", {
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

    fetchCodes();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <Sidebar />
      
      <main className="flex-1 ml-72 p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Promotion Strategy</h1>
            <p className="text-gray-500 mt-1">Manage discount logic and growth campaigns.</p>
          </div>
          
          <button className="glass-button flex items-center gap-2 font-bold py-3 px-6">
            <Plus className="w-5 h-5" />
            Generate Campaign
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {loading ? (
             [1, 2].map(i => <div key={i} className="glass-card h-48 animate-pulse" />)
          ) : (
            codes.map((code, idx) => (
              <motion.div
                key={code._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="glass-card bg-white p-0 overflow-hidden group"
              >
                <div className="flex h-full">
                  <div className="w-1/3 bg-primary-600 p-8 flex flex-col items-center justify-center text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-50" />
                    <TicketPercent className="w-10 h-10 mb-4 opacity-50" />
                    <h3 className="text-3xl font-black italic tracking-tighter leading-none">{code.code}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-2">{code.discountPercent}% OFF</p>
                  </div>
                  
                  <div className="flex-1 p-8">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg">{code.description || "Inaugural Support Campaign"}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 font-bold uppercase tracking-widest">
                          <Activity className="w-3 h-3 text-emerald-500" />
                          {code.status || "Active Pipeline"}
                        </div>
                      </div>
                      <button className="text-gray-400 hover:text-gray-900">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mt-8">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{code.redemptions || 0} / {code.maxRedemptions || "∞"}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Redemptions</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                          <Timer className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{code.expiryDate ? new Date(code.expiryDate).toLocaleDateString() : "NEVER"}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Expiration</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}

          {!loading && codes.length === 0 && (
             <div className="col-span-full py-20 text-center glass-card flex flex-col items-center">
                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center text-primary-200 mb-6">
                    <TicketPercent className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-400 tracking-tight">No Active Promotions</h3>
                <p className="text-gray-400 mt-2 max-w-sm mx-auto">Generate unique promotional codes to drive platform engagement and subscription growth.</p>
                <button className="mt-8 px-6 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20">
                    Create Code
                </button>
             </div>
          )}
        </div>
      </main>
    </div>
  );
}
