import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '@/lib/query-client';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  phoneVerified?: boolean;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasOnboarded: boolean;
  completeOnboarding: () => void;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEYS = {
  USER: '@lifewise_user',
  TOKEN: '@lifewise_token',
  ONBOARDED: '@lifewise_onboarded',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  WebBrowser.maybeCompleteAuthSession();

  const [googleRequest, , googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  });

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const [storedUser, storedToken, storedOnboarded] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDED),
      ]);
      if (storedUser) setUser(JSON.parse(storedUser));
      if (storedToken) setToken(storedToken);
      if (storedOnboarded === 'true') setHasOnboarded(true);
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
      setToken(data.token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Check backend is running and EXPO_PUBLIC_DOMAIN (e.g. 127.0.0.1:5000 or your PC IP).' };
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
      setToken(data.token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Network error. Check backend is running and EXPO_PUBLIC_DOMAIN (e.g. 127.0.0.1:5000 or your PC IP).' };
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.USER),
      AsyncStorage.removeItem(STORAGE_KEYS.TOKEN),
    ]);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      if (!googleRequest) {
        return { success: false, error: 'Google config missing' };
      }

      const result = await googlePromptAsync();
      if (result.type !== 'success') {
        return { success: false, error: 'Google login cancelled' };
      }

      const authResult = result as AuthSession.AuthSessionResult & { params?: any };
      const idToken = authResult.params?.id_token;
      if (!idToken) {
        return { success: false, error: 'No id_token from Google' };
      }

      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/oauth/google', baseUrl).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Google login failed' };
      }

      setUser(data.user);
      setToken(data.token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      return { success: true };
    } catch {
      return { success: false, error: 'Google login error' };
    }
  }, [googleRequest, googlePromptAsync]);

  const loginWithApple = useCallback(async () => {
    return { success: false, error: 'Apple login is disabled' };
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
  }, []);

  const value = useMemo(() => ({
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    hasOnboarded,
    completeOnboarding,
    loginWithGoogle,
    loginWithApple,
  }), [user, token, isLoading, hasOnboarded, login, register, logout, completeOnboarding, loginWithGoogle, loginWithApple]);

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
