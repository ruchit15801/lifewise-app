import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import {
  Transaction,
  Bill,
  MoneyLeak,
  ReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
} from './data';
import { getApiUrl } from './query-client';
import { useAuth } from './auth-context';
import { readSmsFromDeviceWithMeta, requestSmsPermissionDetails } from './sms-reader';
import { parseSmsToTransactions } from './parse-sms';

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
  smsSyncStatus: string | null;
  smsSampleSenders: string[];
  lastSmsReadCount: number | null;
  lastSmsSyncCount: number | null;
  toggleBillPaid: (billId: string) => void;
  refreshData: () => void;
  syncSmsFromDevice: () => Promise<void>;
  monthlyBudget: number;
  setMonthlyBudget: (budget: number) => void;
  quickAddReminder: (text: string) => Promise<void>;
  createSmartReminder: (textInput: string) => Promise<void>;
  createSmartCapture: (payload: {
    type: 'reminder' | 'bill' | 'task' | 'expense' | 'note';
    input_mode: 'voice' | 'text' | 'photo';
    text_input: string;
  }) => Promise<void>;
  createVoiceReminder: (voiceText: string) => Promise<void>;
  addReminder: (bill: Omit<Bill, 'id'>) => void;
  editReminder: (bill: Bill) => void;
  deleteReminder: (billId: string) => void;
  snoozeReminder: (billId: string, days: number) => void;
  reminderSettings: ReminderSettings;
  updateReminderSettings: (settings: ReminderSettings) => void;
  liveSocket: Socket | null;
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
  const { token, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [leaks, setLeaks] = useState<MoneyLeak[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSms, setIsSyncingSms] = useState(false);
  const [smsSyncStatus, setSmsSyncStatus] = useState<string | null>(null);
  const [smsSampleSenders, setSmsSampleSenders] = useState<string[]>([]);
  const [lastSmsReadCount, setLastSmsReadCount] = useState<number | null>(null);
  const [lastSmsSyncCount, setLastSmsSyncCount] = useState<number | null>(null);
  const [monthlyBudget, setMonthlyBudgetState] = useState(100000);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [liveSocket, setLiveSocket] = useState<Socket | null>(null);

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
        if (settings.monthlyBudget != null) setMonthlyBudgetState(settings.monthlyBudget);
        if (settings.reminderSettings) setReminderSettings(settings.reminderSettings);
      }
      const [budgetStored, settingsStored] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.BUDGET),
        AsyncStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS),
      ]);
      if (budgetStored != null) setMonthlyBudgetState(JSON.parse(budgetStored));
      if (settingsStored) setReminderSettings(JSON.parse(settingsStored));
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
    setSmsSampleSenders([]);
    setLastSmsReadCount(null);
    setLastSmsSyncCount(null);
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('SMS sync not supported', 'Auto Track via SMS only works on Android phones.');
        setSmsSyncStatus('SMS sync only works on Android devices.');
        setLastSmsReadCount(0);
        setLastSmsSyncCount(0);
        await loadData();
        return;
      }

      setSmsSyncStatus('Requesting SMS permission...');
      const permission = await requestSmsPermissionDetails();
      if (permission.status !== 'granted') {
        if (permission.status === 'never_ask_again') {
          Alert.alert(
            'Permission blocked',
            'SMS permission is blocked. Please open Settings > Permissions and allow SMS.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings().catch(() => {});
                },
              },
            ],
          );
        } else {
          Alert.alert('Permission needed', 'Please allow SMS permission to enable Auto Track.');
        }
        setSmsSyncStatus(permission.message);
        setLastSmsReadCount(0);
        setLastSmsSyncCount(0);
        await loadData();
        return;
      }

      setSmsSyncStatus('Reading SMS inbox...');
      const smsResult = await readSmsFromDeviceWithMeta(150);
      const rawSms = smsResult.messages;
      const readCount = rawSms.length;
      setLastSmsReadCount(readCount);
      const senderPreview = Array.from(
        new Set(
          rawSms
            .map((s) => String(s.address || '').trim())
            .filter(Boolean)
            .map((v) => v.slice(0, 18))
        )
      ).slice(0, 4);
      setSmsSampleSenders(senderPreview);

      if (smsResult.error && readCount === 0) {
        setSmsSyncStatus(smsResult.error);
      } else {
        setSmsSyncStatus(`Read ${readCount} SMS. Parsing transactions...`);
      }

      const parsed = parseSmsToTransactions(rawSms);
      if (parsed.length > 0) {
        const chunkSize = 40;
        let totalSynced = 0;

        for (let i = 0; i < parsed.length; i += chunkSize) {
          const chunk = parsed.slice(i, i + chunkSize);
          const upto = Math.min(i + chunk.length, parsed.length);
          setSmsSyncStatus(`Syncing ${upto}/${parsed.length} transactions...`);

          const res = await fetchWithAuth(token, '/api/transactions/sync-from-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactions: chunk.map((p) => ({
                merchant: p.merchant,
                amount: p.amount,
                date: p.date,
                isDebit: p.isDebit,
                description: p.description,
                upiId: p.upiId,
                category: p.category,
              })),
            }),
          });

          if (!res.ok) continue;

          try {
            const json = await res.json();
            const syncedChunk = typeof json.synced === 'number' ? json.synced : chunk.length;
            totalSynced += syncedChunk;
          } catch {
            totalSynced += chunk.length;
          }

          setLastSmsSyncCount(totalSynced);
          await loadData();
        }

        await loadData();
        setLastSmsSyncCount(totalSynced);
        setSmsSyncStatus(`Read ${readCount} SMS, synced ${totalSynced} transactions.`);
      } else {
        setLastSmsSyncCount(0);
        if (!smsResult.moduleAvailable && smsResult.error) {
          setSmsSyncStatus(smsResult.error);
        } else {
          setSmsSyncStatus(`Read ${readCount} SMS, synced 0 transactions.`);
        }
        await loadData();
      }
    } catch {
      setSmsSyncStatus('SMS sync failed unexpectedly.');
      setLastSmsReadCount(0);
      setLastSmsSyncCount(0);
      await loadData();
    } finally {
      setIsSyncingSms(false);
    }
  }, [token, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token || !user?.id) return;
    const socket = io(getApiUrl(), { transports: ['websocket'] });
    socket.emit('join-user', user.id);
    const refreshOnEvent = () => {
      loadData();
    };
    socket.on('reminder_created', refreshOnEvent);
    socket.on('expense_added', refreshOnEvent);
    socket.on('bill_scanned', refreshOnEvent);
    socket.on('family_member_added', refreshOnEvent);
    setLiveSocket(socket);
    return () => {
      socket.disconnect();
      setLiveSocket(null);
    };
  }, [token, user?.id, loadData]);

  const toggleBillPaid = useCallback(async (billId: string) => {
    if (!token) return;
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    const updated = { ...bill, isPaid: !bill.isPaid, status: (bill.isPaid ? 'active' : 'paid') as const };
    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setBills((prev) => prev.map((b) => (b.id === billId ? updated : b)));
    } catch {
      // keep optimistic update or revert
      setBills((prev) => prev.map((b) => (b.id === billId ? updated : b)));
    }
  }, [token, bills]);

  const addReminder = useCallback(async (billData: Omit<Bill, 'id'>) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(token, '/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData),
      });
      if (res.ok) {
        const created = await res.json();
        setBills((prev) => [...prev, created]);
      }
    } catch {
      // optional: add locally with generateId for optimistic UI
    }
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

  const snoozeReminder = useCallback(async (billId: string, days: number) => {
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);
    const updated = bills.find((b) => b.id === billId);
    if (!updated || !token) return;
    const next = { ...updated, status: 'snoozed' as const, snoozedUntil: snoozedUntil.toISOString() };
    try {
      const res = await fetchWithAuth(token, `/api/bills/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) setBills((prev) => prev.map((b) => (b.id === billId ? next : b)));
    } catch {
      setBills((prev) => prev.map((b) => (b.id === billId ? next : b)));
    }
  }, [token, bills]);

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

  const createSmartReminder = useCallback(
    async (textInput: string) => {
      if (!token || !textInput.trim()) return;
      try {
        const res = await fetchWithAuth(token, '/api/reminders/ai-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text_input: textInput.trim() }),
        });
        if (res.ok) {
          await loadData();
        }
      } catch {
        // ignore
      }
    },
    [token, loadData],
  );

  const createVoiceReminder = useCallback(
    async (voiceText: string) => {
      if (!token || !voiceText.trim()) return;
      try {
        let res = await fetchWithAuth(token, '/api/reminders/voice-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: voiceText.trim() }),
        });
        if (!res.ok) {
          res = await fetchWithAuth(token, '/api/voice-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice_text: voiceText.trim() }),
          });
        }
        if (res.ok) {
          await loadData();
        }
      } catch {
        // ignore
      }
    },
    [token, loadData],
  );

  const createSmartCapture = useCallback(
    async (payload: {
      type: 'reminder' | 'bill' | 'task' | 'expense' | 'note';
      input_mode: 'voice' | 'text' | 'photo';
      text_input: string;
    }) => {
      if (!token || !payload.text_input.trim()) return;
      try {
        const res = await fetchWithAuth(token, '/api/life-flow/smart-capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await loadData();
        }
      } catch {
        // ignore
      }
    },
    [token, loadData],
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

  const value = useMemo(
    () => ({
      transactions,
      bills,
      leaks,
      isLoading,
      isSyncingSms,
      smsSyncStatus,
      smsSampleSenders,
      lastSmsReadCount,
      lastSmsSyncCount,
      toggleBillPaid,
      refreshData,
      syncSmsFromDevice,
      monthlyBudget,
      setMonthlyBudget,
      quickAddReminder,
      createSmartReminder,
      createSmartCapture,
      createVoiceReminder,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      reminderSettings,
      updateReminderSettings,
      liveSocket,
    }),
    [
      transactions,
      bills,
      leaks,
      isLoading,
      isSyncingSms,
      smsSyncStatus,
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
      createSmartReminder,
      createSmartCapture,
      createVoiceReminder,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      updateReminderSettings,
      liveSocket,
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
