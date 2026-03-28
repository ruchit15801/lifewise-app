"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
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
import { getApiUrl } from "@/lib/api-config";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [growth, setGrowth] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        };

        const [statsRes, growthRes, activityRes] = await Promise.all([
          fetch(getApiUrl("/api/admin/stats"), { headers }),
          fetch(getApiUrl("/api/admin/analytics/growth"), { headers }),
          fetch(getApiUrl("/api/admin/activity"), { headers })
        ]);

        const [statsData, growthData, activityData] = await Promise.all([
          statsRes.json(),
          growthRes.json(),
          activityRes.json()
        ]);

        setStats(statsData);
        setGrowth(growthData);
        setActivities(activityData);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
      color: "bg-primary-600",
      trend: "+5.4%",
      trendUp: true
    },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/50">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm font-bold text-primary-600 flex items-center justify-between gap-4">
              Revenue <span className="text-gray-900">₹{payload[0].value.toLocaleString()}</span>
            </p>
            <p className="text-sm font-bold text-blue-600 flex items-center justify-between gap-4">
              Users <span className="text-gray-900">{payload[1]?.value || 0}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <MainLayout>
      <main className="p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Intelligence Dashboard</h1>
            <p className="text-gray-500 mt-1 font-medium">Real-time overview of the LifeWise ecosystem.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search resources..."
                className="bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none transition-all w-64 font-medium"
              />
            </div>
            <button className="w-11 h-11 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:text-primary-600 transition-all shadow-sm relative group">
              <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <div className="absolute top-3 right-3 w-2 h-2 bg-primary-600 rounded-full border-2 border-white" />
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
              className="glass-card p-6 group hover:translate-y-[-4px] transition-all duration-300 bg-white border border-gray-100 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${card.color} w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-${card.color.split('-')[1]}-500/20`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-bold ${card.trendUp ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'} px-2 py-1 rounded-lg uppercase tracking-wider`}>
                  {card.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.trend}
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">{card.label}</p>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                  {loading ? "..." : card.value}
                </h3>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 glass-card p-8 bg-white border border-gray-100 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="font-bold text-lg text-gray-900 tracking-tight">Growth Analytics</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Daily platform intelligence</p>
              </div>
              <select className="bg-gray-50 border-none text-[10px] font-bold text-gray-500 uppercase tracking-widest rounded-lg px-4 py-2 outline-none cursor-pointer hover:bg-gray-100 transition-colors">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>All Time</option>
              </select>
            </div>
            
            <div className="flex-1 min-h-[300px] w-full mt-4">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-50/50 rounded-2xl">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aggregating Global Trends...</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#2563eb" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="users" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorUsers)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="glass-card p-8">
            <h3 className="font-bold text-lg text-gray-900 mb-6">Recent Activity</h3>
            <div className="space-y-6">
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="w-2 h-2 bg-gray-200 rounded-full mt-2" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-50 rounded w-1/2" />
                    </div>
                  </div>
                ))
              ) : activities.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No recent activity</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex gap-4 group">
                    <div className={`w-2 h-2 ${activity.color} rounded-full mt-2 ring-4 ring-gray-50`} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{activity.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{activity.description}</p>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">
                        {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button className="w-full mt-8 py-3 text-sm font-bold text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
              View All Logs
            </button>
          </div>
        </section>
      </main>
    </MainLayout>
  );
}
