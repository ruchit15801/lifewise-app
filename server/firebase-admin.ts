import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';

let app: admin.app.App | null = null;

export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  if (app) {
    return admin.messaging();
  }

  const saPath = path.resolve(process.cwd(), 'server', 'firebase-service-account.json');

  if (!fs.existsSync(saPath)) {
    console.warn('[FCM] Service account file not found at server/firebase-service-account.json. Push notifications disabled.');
    return null;
  }

  const raw = fs.readFileSync(saPath, 'utf8');
  const serviceAccount = JSON.parse(raw);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });

  return admin.messaging();
}

