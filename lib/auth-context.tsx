import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '@/lib/query-client';

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasOnboarded: boolean;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEYS = {
  USER: '@spendiq_user',
  TOKEN: '@spendiq_token',
  ONBOARDED: '@spendiq_onboarded',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const [storedUser, storedOnboarded] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDED),
      ]);

      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      if (storedOnboarded === 'true') {
        setHasOnboarded(true);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/login', baseUrl).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Login failed' };
      }
      setUser(data.user);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      if (data.token) {
        await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/register', baseUrl).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Registration failed' };
      }
      setUser(data.user);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      if (data.token) {
        await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.USER),
      AsyncStorage.removeItem(STORAGE_KEYS.TOKEN),
    ]);
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
  }, []);

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    hasOnboarded,
    completeOnboarding,
  }), [user, isLoading, hasOnboarded, login, register, logout, completeOnboarding]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
