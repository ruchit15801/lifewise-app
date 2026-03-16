import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(token: string | null) {
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

