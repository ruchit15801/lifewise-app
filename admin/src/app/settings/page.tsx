"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings, 
  Shield, 
  Mail, 
  Percent, 
  Wallet, 
  Save, 
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info,
  Smartphone,
  Cpu,
  Globe,
  Lock,
  Zap,
  HardDrive,
  Bell,
  CreditCard,
  RefreshCcw,
  Eye,
  Activity
} from "lucide-react";
import { getApiUrl } from "@/lib/api-config";

type Section = 'maintenance' | 'features' | 'financials' | 'integrations' | 'limits';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('maintenance');
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(getApiUrl("/api/admin/system-settings"), {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (path: string) => {
    if (!settings) return;
    const keys = path.split('.');
    const newSettings = { ...settings };
    let current = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = !current[keys[keys.length - 1]];
    setSettings(newSettings);
  };

  const handleChange = (path: string, value: any) => {
    if (!settings) return;
    const keys = path.split('.');
    const newSettings = { ...settings };
    let current = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch(getApiUrl("/api/admin/system-settings"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Governance protocol updated and synchronized' });
      } else {
        setMessage({ type: 'error', text: 'Synchronization failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network connection lost' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F9FAFB] items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
      </div>
    );
  }

  const sections: { id: Section, label: string, icon: any }[] = [
    { id: 'maintenance', label: 'Maintenance Control', icon: Shield },
    { id: 'features', label: 'Feature Governance', icon: Cpu },
    { id: 'financials', label: 'Financial Matrix', icon: Wallet },
    { id: 'limits', label: 'Resource Limits', icon: HardDrive },
    { id: 'integrations', label: 'External Nodes', icon: Zap },
  ];

  return (
    <MainLayout>
      <main className="p-10 max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <Settings className="w-8 h-8 text-primary-600" />
              System Governance
            </h1>
            <p className="text-gray-500 mt-1">Global command center for centralized application orchestration.</p>
          </div>

          <div className="flex items-center gap-3">
             <button 
                onClick={fetchSettings}
                className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-primary-600 transition-all hover:bg-gray-50 active:scale-95 shadow-sm"
             >
                <RefreshCcw className="w-5 h-5" />
             </button>
             <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="premium-button flex items-center gap-2 py-3 px-8 shadow-xl shadow-primary-600/20"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSaving ? "Syncing..." : "Sync Protocol"}
            </button>
          </div>
        </header>

        {message && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-8 p-4 rounded-2xl flex items-center gap-3 font-bold text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm shadow-emerald-100/50' : 'bg-red-50 text-red-700 border border-red-100 shadow-sm shadow-red-100/50'}`}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              {message.text}
            </motion.div>
          )}

        <div className="flex gap-10">
          {/* Navigation Sidebar */}
          <aside className="w-64 space-y-2 shrink-0">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-300 ${isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 border border-transparent shadow-sm'}`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-primary-600'}`} />
                  <span className="font-bold text-sm">{section.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Configuration View */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                {activeSection === 'maintenance' && (
                  <div className="space-y-6">
                    <div className="glass-card p-8 bg-white border-2 border-primary-50">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Global Maintenance Protocol</h3>
                          <p className="text-sm text-gray-500 mt-1">Force entire platform into read-only/offline state.</p>
                        </div>
                        <Switch 
                          checked={settings?.globalMaintenance || false} 
                          onChange={() => handleToggle('globalMaintenance')} 
                          danger
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Downtime Communication</label>
                          <textarea 
                            value={settings?.maintenanceMessage || ''}
                            onChange={(e) => handleChange('maintenanceMessage', e.target.value)}
                            className="premium-input w-full min-h-[100px] resize-none"
                            placeholder="Inform users about the maintenance status..."
                          />
                        </div>
                        <div className="space-y-2">
                           <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Estimated Duration</label>
                           <input 
                              type="text"
                              value={settings?.maintenanceDowntime ?? ''}
                              onChange={(e) => handleChange('maintenanceDowntime', e.target.value)}
                              className="premium-input w-full"
                              placeholder="e.g. 2-4 hours, Completion at 10:00 PM..."
                           />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <MaintenanceToggle 
                        icon={Mail} 
                        label="Support Desk" 
                        status={settings?.sectionalMaintenance?.support || false} 
                        onChange={() => handleToggle('sectionalMaintenance.support')} 
                      />
                      <MaintenanceToggle 
                        icon={CreditCard} 
                        label="Payment Gateway" 
                        status={settings?.sectionalMaintenance?.payments || false} 
                        onChange={() => handleToggle('sectionalMaintenance.payments')} 
                      />
                      <MaintenanceToggle 
                        icon={Zap} 
                        label="Real-time Chat" 
                        status={settings?.sectionalMaintenance?.chat || false} 
                        onChange={() => handleToggle('sectionalMaintenance.chat')} 
                      />
                      <MaintenanceToggle 
                        icon={Cpu} 
                        label="Wise AI Assistant" 
                        status={settings?.sectionalMaintenance?.assistant || false} 
                        onChange={() => handleToggle('sectionalMaintenance.assistant')} 
                      />
                    </div>
                  </div>
                )}

                {activeSection === 'features' && (
                   <div className="grid grid-cols-1 gap-4">
                      <div className="glass-card p-8 bg-white mb-4">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                          <Lock className="w-5 h-5 text-primary-600" />
                          Authentication & Access Control
                        </h3>
                        <div className="space-y-4">
                            <FeatureToggle 
                                label="New User Registration" 
                                description="Allow new accounts to be created on the platform" 
                                checked={settings?.features?.registration || false}
                                onChange={() => handleToggle('features.registration')}
                            />
                            <FeatureToggle 
                                label="Core Login Access" 
                                description="Enable secondary authentication for existing participants" 
                                checked={settings?.features?.login || false}
                                onChange={() => handleToggle('features.login')}
                            />
                        </div>
                      </div>

                      <div className="glass-card p-8 bg-white">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                          <Eye className="w-5 h-5 text-primary-600" />
                          Experience Modules
                        </h3>
                        <div className="space-y-4">
                            <FeatureToggle 
                                label="Voice Reminders (AI)" 
                                description="Real-time voice processing for reminder creation" 
                                checked={settings?.features?.voiceReminders || false}
                                onChange={() => handleToggle('features.voiceReminders')}
                            />
                             <FeatureToggle 
                                 label="Intelligent Bill Scanning" 
                                 description="Optical recognition and categorization for scanned invoices" 
                                 checked={settings?.features?.billScanning || false}
                                 onChange={() => handleToggle('features.billScanning')}
                             />
                        </div>
                      </div>
                   </div>
                )}

                {activeSection === 'financials' && (
                   <div className="grid grid-cols-1 gap-6">
                      <div className="glass-card p-8 bg-white">
                        <div className="flex items-center gap-4 mb-8">
                           <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                             <Percent className="w-6 h-6" />
                           </div>
                           <div>
                             <h3 className="text-xl font-bold text-gray-900">Revenue Governance</h3>
                             <p className="text-sm text-gray-500">Global commission and transaction parameters.</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Platform Commission (%)</label>
                              <div className="relative">
                                <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input 
                                  type="number"
                                  value={settings?.globalCommission ?? 0}
                                  onChange={(e) => handleChange('globalCommission', parseFloat(e.target.value))}
                                  className="premium-input w-full pl-11"
                                />
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Min. Withdrawal Threshold</label>
                               <input 
                                 type="number"
                                 value={settings?.minWithdrawal ?? 0}
                                 onChange={(e) => handleChange('minWithdrawal', parseInt(e.target.value))}
                                 className="premium-input w-full"
                               />
                           </div>
                           <div className="space-y-2 col-span-2">
                              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Max. Daily Transaction Volume</label>
                               <input 
                                 type="number"
                                 value={settings?.maxDailyWithdrawal ?? 0}
                                 onChange={(e) => handleChange('maxDailyWithdrawal', parseInt(e.target.value))}
                                 className="premium-input w-full"
                               />
                           </div>
                        </div>
                      </div>

                      <div className="glass-card p-6 bg-amber-50 border-amber-100 flex items-start gap-4">
                         <Info className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
                         <p className="text-sm text-amber-900 leading-relaxed font-medium">
                            Financial adjustments are synchronized globally across all user accounts. Changes to the commission structure will affect all pending and future settlements immediately.
                         </p>
                      </div>
                   </div>
                )}

                {activeSection === 'limits' && (
                   <div className="glass-card p-8 bg-white">
                      <div className="flex items-center gap-4 mb-8">
                         <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600">
                           <HardDrive className="w-6 h-6" />
                         </div>
                         <div>
                           <h3 className="text-xl font-bold text-gray-900">Resource Architecture</h3>
                           <p className="text-sm text-gray-500">System capacity and storage governance.</p>
                         </div>
                      </div>

                      <div className="space-y-8">
                         <div className="flex items-center justify-between">
                            <div className="flex-1">
                               <p className="font-bold text-gray-900">Max. File Upload Diameter</p>
                               <p className="text-sm text-gray-500">Total capacity for media attachments in support/scans.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <input 
                                  type="range" 
                                  min="1" 
                                  max="20" 
                                  value={settings?.limits?.maxUploadSize ?? 10}
                                  onChange={(e) => handleChange('limits.maxUploadSize', parseInt(e.target.value))}
                                  className="w-48 accent-primary-600"
                                />
                                <span className="font-bold text-primary-600 w-12">{settings?.limits?.maxUploadSize ?? 10}MB</span>
                            </div>
                         </div>

                         <div className="flex items-center justify-between">
                            <div className="flex-1">
                               <p className="font-bold text-gray-900">Max. Reminders Per Governance</p>
                               <p className="text-sm text-gray-500">Soft cap for active reminders per individual participant.</p>
                            </div>
                             <input 
                                type="number"
                                value={settings?.limits?.maxRemindersPerUser ?? 50}
                                onChange={(e) => handleChange('limits.maxRemindersPerUser', parseInt(e.target.value))}
                                className="premium-input w-32"
                             />
                         </div>
                      </div>
                   </div>
                )}

                {activeSection === 'integrations' && (
                   <div className="grid grid-cols-1 gap-6">
                      <div className="glass-card p-8 bg-white">
                        <h3 className="font-bold text-gray-900 mb-8 flex items-center gap-2 uppercase tracking-widest text-xs opacity-50">
                           Nodes & Bridges
                        </h3>
                        <div className="space-y-6">
                            <IntegrationRow 
                                icon={CreditCard}
                                label="Stripe Protocol"
                                description="Primary bridge for global subscription payments"
                                status={settings?.integrations?.stripeEnabled || false}
                                onChange={() => handleToggle('integrations.stripeEnabled')}
                            />
                            <IntegrationRow 
                                icon={Activity}
                                label="Razorpay Bridge"
                                description="Regional payment settlement layer"
                                status={settings?.integrations?.razorpayEnabled || false}
                                onChange={() => handleToggle('integrations.razorpayEnabled')}
                            />
                            <IntegrationRow 
                                icon={Bell}
                                label="Notification Engine"
                                description="Automated push and email relay system"
                                status={settings?.integrations?.notificationsEnabled || false}
                                onChange={() => handleToggle('integrations.notificationsEnabled')}
                            />
                        </div>
                      </div>
                   </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}

function MaintenanceToggle({ icon: Icon, label, status, onChange }: any) {
  return (
    <div className={`glass-card p-6 bg-white border-2 transition-all duration-300 ${status ? 'border-red-100 bg-red-50/10' : 'border-emerald-50 bg-emerald-50/10'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
           <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <Icon className="w-5 h-5" />
           </div>
           <div>
              <p className="font-bold text-xs uppercase tracking-widest opacity-50">{label}</p>
              <p className={`text-sm font-extrabold ${status ? 'text-red-700' : 'text-emerald-700'}`}>
                 {status ? 'MAINTENANCE' : 'OPERATIONAL'}
              </p>
           </div>
        </div>
        <Switch checked={status} onChange={onChange} danger={true} />
      </div>
    </div>
  );
}

function FeatureToggle({ label, description, checked, onChange }: any) {
    return (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
            <div className="flex-1 pr-4">
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1">{description}</p>
            </div>
            <Switch checked={checked} onChange={onChange} />
        </div>
    );
}

function IntegrationRow({ icon: Icon, label, description, status, onChange }: any) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-primary-600 transition-colors">
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                   <p className="font-bold text-gray-900 text-sm">{label}</p>
                   <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
            </div>
            <Switch checked={status} onChange={onChange} />
        </div>
    );
}

function Switch({ checked, onChange, danger = false }: { checked: boolean; onChange: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-14 h-7 rounded-full transition-all relative shrink-0 ${checked ? (danger ? 'bg-red-500' : 'bg-primary-600') : 'bg-gray-200'}`}
    >
      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${checked ? 'left-8' : 'left-1'}`} />
    </button>
  );
}
