import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CurrencyOption {
  symbol: string;
  code: string;
  name: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { symbol: '₹', code: 'INR', name: 'Indian Rupee' },
  { symbol: '$', code: 'USD', name: 'US Dollar' },
  { symbol: '€', code: 'EUR', name: 'Euro' },
  { symbol: '£', code: 'GBP', name: 'British Pound' },
  { symbol: '¥', code: 'JPY', name: 'Japanese Yen' },
  { symbol: 'A$', code: 'AUD', name: 'Australian Dollar' },
  { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar' },
];

interface CurrencyContextValue {
  symbol: string;
  code: string;
  setCurrency: (code: string) => void;
  formatAmount: (amount: number) => string;
  formatCompactAmount: (amount: number) => string;
  currentCurrency: CurrencyOption;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = '@lifewise_currency';

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState('INR');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored && CURRENCIES.find(c => c.code === stored)) {
        setCode(stored);
      }
    }).catch(() => {});
  }, []);

  const setCurrency = useCallback((newCode: string) => {
    setCode(newCode);
    AsyncStorage.setItem(STORAGE_KEY, newCode);
  }, []);

  const currentCurrency = useMemo(() =>
    CURRENCIES.find(c => c.code === code) || CURRENCIES[0],
    [code]
  );

  const formatAmount = useCallback((amount: number): string => {
    const sym = CURRENCIES.find(c => c.code === code)?.symbol || '₹';
    if (amount >= 100000) {
      return `${sym}${(amount / 100000).toFixed(1)}L`;
    }
    if (amount >= 1000) {
      return `${sym}${amount.toLocaleString('en-IN')}`;
    }
    return `${sym}${amount}`;
  }, [code]);

  const formatCompactAmount = useCallback((amount: number): string => {
    const sym = CURRENCIES.find(c => c.code === code)?.symbol || '₹';
    
    // For smaller amounts, use standard formatting but maybe less decimals
    if (amount < 10000) {
      return formatAmount(amount);
    }
    
    // For 10k to 99k, use K
    if (amount < 100000) {
      return `${sym}${(amount / 1000).toFixed(1)}K`;
    }
    
    // For 1L and above (specifically for INR)
    if (code === 'INR') {
      if (amount >= 10000000) {
        return `${sym}${(amount / 10000000).toFixed(1)}Cr`;
      }
      return `${sym}${(amount / 100000).toFixed(1)}L`;
    }
    
    // For other currencies, stick to K/M/B
    if (amount >= 1000000000) {
      return `${sym}${(amount / 1000000000).toFixed(1)}B`;
    }
    if (amount >= 1000000) {
      return `${sym}${(amount / 1000000).toFixed(1)}M`;
    }
    return `${sym}${(amount / 1000).toFixed(1)}K`;
  }, [code, formatAmount]);

  const value = useMemo(() => ({
    symbol: currentCurrency.symbol,
    code,
    setCurrency,
    formatAmount,
    formatCompactAmount,
    currentCurrency,
  }), [code, currentCurrency, setCurrency, formatAmount, formatCompactAmount]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
