"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { motion } from "framer-motion";
import { 
  Users, 
  MessageSquare, 
  TrendingUp, 
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Bell
} from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats", {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
          }
        });
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const cards = [
    { 
      label: "Total Users", 
      value: stats?.users?.toLocaleString() || "0", 
      icon: Users, 
      color: "bg-blue-500",
      trend: "+12.5%",
      trendUp: true
    },
    { 
      label: "Open Tickets", 
      value: stats?.openTickets?.toString() || "0", 
      icon: MessageSquare, 
      color: "bg-amber-500",
      trend: "-2.4%",
      trendUp: false
    },
    { 
      label: "Total Transactions", 
      value: stats?.transactions?.toLocaleString() || "0", 
      icon: TrendingUp, 
      color: "bg-emerald-500",
      trend: "+18.2%",
      trendUp: true
    },
    { 
      label: "Revenue Volume", 
      value: `₹${(stats?.volume || 0).toLocaleString()}`, 
      icon: CreditCard, 
      color: "bg-purple-500",
      trend: "+5.4%",
      trendUp: true
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <Sidebar />
      
      <main className="flex-1 ml-72 p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Intelligence Dashboard</h1>
            <p className="text-gray-500 mt-1">Real-time overview of the LifeWise ecosystem.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search resources..."
                className="bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary-600 outline-none transition-all w-64"
              />
            </div>
            <button className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:text-primary-600 transition-all relative">
              <Bell className="w-5 h-5" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
          {cards.map((card, idx) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card p-6 group hover:translate-y-[-4px] transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${card.color} w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-${card.color.split('-')[1]}-500/20`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold ${card.trendUp ? 'text-emerald-600' : 'text-rose-600'} bg-gray-50 px-2 py-1 rounded-lg`}>
                  {card.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.trend}
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-semibold mb-1">{card.label}</p>
                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {loading ? "..." : card.value}
                </h3>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 glass-card p-8 min-h-[400px]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-lg text-gray-900">Growth Analytics</h3>
              <select className="bg-gray-50 border-none text-xs font-bold text-gray-600 rounded-lg px-3 py-2 outline-none">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>All Time</option>
              </select>
            </div>
            
            <div className="h-64 w-full relative">
              <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid Lines */}
                {[0, 50, 100, 150].map((y) => (
                  <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                {/* Area */}
                <path
                  d="M0,150 L100,120 L200,140 L300,80 L400,100 L500,60 L600,40 L700,70 L800,30 L800,200 L0,200 Z"
                  fill="url(#chartGradient)"
                />
                {/* Line */}
                <path
                  d="M0,150 L100,120 L200,140 L300,80 L400,100 L500,60 L600,40 L700,70 L800,30"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data Points */}
                {[
                  {x: 0, y: 150}, {x: 100, y: 120}, {x: 200, y: 140}, {x: 300, y: 80},
                  {x: 400, y: 100}, {x: 500, y: 60}, {x: 600, y: 40}, {x: 700, y: 70}, {x: 800, y: 30}
                ].map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
                ))}
              </svg>
              <div className="flex justify-between mt-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-8">
            <h3 className="font-bold text-lg text-gray-900 mb-6">Recent Activity</h3>
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-2 h-2 bg-primary-600 rounded-full mt-2 ring-4 ring-primary-50" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">New User Registered</p>
                    <p className="text-xs text-gray-500 mt-0.5">Rahul Mehta joined the platform</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">2 mins ago</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-8 py-3 text-sm font-bold text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
              View All Logs
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
