"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, 
  Mail, 
  Shield, 
  Upload, 
  Save, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  Camera
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

export default function ProfilePage() {
  const [admin, setAdmin] = useState<any>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [uploading, setUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch(getApiUrl("/api/admin/profile"), {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      const data = await res.json();
      setAdmin(data);
      setName(data.name || "");
      setBio(data.bio || "");
      setAvatar(data.avatar || "");
    } catch (err) {
      console.error("Failed to fetch profile", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await fetch(getApiUrl("/api/admin/profile/update"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ name, bio, avatar })
      });
      if (res.ok) {
        setStatus({ type: 'success', message: "Profile updated successfully" });
      } else {
        setStatus({ type: 'error', message: "Failed to update profile" });
      }
    } catch (err) {
      setStatus({ type: 'error', message: "An error occurred" });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: "Passwords do not match" });
      return;
    }
    try {
      const res = await fetch(getApiUrl("/api/admin/profile/change-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setStatus({ type: 'error', message: data.message || "Failed to change password" });
      }
    } catch (err) {
      setStatus({ type: 'error', message: "An error occurred" });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(getApiUrl("/api/admin/support/upload"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setAvatar(data.url);
        setStatus({ type: 'success', message: "Avatar uploaded" });
      }
    } catch (err) {
      console.error("Upload failed", err);
      setStatus({ type: 'error', message: "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return null;

  return (
    <MainLayout>
      <main className="overflow-y-auto">
        <div className="p-8 max-w-5xl mx-auto">
          <header className="mb-10">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Admin Profile</h2>
            <p className="text-gray-500 mt-1">Manage your administrative identity and security protocols.</p>
          </header>

          <AnimatePresence>
            {status && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`mb-6 p-4 rounded-2xl flex items-center gap-3 border ${status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}
              >
                {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <p className="text-sm font-bold">{status.message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Avatar & Summary */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-200/50 flex flex-col items-center text-center">
                <div className="relative group mb-6">
                  <div className="w-32 h-32 rounded-3xl overflow-hidden bg-gray-100 border-4 border-white shadow-lg relative">
                    {avatar ? (
                      <img src={avatar} alt="Admin Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary-50 text-primary-600">
                        <User className="w-12 h-12" />
                      </div>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary-600 text-white rounded-2xl flex items-center justify-center shadow-lg cursor-pointer hover:bg-primary-700 transition-all group-hover:scale-110">
                    <Camera className="w-5 h-5" />
                    <input type="file" className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                  </label>
                </div>

                <h3 className="text-xl font-bold text-gray-900">{name || "Administrator"}</h3>
                <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mt-1">Super Admin Account</p>
                
                <div className="mt-8 w-full space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 truncate">{admin?.email}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Role: {admin?.role}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Settings */}
            <div className="lg:col-span-2 space-y-8">
              {/* Profile Settings */}
              <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-200/50">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="premium-input"
                        placeholder="Master Administrator"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Administrative Bio</label>
                      <textarea 
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        className="premium-input resize-none"
                        placeholder="Describe your administrative reach and system focus..."
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="premium-button flex items-center gap-2"
                    >
                      <Save className="w-5 h-5" />
                      Update Identity
                    </button>
                  </div>
                </form>
              </section>

              {/* Password Settings */}
              <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-200/50">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Security Credentials</h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Current Password</label>
                      <input 
                        type="password" 
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="premium-input"
                        placeholder="••••••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">New Password</label>
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="premium-input"
                        placeholder="••••••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Confirm New Password</label>
                      <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="premium-input"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="premium-button bg-gray-900 hover:bg-black flex items-center gap-2 shadow-gray-200"
                    >
                      <Shield className="w-5 h-5" />
                      Update Access Keys
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}
