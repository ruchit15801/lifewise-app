/**
 * Read SMS from device (Android). Uses native module when available.
 * On web/iOS or when permission denied, returns [] so sync flow still runs.
 * For Android inbox: add react-native-get-sms-android and use dev build.
 */

import { Platform, PermissionsAndroid } from 'react-native';

export interface RawSms {
  body: string;
  date?: number | string;
  address?: string;
  _id?: string;
}

/** Request SMS permission (Android). Returns true if granted. */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'Allow LifeWise to read SMS for auto tracking',
        message: 'We use SMS messages from your bank to auto-detect transactions. No messages are stored on our servers beyond transaction info.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    // Permission request failed
  }
  return false;
}

/** Read recent SMS from inbox. Returns [] on web, iOS, or when module/permission unavailable. */
export async function readSmsFromDevice(maxCount: number = 200): Promise<RawSms[]> {
  if (Platform.OS !== 'android') return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    const SmsAndroid = require('react-native-get-sms-android');
    const filter = { box: 'inbox', maxCount };
    const list = await new Promise<RawSms[]>((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => reject(new Error(fail)),
        (_count: number, smsList: string) => {
          try {
            const arr = JSON.parse(smsList || '[]');
            resolve(
              Array.isArray(arr)
                ? arr.map((s: { body?: string; date?: number; address?: string }) => ({
                    body: String(s.body ?? ''),
                    date: s.date,
                    address: s.address,
                  }))
                : []
            );
          } catch {
            resolve([]);
          }
        }
      );
    });
    return list.filter((s) => (s.body || '').trim().length > 0);
  } catch {
    return [];
  }
}
