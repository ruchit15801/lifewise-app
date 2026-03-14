# LifeWise

Backend (Node.js + MongoDB) and Expo app. Run everything from project root.

## Run from root (one command)

```bash
npm install
npm run dev
```

This starts the **backend** (port 5000) and **Expo** together. Open the app in browser/emulator/device.

## Or run in two terminals

**Terminal 1 – backend**
```bash
npm run server:dev
```
Wait until you see: `LifeWise backend: http://127.0.0.1:5000`

**Terminal 2 – app**
```bash
npm start
```

## If you see "Network error" on Create Account

1. **Backend running?** In a terminal run `npm run server:dev` and keep it open.
2. **Same PC (browser / web):** In `.env` set:
   ```env
   EXPO_PUBLIC_DOMAIN=127.0.0.1:5000
   ```
   Restart Expo after changing `.env`: stop with Ctrl+C, then `npm start` again.
3. **Phone on same WiFi:** In `.env` set `EXPO_PUBLIC_DOMAIN` to your computer’s IP and port, e.g.:
   ```env
   EXPO_PUBLIC_DOMAIN=192.168.1.5:5000
   ```
   (Replace with your PC’s IP from `ipconfig` or network settings.)
4. **Android emulator:** Use:
   ```env
   EXPO_PUBLIC_DOMAIN=10.0.2.2:5000
   ```

## SMS auto-sync (Android)

After sign in, the app syncs data from the API and can read SMS from the device to add transactions:

1. **Flow:** Sign in → Dashboard opens → “Syncing SMS” runs → data loads from API → if Android and permission granted, app reads SMS → parses UPI/bank messages → sends to `POST /api/transactions/sync-from-sms` → dashboard shows all data (including new transactions from SMS).
2. **Pull to refresh** on the dashboard also runs this SMS sync.
3. **To read SMS on Android:** Install `react-native-get-sms-android` and use a **development build** (Expo Go does not support this native module). Without it, sync still runs and shows API data; SMS read is skipped and returns no new items.

## Environment

Copy `.env.example` to `.env` and set:

- `PORT` – backend port (default 5000)
- `MONGODB_URI` – MongoDB URL (optional; in-memory store used if not set or connection fails)
- `JWT_SECRET` – secret for auth tokens
- `EXPO_PUBLIC_DOMAIN` – API URL for the app (see above)
