"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  Shield, 
  CreditCard,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  User as UserIcon,
  Search,
  LayoutGrid,
  History,
  Activity,
  Zap,
  Lock,
  Unlock,
  Package,
  ArrowUpRight,
  Database
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

export default function UserDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("activity");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        };

        const [userRes, activityRes] = await Promise.all([
          fetch(getApiUrl(`/api/admin/users/${id}`), { headers }),
          fetch(getApiUrl(`/api/admin/users/${id}/activity`), { headers })
        ]);

        if (userRes.status === 404) {
          setError("Participant not found in registry.");
          return;
        }

        if (!userRes.ok) throw new Error("Connection failed");

        const [userData, activityData] = await Promise.all([
          userRes.json(),
          activityRes.json()
        ]);

        setUser(userData);
        setActivity(activityData);
      } catch (err) {
        console.error("Failed to fetch user details", err);
        setError("An unexpected protocol error occurred.");
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#FBFBFC]">
        <Sidebar aria-hidden="true" />
        <main className="flex-1 ml-72 p-12 flex flex-col items-center justify-center">
            <div className="relative">
                <div className="w-16 h-16 border-[3px] border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                    <Database className="w-6 h-6 animate-pulse" />
                </div>
            </div>
          <p className="mt-8 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Deciphering Identity Protocols</p>
        </main>
      </div>
    );
  }

  if (error || !user) {
    return (
      <MainLayout>
        <main className="p-12 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-24 h-24 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mb-8 rotate-3 shadow-2xl shadow-rose-500/10">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tighter">Registry Error</h2>
          <p className="text-gray-500 font-bold mb-10 max-w-md text-center">{error || "The participant profile could not be synchronized."}</p>
          <button 
            onClick={() => router.push("/users")}
            className="group flex items-center gap-3 px-10 py-4 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-black/20"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Return to Registry
          </button>
        </main>
      </MainLayout>
    );
  }

  const statCards = [
    { label: "Bill Registry", value: user.stats?.bills || 0, icon: FileText, color: "text-blue-600", bg: "bg-blue-50/50" },
    { label: "Expense Logs", value: user.stats?.expenses || 0, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50/50" },
    { label: "Ledger Volume", value: user.stats?.transactions || 0, icon: History, color: "text-emerald-600", bg: "bg-emerald-50/50" },
  ];

  return (
    <MainLayout>
      <main className="p-12 max-w-[1600px] mx-auto">
        {/* Breadcrumb Path */}
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-3 text-gray-400 hover:text-black transition-all font-black text-[10px] uppercase tracking-widest mb-10 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Participant Registry / <span className="text-gray-900 ml-1">{user.name || "Anonymous Persona"}</span>
        </button>

        {/* Tactical Header */}
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-8">
            <div className="relative group">
                <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xl shadow-emerald-500/5 group-hover:scale-105 transition-transform duration-500">
                    <UserIcon className="w-12 h-12" />
                </div>
                {user.status === 'active' && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                )}
            </div>
            
            <div>
              <div className="flex items-center gap-4 mb-3">
                <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none">{user.name || "Anonymous Participant"}</h1>
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border ${
                  user.status === 'active' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                  : 'bg-rose-50 text-rose-700 border-rose-100'
                }`}>
                  {user.status || 'Active'}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-gray-500 font-bold">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-gray-300" />
                  <span className="text-gray-500">{user.email}</span>
                </div>
                {user.phone && (
                    <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-gray-300" />
                        <span className="text-gray-500">{user.phone}</span>
                    </div>
                )}
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-gray-300" />
                  <span>Enrolled {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="flex-1 sm:flex-none px-8 py-4 bg-white border border-gray-100 rounded-2xl text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm hover:border-gray-300">
              Restrict Persona
            </button>
            <button className="flex-1 sm:flex-none px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
              Initialize Upgrade
            </button>
          </div>
        </header>

        {/* Asset Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {statCards.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative overflow-hidden bg-white border border-gray-100/80 rounded-[2rem] p-8 group hover:shadow-2xl hover:shadow-gray-200/40 transition-all duration-500"
            >
              <div className="flex items-start justify-between">
                  <div className={`w-16 h-16 ${stat.bg} ${stat.color} rounded-3xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 shadow-sm`}>
                    <stat.icon className="w-8 h-8" />
                  </div>
                  <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Active Asset</div>
              </div>
              <div className="mt-8">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gray-900 tracking-tighter">{stat.value}</span>
                    <span className="text-xs font-bold text-gray-400">Total Entries</span>
                </div>
              </div>
              {/* Subtle accent line */}
              <div className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-${stat.color.split('-')[1]}-500 to-transparent w-full opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            </motion.div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Central Intelligence Feed */}
          <div className="lg:col-span-8 space-y-10">
            <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-sm">
              <nav className="flex items-center gap-1 p-3 bg-gray-50/50 border-b border-gray-100">
                {[
                  { id: "activity", label: "Intelligence Stream", icon: Activity },
                  { id: "bills", label: "Registry", icon: FileText },
                  { id: "expenses", label: "Logs", icon: TrendingUp },
                  { id: "transactions", label: "Ledger", icon: History },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                        activeTab === tab.id 
                        ? 'bg-white text-emerald-600 shadow-md shadow-emerald-500/5 border border-emerald-100/50' 
                        : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                    }`}
                  >
                    <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-300'}`} />
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="p-10">
                <AnimatePresence mode="wait">
                  {activeTab === 'activity' && (
                    <motion.div
                      key="activity"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-8"
                    >
                      {activity.length > 0 ? (
                        activity.map((item, idx) => (
                          <div key={idx} className="flex gap-6 group relative">
                            {idx !== activity.length - 1 && (
                                <div className="absolute left-6 top-14 bottom-0 w-px bg-gray-100 group-hover:bg-emerald-100 transition-colors" />
                            )}
                            <div className={`w-12 h-12 ${item.color || 'bg-gray-900'} text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg relative z-10 transition-transform duration-500 group-hover:scale-110`}>
                                {item.type === 'transaction' ? <CreditCard className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
                            </div>
                            <div className="pb-10 pt-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{item.type} protocol</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-200" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                </div>
                                <h4 className="text-xl font-black text-gray-900 mb-2 tracking-tight group-hover:text-emerald-600 transition-colors">{item.title}</h4>
                                <p className="text-gray-500 font-bold leading-relaxed">{item.description}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-24 text-center">
                          <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-200 mx-auto mb-8 border border-gray-100 shadow-inner">
                            <Activity className="w-10 h-10" />
                          </div>
                          <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Zero Activity Metadata</h3>
                          <p className="text-gray-400 font-bold text-sm max-w-[280px] mx-auto leading-relaxed">This participant hasn't generated any tactical activity within the current epoch.</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'bills' && (
                    <motion.div
                      key="bills"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {user.bills?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {user.bills.map((bill: any, idx: number) => (
                            <div key={idx} className="group p-6 bg-gray-50/50 rounded-3xl border border-gray-100 flex flex-col gap-4 hover:bg-white hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 hover:border-blue-100">
                              <div className="flex items-center justify-between">
                                <div className="w-12 h-12 bg-blue-100/50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                  <FileText className="w-6 h-6" />
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100`}>
                                    {bill.status || 'Verified'}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-gray-900 text-lg tracking-tight group-hover:text-blue-600 transition-colors">{bill.merchant || bill.name || "Utility Registry"}</h4>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{bill.category || 'Standard'}</p>
                              </div>
                              <div className="pt-4 mt-auto border-t border-gray-100 flex items-center justify-between">
                                  <span className="text-2xl font-black text-gray-900 leading-none">₹{bill.amount?.toLocaleString()}</span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(bill.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-24 text-center">
                          <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-200 mx-auto mb-8 border border-gray-100">
                            <FileText className="w-10 h-10" />
                          </div>
                          <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Registry Empty</h3>
                          <p className="text-gray-400 font-bold text-sm max-w-[280px] mx-auto">No bill documentation has been synchronized for this persona.</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'expenses' && (
                    <motion.div
                      key="expenses"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {user.expenses?.length > 0 ? (
                        <div className="space-y-4">
                          {user.expenses.map((expense: any, idx: number) => (
                            <div key={idx} className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100 flex items-center justify-between group hover:bg-white hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 hover:border-amber-100">
                              <div className="flex items-center gap-6">
                                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                  <TrendingUp className="w-7 h-7" />
                                </div>
                                <div>
                                  <h4 className="font-black text-gray-900 text-xl tracking-tight group-hover:text-amber-600 transition-colors">{expense.description}</h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest font-mono">{expense.category}</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-200" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(expense.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-black text-gray-900 tracking-tighter">₹{expense.amount?.toLocaleString()}</p>
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1">Financial Log</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-24 text-center">
                          <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-200 mx-auto mb-8 border border-gray-100">
                            <TrendingUp className="w-10 h-10" />
                          </div>
                          <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Zero Expenditure</h3>
                          <p className="text-gray-400 font-bold text-sm max-w-[280px] mx-auto">No expense logs have been recorded in the current data stream.</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'transactions' && (
                    <motion.div
                      key="transactions"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {user.recentTransactions?.length > 0 ? (
                        <div className="overflow-hidden border border-gray-100 rounded-3xl bg-gray-50/20">
                            <table className="w-full text-left">
                            <thead className="bg-gray-50/80">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                <th className="px-8 py-5">Ledger Entry</th>
                                <th className="px-8 py-5">Amount</th>
                                <th className="px-8 py-5">Type</th>
                                <th className="px-8 py-5 text-right">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {user.recentTransactions.map((tx: any, idx: number) => (
                                <tr key={idx} className="group transition-all hover:bg-white">
                                    <td className="px-8 py-6">
                                    <div className="font-black text-gray-900 text-base tracking-tight group-hover:text-emerald-600 transition-colors uppercase">{tx.merchant || "Standard Vendor"}</div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{tx.category || "General"}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-xl font-black text-gray-900 tracking-tighter">₹{tx.amount?.toLocaleString()}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border ${
                                        tx.isDebit ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${tx.isDebit ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                        {tx.isDebit ? 'Debit' : 'Credit'}
                                    </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="text-xs font-bold text-gray-500 tracking-tight">{new Date(tx.date).toLocaleDateString()}</div>
                                        <div className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                </tr>
                                ))}
                            </tbody>
                            </table>
                        </div>
                      ) : (
                        <div className="py-24 text-center">
                          <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-200 mx-auto mb-8 border border-gray-100">
                            <History className="w-10 h-10" />
                          </div>
                          <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Ledger Empty</h3>
                          <p className="text-gray-400 font-bold text-sm max-w-[280px] mx-auto">This participant's financial history has no recorded entries.</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Contextual Intelligence Sidebar */}
          <div className="lg:col-span-4 space-y-10">
            {/* Security Hardening Status */}
            <div className="bg-white border border-gray-100 p-10 rounded-[2.5rem] shadow-sm">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.23em] mb-8 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                Security Context
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-6 bg-gray-50/50 rounded-3xl border border-gray-100 group hover:border-emerald-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Phone className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                        <span className="block text-xs font-black text-gray-900 uppercase tracking-widest">Phone KYC</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mobile Registry</span>
                    </div>
                  </div>
                  {user.phoneVerified ? (
                      <div className="w-8 h-8 bg-emerald-100/50 text-emerald-600 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 shadow-sm" />
                      </div>
                  ) : (
                      <div className="w-8 h-8 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                        <XCircle className="w-4 h-4 shadow-sm" />
                      </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-6 bg-gray-50/50 rounded-3xl border border-gray-100 group hover:border-emerald-200 transition-colors">
                  <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Mail className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                        <span className="block text-xs font-black text-gray-900 uppercase tracking-widest">Email Auth</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Domain Identity</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-emerald-100/50 text-emerald-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 shadow-sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Service Node Allocation */}
            <div className="relative group overflow-hidden bg-gray-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-gray-900/30">
              {/* Dynamic Gradients */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/30 transition-all duration-1000" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2 group-hover:bg-blue-500/20 transition-all duration-1000" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center">
                        <Package className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Service Layer</div>
                </div>
                
                <h3 className="text-xs font-black text-white/50 uppercase tracking-[0.2em] mb-3">Participation Level</h3>
                <p className="text-3xl font-black mb-8 tracking-tighter leading-tight">Elite Premium Infrastructure</p>
                
                <div className="space-y-5 mb-10 pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Node Frequency</span>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Monthly</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Next Allocation</span>
                    <span className="text-xs font-black uppercase tracking-widest">April 24, 2026</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button className="flex-1 py-4 bg-white/10 backdrop-blur-xl border border-white/5 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest hover:bg-white/20 transition-all">
                        Ledger Audit
                    </button>
                    <button className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20">
                        Adjust Node
                    </button>
                </div>
              </div>
            </div>

            {/* Quick Actions Center */}
            <div className="bg-gray-50/50 border border-gray-100 p-8 rounded-[2rem] shadow-inner">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Administrative Command</h3>
                <div className="grid grid-cols-1 gap-3">
                    <button className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-gray-100 rounded-2xl text-[10px] font-black text-gray-900 uppercase tracking-widest hover:shadow-lg hover:-translate-y-0.5 transition-all">
                        <Zap className="w-4 h-4 text-emerald-500" />
                        Trigger Notification
                    </button>
                    <button className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-gray-100 rounded-2xl text-[10px] font-black text-gray-900 uppercase tracking-widest hover:shadow-lg hover:-translate-y-0.5 transition-all">
                        <Lock className="w-4 h-4 text-amber-500" />
                        Secure Credentials
                    </button>
                </div>
            </div>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}
