import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Transaction,
  Bill,
  MoneyLeak,
  generateTransactions,
  generateBills,
  generateLeaks,
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
}

const ExpenseContext = createContext<ExpenseContextValue | null>(null);

const STORAGE_KEYS = {
  TRANSACTIONS: '@spendiq_transactions',
  BILLS: '@spendiq_bills',
  BUDGET: '@spendiq_budget',
  INITIALIZED: '@spendiq_initialized',
};

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyBudget, setMonthlyBudgetState] = useState(50000);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const initialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);

      if (initialized) {
        const [txData, billData, budgetData] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
          AsyncStorage.getItem(STORAGE_KEYS.BILLS),
          AsyncStorage.getItem(STORAGE_KEYS.BUDGET),
        ]);

        if (txData) setTransactions(JSON.parse(txData));
        if (billData) setBills(JSON.parse(billData));
        if (budgetData) setMonthlyBudgetState(JSON.parse(budgetData));
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

  const toggleBillPaid = async (billId: string) => {
    const updated = bills.map(b =>
      b.id === billId ? { ...b, isPaid: !b.isPaid } : b
    );
    setBills(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(updated));
  };

  const refreshData = async () => {
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
  };

  const setMonthlyBudget = async (budget: number) => {
    setMonthlyBudgetState(budget);
    await AsyncStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(budget));
  };

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
  }), [transactions, bills, leaks, isLoading, monthlyBudget]);

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
