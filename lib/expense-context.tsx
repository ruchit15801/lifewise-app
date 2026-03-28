import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import {
  Transaction,
  Bill,
  MoneyLeak,
  ReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  ReportsData,
  LifeScoreData,
} from './data';
import { getApiUrl } from './query-client';
import { useAuth } from './auth-context';
import { useAlert } from './alert-context';
import { readSmsFromDeviceWithMeta, requestSmsPermissionDetails } from './sms-reader';
import { parseSmsToTransactions } from './parse-sms';
import { performSmsSync, SmsSyncPhase } from './sms-sync-task';

const STORAGE_KEYS = {
  BUDGET: '@lifewise_budget',
  REMINDER_SETTINGS: '@lifewise_reminder_settings',
};

interface ExpenseContextValue {
  transactions: Transaction[];
  bills: Bill[];
  leaks: MoneyLeak[];
  isLoading: boolean;
  isSyncingSms: boolean;
  smsSyncPhase: SmsSyncPhase;
  smsSyncStatus: string | null;
  smsSyncProgressCurrent: number | null;
  smsSyncProgressTotal: number | null;
  smsSyncDetail: string | null;
  smsSampleSenders: string[];
  lastSmsReadCount: number | null;
  lastSmsSyncCount: number | null;
  toggleBillPaid: (billId: string) => void;
  refreshData: () => void;
  syncSmsFromDevice: () => Promise<void>;
  monthlyBudget: number;
  setMonthlyBudget: (budget: number) => void;
  quickAddReminder: (text: string) => Promise<void>;
  addReminder: (bill: Omit<Bill, 'id'>) => Promise<Bill | null>;
  editReminder: (bill: Bill) => void;
  deleteReminder: (billId: string) => void;
  snoozeReminder: (billId: string, days: number, minutes?: number) => void;
  cancelReminder: (billId: string) => void;
  uncancelReminder: (billId: string) => void;
  reminderSettings: ReminderSettings;
  updateReminderSettings: (settings: ReminderSettings) => void;
  lifeScore: LifeScoreData | null;
  getReports: (start: string, end: string) => Promise<ReportsData | null>;
}

const ExpenseContext = createContext<ExpenseContextValue | null>(null);

