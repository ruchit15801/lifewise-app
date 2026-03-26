import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SeniorContextType {
  isSeniorMode: boolean;
  setSeniorMode: (enabled: boolean) => Promise<void>;
}

const SeniorContext = createContext<SeniorContextType>({
  isSeniorMode: false,
  setSeniorMode: async () => {},
});

const STORAGE_KEY = '@lifewise_senior_mode';

export const SeniorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSeniorMode, setIsSeniorModeState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'true') {
        setIsSeniorModeState(true);
      }
    });
  }, []);

  const setSeniorMode = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
      setIsSeniorModeState(enabled);
    } catch (e) {
      console.error('Failed to save senior mode preference', e);
    }
  };

  return (
    <SeniorContext.Provider value={{ isSeniorMode, setSeniorMode }}>
      {children}
    </SeniorContext.Provider>
  );
};

export const useSeniorMode = () => useContext(SeniorContext);
