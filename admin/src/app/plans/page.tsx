"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { motion } from "framer-motion";
import { 
  Plus, 
  Settings2, 
  Trash2, 
  CheckCircle2, 
  Zap, 
  Crown, 
  Target,
  Edit3
} from "lucide-react";

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch("/api/admin/plans", {
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

    fetchPlans();
  }, []);

  const planIcons = {
    basic: Target,
    premium: Zap,
    enterprise: Crown
  };

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <Sidebar />
      
      <main className="flex-1 ml-72 p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Subscription Architecture</h1>
            <p className="text-gray-500 mt-1">Design and manage tiered service offerings.</p>
          </div>
          
          <button className="glass-button flex items-center gap-2 font-bold py-3 px-6">
            <Plus className="w-5 h-5" />
            New Service Tier
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
             [1, 2, 3].map(i => <div key={i} className="glass-card h-80 animate-pulse" />)
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
                    <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-600 shadow-sm">
                      <Icon className="w-7 h-7" />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-all shadow-sm">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-red-600 transition-all shadow-sm">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-3xl font-extrabold text-gray-900 tracking-tight">₹{plan.price}</span>
                    <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">/ {plan.interval}</span>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                    {plan.features?.map((feature: string, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600 font-medium">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {plan.activeUsers || 0} Subscriptions
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${plan.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {plan.status}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}

          {!loading && plans.length === 0 && (
             <div className="col-span-full py-20 text-center glass-card">
                <Settings2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-400">No Service Tiers Defined</h3>
                <p className="text-gray-400 mt-2">Initialize your first subscription plan to begin monetizing.</p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
}