async function fetchWithAuth(token: string | null, path: string, options?: RequestInit): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl).toString();
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  return res;
}

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [leaks, setLeaks] = useState<MoneyLeak[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSms, setIsSyncingSms] = useState(false);
  const [smsSyncPhase, setSmsSyncPhase] = useState<SmsSyncPhase>('idle');
  const [smsSyncStatus, setSmsSyncStatus] = useState<string | null>(null);
  const [smsSyncProgressCurrent, setSmsSyncProgressCurrent] = useState<number | null>(null);
  const [smsSyncProgressTotal, setSmsSyncProgressTotal] = useState<number | null>(null);
  const [smsSyncDetail, setSmsSyncDetail] = useState<string | null>(null);
  const [smsSampleSenders, setSmsSampleSenders] = useState<string[]>([]);
  const [lastSmsReadCount, setLastSmsReadCount] = useState<number | null>(null);
  const [lastSmsSyncCount, setLastSmsSyncCount] = useState<number | null>(null);
  const [monthlyBudget, setMonthlyBudgetState] = useState(100000);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [lifeScore, setLifeScore] = useState<LifeScoreData | null>(null);
  const { showAlert } = useAlert();

  const loadData = useCallback(async () => {
    if (!token) {
      setTransactions([]);
      setBills([]);
      setLeaks([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      // Load from AsyncStorage as a fast fallback/cached state
      const [budgetStored, settingsStored] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.BUDGET),
        AsyncStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS),
      ]);
      if (budgetStored != null) setMonthlyBudgetState(JSON.parse(budgetStored));
      if (settingsStored) setReminderSettings(JSON.parse(settingsStored));

      const [txRes, billsRes, leaksRes, settingsRes] = await Promise.all([
        fetchWithAuth(token, '/api/transactions'),
        fetchWithAuth(token, '/api/bills'),
        fetchWithAuth(token, '/api/leaks'),
        fetchWithAuth(token, '/api/settings'),
      ]);

      if (txRes.ok) setTransactions(await txRes.json());
      else setTransactions([]);
      if (billsRes.ok) setBills(await billsRes.json());
      else setBills([]);
      if (leaksRes.ok) setLeaks(await leaksRes.json());
      else setLeaks([]);
      
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.monthlyBudget != null) {
          setMonthlyBudgetState(settings.monthlyBudget);
          AsyncStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(settings.monthlyBudget));
        }
        if (settings.reminderSettings) {
          setReminderSettings(settings.reminderSettings);
          AsyncStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(settings.reminderSettings));
        }
      }
    } catch (e) {
      setTransactions([]);
      setBills([]);
      setLeaks([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const syncSmsFromDevice = useCallback(async () => {
    if (!token) return;
    setIsSyncingSms(true);
    setSmsSyncStatus('Preparing SMS sync...');
    setSmsSyncProgressCurrent(null);
    setSmsSyncProgressTotal(null);
    setSmsSampleSenders([]);
    setLastSmsReadCount(null);
    setLastSmsSyncCount(null);
    try {
      if (Platform.OS !== 'android') {
        showAlert({
          title: 'SMS sync not supported',
          message: 'Auto Track via SMS only works on Android phones.',
          type: 'info',
        });
        setSmsSyncStatus('SMS sync only works on Android devices.');
        setSmsSyncProgressCurrent(null);
        setSmsSyncProgressTotal(null);
        setLastSmsReadCount(0);
        setLastSmsSyncCount(0);
        await loadData();
        return;
      }

      setSmsSyncStatus('Requesting SMS permission...');
      const permission = await requestSmsPermissionDetails();
      if (permission.status !== 'granted') {
        if (permission.status === 'never_ask_again') {
          showAlert({
            title: 'Permission blocked',
            message: 'SMS permission is blocked. Please open Settings > Permissions and allow SMS.',
            type: 'warning',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings().catch(() => { });
                },
              },
            ],
          });
        } else {
          showAlert({
            title: 'Permission needed',
            message: 'Please allow SMS permission to enable Auto Track.',
            type: 'info',
          });
        }
        setSmsSyncStatus(permission.message);
        setSmsSyncProgressCurrent(null);
        setSmsSyncProgressTotal(null);
        setLastSmsReadCount(0);
        setLastSmsSyncCount(0);
        await loadData();
        return;
      }

      setSmsSyncPhase('fetching');
      setSmsSyncStatus('Reading SMS inbox...');

      console.log('[SMS-Debug] Starting sync...');
      const syncResult = await performSmsSync(token, (prog) => {
        setSmsSyncPhase(prog.phase);
        if (prog.phase === 'fetching') {
          setSmsSyncStatus('Reading SMS inbox...');
        } else if (prog.phase === 'parsing') {
          setSmsSyncStatus(`Identifying transactions...`);
          setSmsSyncProgressTotal(prog.total || null);
        } else if (prog.phase === 'uploading') {
          setSmsSyncStatus('Securely syncing to cloud...');
          setSmsSyncProgressCurrent(prog.current || null);
          setSmsSyncProgressTotal(prog.total || null);
          setSmsSyncDetail(prog.detail || null);
        }
      });

      console.log('[SMS-Debug] Sync result:', syncResult);
      
      if (syncResult.success) {
        setLastSmsSyncCount(syncResult.synced);
        setSmsSyncPhase('completed');
        setSmsSyncStatus(`Sync complete. ${syncResult.synced} transactions synced.`);
        await loadData();
        // Reset phase after delay if synced something, or keep idle
        setTimeout(() => setSmsSyncPhase('idle'), 5000);
      } else {
        // If it failed because of module unavailable, we might want a specific status
        setSmsSyncPhase('error');
        setSmsSyncStatus('SMS sync failed. Please check permissions.');
      }
    } catch (err) {
      console.error('SMS sync error:', err);
      setSmsSyncPhase('error');
      setSmsSyncStatus('SMS sync failed unexpectedly.');
      await loadData();
    } finally {
      setIsSyncingSms(false);
    }
  }, [token, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleBillPaid = useCallback(async (billId: string) => {
    if (!token) return;
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    const oldBills = [...bills];
    const status: 'active' | 'paid' = bill.isPaid ? 'active' : 'paid';
    const updated = { ...bill, isPaid: !bill.isPaid, status };
    
    // Optimistic Update
    setBills((prev) => prev.map((b) => (b.id === billId ? updated : b)));
    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setBills((prev) => prev.map((b) => (b.id === billId ? updated : b)));
      else setBills(oldBills);
    } catch {
      setBills(oldBills);
    }
  }, [token, bills]);

  const addReminder = useCallback(async (billData: Omit<Bill, 'id'>): Promise<Bill | null> => {
    if (!token) return null;
    try {
      const res = await fetchWithAuth(token, '/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData),
      });
      if (res.ok) {
        const created = await res.json();
        setBills((prev) => [...prev, created]);
        return created as Bill;
      }
    } catch {
      // optional: add locally with generateId for optimistic UI
    }
    return null;
  }, [token]);

  const editReminder = useCallback(async (updatedBill: Bill) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(token, `/api/bills/${updatedBill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBill),
      });
      if (res.ok) setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
    } catch {
      setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
    }
  }, [token]);

  const deleteReminder = useCallback(async (billId: string) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}`, { method: 'DELETE' });
      if (res.ok) setBills((prev) => prev.filter((b) => b.id !== billId));
    } catch {
      setBills((prev) => prev.filter((b) => b.id !== billId));
    }
  }, [token]);

  const snoozeReminder = useCallback(async (billId: string, days: number, minutes?: number) => {
    if (!token) return;
    const oldBills = [...bills];
    
    // Optimistic Update: Remove from dashboard immediately
    setBills((prev) => prev.map((b) => {
      if (b.id === billId) {
        const snoozeMs = (minutes || days * 24 * 60) * 60 * 1000;
        const snoozedUntil = new Date(Date.now() + snoozeMs).toISOString();
        return { ...b, status: 'snoozed', snoozedUntil, isPaid: false };
      }
      return b;
    }));

    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snooze', days, minutes }),
      });
      if (!res.ok) {
        setBills(oldBills);
      }
    } catch (err) {
      console.error('Snooze error:', err);
      setBills(oldBills);
    }
  }, [token, bills]);

  const cancelReminder = useCallback(async (billId: string) => {
    if (!token) return;
    const oldBills = [...bills];

    // Optimistic Update
    setBills((prev) => prev.map((b) => (b.id === billId ? { ...b, status: 'cancelled', isPaid: false } : b)));

    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        setBills(oldBills);
      }
    } catch (err) {
      console.error('Cancel error:', err);
      setBills(oldBills);
    }
  }, [token, bills]);

  const uncancelReminder = useCallback(async (billId: string) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uncancel' }),
      });
      if (res.ok) {
        setBills((prev) => prev.map((b) => (b.id === billId ? { ...b, status: 'active', isPaid: false } : b)));
      }
    } catch (err) {
      console.error('Uncancel error:', err);
    }
  }, [token]);

  const quickAddReminder = useCallback(
    async (text: string) => {
      if (!token || !text.trim()) return;
      try {
        const res = await fetchWithAuth(token, '/api/reminders/quick-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const created = await res.json();
          setBills((prev) => [...prev, created]);
        }
      } catch {
        // ignore, user will still have manual flows
      }
    },
    [token],
  );

  const refreshData = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const setMonthlyBudget = useCallback(async (budget: number) => {
    setMonthlyBudgetState(budget);
    await AsyncStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(budget));
    if (token) {
      try {
        await fetchWithAuth(token, '/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthlyBudget: budget }),
        });
      } catch {
        // ignore
      }
    }
  }, [token]);

  const updateReminderSettings = useCallback(async (settings: ReminderSettings) => {
    setReminderSettings(settings);
    await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(settings));
    if (token) {
      try {
        await fetchWithAuth(token, '/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminderSettings: settings }),
        });
      } catch {
        // ignore
      }
    }
  }, [token]);

  const getReports = useCallback(async (start: string, end: string): Promise<ReportsData | null> => {
    if (!token) return null;
    try {
      const res = await fetchWithAuth(token, `/api/reports?start=${start}&end=${end}`);
      if (res.ok) return await res.json();
    } catch {
      // ignore
    }
    return null;
  }, [token]);

  const value = useMemo(
    () => ({
      transactions,
      bills,
      leaks,
      isLoading,
      isSyncingSms,
      smsSyncPhase,
      smsSyncStatus,
      smsSyncProgressCurrent,
      smsSyncProgressTotal,
      smsSyncDetail,
      smsSampleSenders,
      lastSmsReadCount,
      lastSmsSyncCount,
      toggleBillPaid,
      refreshData,
      syncSmsFromDevice,
      monthlyBudget,
      setMonthlyBudget,
      quickAddReminder,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      cancelReminder,
      uncancelReminder,
      reminderSettings,
      updateReminderSettings,
      lifeScore,
      getReports,
    }),
    [
      transactions,
      bills,
      leaks,
      isLoading,
      isSyncingSms,
      smsSyncPhase,
      smsSyncStatus,
      smsSyncProgressCurrent,
      smsSyncProgressTotal,
      smsSyncDetail,
      smsSampleSenders,
      lastSmsReadCount,
      lastSmsSyncCount,
      monthlyBudget,
      reminderSettings,
      toggleBillPaid,
      refreshData,
      syncSmsFromDevice,
      setMonthlyBudget,
      quickAddReminder,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      cancelReminder,
      uncancelReminder,
      updateReminderSettings,
      lifeScore,
      getReports,
    ]
  );

  return <ExpenseContext.Provider value={value}>{children}</ExpenseContext.Provider>;
}

export function useExpenses() {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error('useExpenses must be used within an ExpenseProvider');
  }
  return context;
}
