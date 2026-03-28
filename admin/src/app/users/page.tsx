"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import { motion } from "framer-motion";
import Link from "next/link";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  UserPlus, 
  Mail, 
  Phone, 
  Calendar,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(getApiUrl("/api/admin/users"), {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
          }
        });
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        console.error("Failed to fetch users", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleStatusUpdate = async (userId: string, newStatus: string) => {
    if (!confirm(`Are you sure you want to change this user's status to ${newStatus}?`)) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/users/${userId}/status`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      }
    } catch (err) {
      console.error("Status update failed", err);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("CRITICAL: Are you sure you want to PERMANENTLY delete this user? This action cannot be undone.")) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/users/${userId}`), {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <main className="p-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Management</h1>
            <p className="text-gray-500 mt-1">Manage and audit all platform participants.</p>
          </div>
          
          <button className="glass-button flex items-center gap-2 font-bold py-3 px-6">
            <UserPlus className="w-5 h-5" />
            Provision User
          </button>
        </header>

        <section className="glass-card overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-white/50 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by name, email or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-600 outline-none transition-all"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">
                <Filter className="w-4 h-4" />
                Filters
              </button>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-4">
                {filteredUsers.length} Total Users
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Participant</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Contact Info</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Joined</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-8 h-16 bg-white" />
                    </tr>
                  ))
                ) : (
                  filteredUsers.map((user, idx) => (
                    <motion.tr 
                      key={user._id || user.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-gray-50/50 transition-all group"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shadow-sm">
                            {user.name?.charAt(0) || "U"}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{user.name || "Anonymous User"}</p>
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {(user.id || user._id || "").slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            {user.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            {user.phone || "Not provided"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {user.status === 'blocked' ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-100">
                            <XCircle className="w-3 h-3" />
                            Blocked
                          </div>
                        ) : user.phoneVerified ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-100">
                            <XCircle className="w-3 h-3" />
                            Pending
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(user.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleStatusUpdate((user.id || user._id), user.status === 'blocked' ? 'active' : 'blocked')}
                            className={`p-2 rounded-lg border border-transparent transition-all ${user.status === 'blocked' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                            title={user.status === 'blocked' ? 'Unblock Participant' : 'Block Participant'}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete((user.id || user._id))}
                            className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                            title="Permanent Deletion"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link 
                            href={`/users/${user.id || user._id}`}
                            className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 text-gray-400 hover:text-primary-600 transition-all"
                            title="Deep Insights"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-6 bg-gray-50/30 flex items-center justify-between border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Showing 1 to {filteredUsers.length} of {users.length} results</p>
            <div className="flex gap-2">
              <button disabled className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-400 cursor-not-allowed">Previous</button>
              <button disabled className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-400 cursor-not-allowed">Next</button>
            </div>
          </div>
        </section>
      </main>
    </MainLayout>
  );
}
