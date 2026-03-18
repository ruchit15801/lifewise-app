import * as Device from 'expo-device';
import Constants from "expo-constants";
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

let handlerConfigured = false;

async function getNotificationsModule() {
  // Expo Go (especially Android, SDK 53+) no longer supports expo-notifications
  // for remote push tokens and now throws a hard runtime error when the module
  // is imported. To keep the app running in Expo Go, never import the module
  // at all in that environment and simply no-op all notification features.
  if (isExpoGo()) {
    console.log("[Push] Notifications module disabled in Expo Go (using no-op implementation).");
    return null;
  }

  try {
    const mod = await import("expo-notifications");
    if (!handlerConfigured) {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }
    return mod;
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(token: string | null) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    console.log("[Push] Notifications not available in this client (Expo Go or unsupported runtime).");
    return;
  }

  if (!Device.isDevice) {
    console.log('[Push] Not running on a physical device, skipping push registration.');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Notification permissions not granted');
    return;
  }

  // In Expo Go, remote push token fetching is not supported on Android (SDK 53+).
  if (isExpoGo()) {
    console.log("[Push] Skipping remote push token registration in Expo Go.");
    return;
  }

  const expoToken = (await Notifications.getExpoPushTokenAsync()).data;

  if (!token) {
    return expoToken;
  }

  try {
    const baseUrl = getApiUrl();
    const url = new URL('/api/push-token', baseUrl).toString();

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token: expoToken,
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
      }),
    });
  } catch (e) {
    console.log('[Push] Failed to register push token', e);
  }

  return expoToken;
}

export async function addNotificationResponseReceivedListener(
  listener: Parameters<(typeof import("expo-notifications"))["addNotificationResponseReceivedListener"]>[0],
) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function scheduleLocalNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, any>;
  triggerAt: Date;
}) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body,
      data: opts.data || {},
    },
    trigger: opts.triggerAt,
  });
}

