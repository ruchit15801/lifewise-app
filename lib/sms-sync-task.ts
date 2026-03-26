// import * as BackgroundFetch from 'expo-background-fetch';
// import * as TaskManager from 'expo-task-manager';
import { readSmsFromDeviceWithMeta } from './sms-reader';
import { parseSmsToTransactions } from './parse-sms';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getApiUrl } from './query-client';

const SMS_SYNC_TASK = 'SMS_SYNC_TASK';
const LAST_SYNC_TIMESTAMP_KEY = 'last_sms_sync_timestamp';

/**
 * Core logic for syncing SMS. 
 * Can be called from foreground (ExpenseContext) or background (TaskManager).
 */
export async function performSmsSync(token: string) {
  if (Platform.OS !== 'android' || !token) return { success: false, synced: 0 };

  try {
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_TIMESTAMP_KEY);
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    
    // Read slightly more in background to catch up
    const smsResult = await readSmsFromDeviceWithMeta(200);
    const rawSms = smsResult.messages || [];
    
    // Filter by date to avoid re-parsing old stuff locally (though backend also deduplicates)
    const newSms = rawSms.filter(s => {
      const d = typeof s.date === 'number' ? s.date : (s.date ? new Date(s.date).getTime() : 0);
      return d > lastSyncTime;
    });

    if (newSms.length === 0) return { success: true, synced: 0 };

    const parsed = parseSmsToTransactions(newSms);
    if (parsed.length === 0) return { success: true, synced: 0 };

    // Send to backend
    const API_URL = getApiUrl();
    const res = await fetch(`${API_URL}/api/transactions/sync-from-sms`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ transactions: parsed }),
    });

    if (res.ok) {
      const latestSmsTime = Math.max(...newSms.map(s => typeof s.date === 'number' ? s.date : (s.date ? new Date(s.date).getTime() : 0)));
      await AsyncStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, String(latestSmsTime));
      const json = await res.json();
      return { success: true, synced: json.synced, skipped: json.skipped };
    }
    
    return { success: false, synced: 0 };
  } catch (err) {
    console.error('[BackgroundSync] Error:', err);
    return { success: false, synced: 0 };
  }
}

/*
// Define the task
if (Platform.OS !== 'web') {
  TaskManager.defineTask(SMS_SYNC_TASK, async () => {
    try {
      const token = await AsyncStorage.getItem('@lifewise_token'); 
      if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

      const result = await performSmsSync(token);
      if (result.success && result.synced > 0) {
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (err) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerSmsSyncTask() {
  if (Platform.OS !== 'android') return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SMS_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(SMS_SYNC_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[BackgroundSync] Task registered successfully');
    }
  } catch (err) {
    console.error('[BackgroundSync] Registration failed:', err);
  }
}
*/

export async function registerSmsSyncTask() {
  console.log('[BackgroundSync] Background sync disabled in this build.');
}
