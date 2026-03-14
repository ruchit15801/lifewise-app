import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Transaction,
  Bill,
  MoneyLeak,
  ReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
} from './data';
import { getApiUrl } from './query-client';
import { useAuth } from './auth-context';
import { readSmsFromDevice } from './sms-reader';
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
  toggleBillPaid: (billId: string) => void;
  refreshData: () => void;
  syncSmsFromDevice: () => Promise<void>;
  monthlyBudget: number;
  setMonthlyBudget: (budget: number) => void;
  addReminder: (bill: Omit<Bill, 'id'>) => void;
  editReminder: (bill: Bill) => void;
  deleteReminder: (billId: string) => void;
  snoozeReminder: (billId: string, days: number) => void;
  reminderSettings: ReminderSettings;
  updateReminderSettings: (settings: ReminderSettings) => void;
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
  const [monthlyBudget, setMonthlyBudgetState] = useState(50000);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);

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
    try {
      const rawSms = await readSmsFromDevice(200);
      const parsed = parseSmsToTransactions(rawSms);
      if (parsed.length > 0) {
        const res = await fetchWithAuth(token, '/api/transactions/sync-from-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions: parsed.map((p) => ({
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
        if (res.ok) await loadData();
      } else {
        await loadData();
      }
    } catch {
      await loadData();
    } finally {
      setIsSyncingSms(false);
    }
  }, [token, loadData]);

  useEffect(() => {
    loadData().then(() => syncSmsFromDevice());
  }, [loadData, syncSmsFromDevice]);

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

  const refreshData = useCallback(async () => {
    await loadData();
    await syncSmsFromDevice();
  }, [loadData, syncSmsFromDevice]);

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
      toggleBillPaid,
      refreshData,
      syncSmsFromDevice,
      monthlyBudget,
      setMonthlyBudget,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      reminderSettings,
      updateReminderSettings,
    }),
    [
      transactions,
      bills,
      leaks,
      isLoading,
      isSyncingSms,
      monthlyBudget,
      reminderSettings,
      toggleBillPaid,
      refreshData,
      syncSmsFromDevice,
      setMonthlyBudget,
      addReminder,
      editReminder,
      deleteReminder,
      snoozeReminder,
      updateReminderSettings,
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
