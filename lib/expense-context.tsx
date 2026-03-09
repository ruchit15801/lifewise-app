import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Transaction,
  Bill,
  MoneyLeak,
  ReminderSettings,
  generateTransactions,
  generateBills,
  generateLeaks,
  generateId,
  DEFAULT_REMINDER_SETTINGS,
} from './data';

interface ExpenseContextValue {
  transactions: Transaction[];
  bills: Bill[];
  leaks: MoneyLeak[];
  isLoading: boolean;
  toggleBillPaid: (billId: string) => void;
  refreshData: () => void;
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

const STORAGE_KEYS = {
  TRANSACTIONS: '@spendiq_transactions',
  BILLS: '@spendiq_bills_v2',
  BUDGET: '@spendiq_budget',
  INITIALIZED: '@spendiq_initialized_v2',
  REMINDER_SETTINGS: '@spendiq_reminder_settings',
};

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyBudget, setMonthlyBudgetState] = useState(50000);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const initialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);

      if (initialized) {
        const [txData, billData, budgetData, settingsData] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
          AsyncStorage.getItem(STORAGE_KEYS.BILLS),
          AsyncStorage.getItem(STORAGE_KEYS.BUDGET),
          AsyncStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS),
        ]);

        if (txData) setTransactions(JSON.parse(txData));
        if (billData) setBills(JSON.parse(billData));
        if (budgetData) setMonthlyBudgetState(JSON.parse(budgetData));
        if (settingsData) setReminderSettings(JSON.parse(settingsData));
      } else {
        const txs = generateTransactions(30);
        const bls = generateBills();

        setTransactions(txs);
        setBills(bls);

        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs)),
          AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bls)),
          AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true'),
        ]);
      }
    } catch (e) {
      const txs = generateTransactions(30);
      const bls = generateBills();
      setTransactions(txs);
      setBills(bls);
    } finally {
      setIsLoading(false);
    }
  };

  const saveBills = useCallback(async (updated: Bill[]) => {
    setBills(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
  }, []);

  const toggleBillPaid = useCallback(async (billId: string) => {
    setBills(prev => {
      const updated = prev.map(b =>
        b.id === billId ? { ...b, isPaid: !b.isPaid, status: b.isPaid ? 'active' as const : 'paid' as const } : b
      );
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addReminder = useCallback(async (billData: Omit<Bill, 'id'>) => {
    const newBill: Bill = { ...billData, id: generateId() };
    setBills(prev => {
      const updated = [...prev, newBill];
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const editReminder = useCallback(async (updatedBill: Bill) => {
    setBills(prev => {
      const updated = prev.map(b => b.id === updatedBill.id ? updatedBill : b);
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteReminder = useCallback(async (billId: string) => {
    setBills(prev => {
      const updated = prev.filter(b => b.id !== billId);
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const snoozeReminder = useCallback(async (billId: string, days: number) => {
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);
    setBills(prev => {
      const updated = prev.map(b =>
        b.id === billId ? { ...b, status: 'snoozed' as const, snoozedUntil: snoozedUntil.toISOString() } : b
      );
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    const txs = generateTransactions(30);
    const bls = generateBills();
    setTransactions(txs);
    setBills(bls);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs)),
      AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bls)),
      AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true'),
    ]);
    setIsLoading(false);
  }, []);

  const setMonthlyBudget = useCallback(async (budget: number) => {
    setMonthlyBudgetState(budget);
    await AsyncStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(budget));
  }, []);

  const updateReminderSettings = useCallback(async (settings: ReminderSettings) => {
    setReminderSettings(settings);
    await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(settings));
  }, []);

  const leaks = useMemo(() => generateLeaks(transactions), [transactions]);

  const value = useMemo(() => ({
    transactions,
    bills,
    leaks,
    isLoading,
    toggleBillPaid,
    refreshData,
    monthlyBudget,
    setMonthlyBudget,
    addReminder,
    editReminder,
    deleteReminder,
    snoozeReminder,
    reminderSettings,
    updateReminderSettings,
  }), [transactions, bills, leaks, isLoading, monthlyBudget, reminderSettings, toggleBillPaid, refreshData, setMonthlyBudget, addReminder, editReminder, deleteReminder, snoozeReminder, updateReminderSettings]);

  return (
    <ExpenseContext.Provider value={value}>
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpenses() {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error('useExpenses must be used within an ExpenseProvider');
  }
  return context;
}
