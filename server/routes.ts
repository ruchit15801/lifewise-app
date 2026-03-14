import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { connectMongo, getDb } from './db/mongodb';

function toId(id: string): ObjectId | string {
  return /^[a-f0-9]{24}$/i.test(String(id)) ? new ObjectId(id) : String(id);
}

type CategoryType = 'food' | 'shopping' | 'transport' | 'entertainment' | 'bills' | 'healthcare' | 'education' | 'investment' | 'others';
type ReminderType = 'bill' | 'subscription' | 'custom';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReminderStatus = 'active' | 'paid' | 'snoozed';

const JWT_SECRET = process.env.JWT_SECRET || 'lifewise-secret-change-in-production';
const JWT_EXPIRY = '7d';

// SMS stub: logs OTP. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE for real SMS.
async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE;
      const body = `Your LifeWise verification code is: ${otp}. Valid for 10 minutes.`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        body: new URLSearchParams({ To: phone, From: from!, Body: body }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('Twilio SMS error:', err);
      }
    } catch (e) {
      console.error('SMS send error:', e);
    }
  } else {
    console.log(`[SMS OTP] Phone: ${phone}, OTP: ${otp}`);
  }
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface JwtPayload {
  userId: string;
  email: string;
}

function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await connectMongo();
  const db = getDb();
  const users = db.collection('users');
  const transactions = db.collection('transactions');
  const bills = db.collection('bills');
  const otpStore = db.collection('otp_store');

  // ----- Auth -----
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const emailLower = email.toLowerCase().trim();
      const existing = await users.findOne({ email: emailLower });
      if (existing) {
        return res.status(409).json({ message: 'An account with this email already exists' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const doc = {
        name: name.trim(),
        email: emailLower,
        passwordHash,
        createdAt: new Date(),
      };
      const result = await users.insertOne(doc);
      const userId = result.insertedId.toString();
      const userResponse = { id: userId, email: doc.email, name: doc.name };
      const token = jwt.sign({ userId, email: doc.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      return res.status(201).json({ user: userResponse, token });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ message: 'Server error. Please try again.' });
    }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) {
        return res.status(400).json({ message: 'Phone and OTP are required' });
      }
      const record = await otpStore.findOne({ phone: String(phone).trim() });
      if (!record) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }
      const tenMin = 10 * 60 * 1000;
      if (Date.now() - record.createdAt.getTime() > tenMin) {
        await otpStore.deleteOne({ _id: record._id });
        return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
      }
      if (record.otp !== String(otp)) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }
      const uid = toId(String(record.userId));
      await users.updateOne({ _id: uid }, { $set: { phoneVerified: true } });
      await otpStore.deleteOne({ _id: record._id });
      const user = await users.findOne({ _id: uid });
      if (!user) return res.status(500).json({ message: 'User not found' });
      const userId = user._id.toString();
      const token = jwt.sign({ userId, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      return res.json({
        user: { id: userId, email: user.email, name: user.name, phone: user.phone, phoneVerified: true },
        token,
      });
    } catch (err) {
      console.error('Verify OTP error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/auth/resend-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: 'Phone is required' });
      const phoneStr = String(phone).trim();
      const user = await users.findOne({ phone: phoneStr });
      if (!user) return res.status(404).json({ message: 'No account found for this phone' });
      const otp = generateOtp();
      await otpStore.deleteMany({ phone: phoneStr });
      await otpStore.insertOne({ phone: phoneStr, otp, createdAt: new Date(), userId: user._id?.toString?.() ?? user._id });
      await sendSmsOtp(phoneStr, otp);
      return res.json({ message: 'OTP sent' });
    } catch (err) {
      console.error('Resend OTP error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      const user = await users.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const userId = user._id.toString();
      const token = jwt.sign({ userId, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      return res.json({
        user: { id: userId, email: user.email, name: user.name, phone: user.phone, phoneVerified: user.phoneVerified },
        token,
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Server error. Please try again.' });
    }
  });

  app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const user = await users.findOne({ _id: toId(req.userId) });
      if (!user) return res.status(401).json({ message: 'User not found' });
      const uid = (user as { _id: string | { toString: () => string } })._id;
      return res.json({
        user: {
          id: typeof uid === 'string' ? uid : uid.toString(),
          email: user.email,
          name: user.name,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
        },
      });
    } catch (err) {
      console.error('Me error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- Transactions -----
  app.get('/api/transactions', authMiddleware, async (req, res) => {
    try {
      const list = await transactions.find({ userId: req.userId }).sort({ date: -1 }).limit(500).toArray();
      const out = list.map((t) => ({
        id: t._id.toString(),
        merchant: t.merchant,
        amount: t.amount,
        category: t.category,
        date: t.date,
        upiId: t.upiId || '',
        isDebit: t.isDebit !== false,
        description: t.description || '',
      }));
      return res.json(out);
    } catch (err) {
      console.error('Get transactions error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/transactions', authMiddleware, async (req, res) => {
    try {
      const { merchant, amount, category, date, upiId, isDebit, description } = req.body;
      if (!merchant || amount == null) {
        return res.status(400).json({ message: 'merchant and amount are required' });
      }
      const doc = {
        userId: req.userId,
        merchant: String(merchant),
        amount: Number(amount),
        category: (category as CategoryType) || 'others',
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        upiId: upiId || '',
        isDebit: isDebit !== false,
        description: description || '',
      };
      const result = await transactions.insertOne(doc);
      return res.status(201).json({
        id: result.insertedId.toString(),
        ...doc,
      });
    } catch (err) {
      console.error('Post transaction error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // Sync transactions from SMS (app reads SMS, parses, sends here)
  app.post('/api/transactions/sync-from-sms', authMiddleware, async (req, res) => {
    try {
      const { transactions: txs } = req.body;
      if (!Array.isArray(txs) || txs.length === 0) {
        return res.json({ synced: 0, message: 'No transactions to sync' });
      }
      let synced = 0;
      for (const t of txs) {
        const doc = {
          userId: req.userId,
          merchant: String(t.merchant || t.sender || 'Unknown'),
          amount: Number(t.amount) || 0,
          category: (t.category as CategoryType) || 'others',
          date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
          upiId: t.upiId || '',
          isDebit: t.isDebit !== false,
          description: t.description || String(t.message || ''),
        };
        await transactions.insertOne(doc);
        synced++;
      }
      return res.json({ synced, message: `${synced} transaction(s) synced` });
    } catch (err) {
      console.error('Sync from SMS error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- Bills -----
  app.get('/api/bills', authMiddleware, async (req, res) => {
    try {
      const list = await bills.find({ userId: req.userId }).toArray();
      const out = list.map((b) => ({
        id: b._id.toString(),
        name: b.name,
        amount: b.amount,
        dueDate: b.dueDate,
        category: b.category || 'bills',
        isPaid: b.isPaid || false,
        icon: b.icon || 'flash',
        reminderType: (b.reminderType as ReminderType) || 'bill',
        repeatType: (b.repeatType as RepeatType) || 'monthly',
        status: (b.status as ReminderStatus) || 'active',
        snoozedUntil: b.snoozedUntil,
        reminderDaysBefore: b.reminderDaysBefore || [3, 1, 0],
      }));
      return res.json(out);
    } catch (err) {
      console.error('Get bills error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/bills', authMiddleware, async (req, res) => {
    try {
      const body = req.body;
      const doc = {
        userId: req.userId,
        name: body.name || 'Bill',
        amount: Number(body.amount) || 0,
        dueDate: body.dueDate || new Date().toISOString(),
        category: (body.category as CategoryType) || 'bills',
        isPaid: !!body.isPaid,
        icon: body.icon || 'flash',
        reminderType: (body.reminderType as ReminderType) || 'bill',
        repeatType: (body.repeatType as RepeatType) || 'monthly',
        status: (body.status as ReminderStatus) || 'active',
        snoozedUntil: body.snoozedUntil,
        reminderDaysBefore: Array.isArray(body.reminderDaysBefore) ? body.reminderDaysBefore : [3, 1, 0],
      };
      const result = await bills.insertOne(doc);
      return res.status(201).json({ id: result.insertedId.toString(), ...doc });
    } catch (err) {
      console.error('Post bill error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.put('/api/bills/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body;
      const update: any = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.amount !== undefined) update.amount = Number(body.amount);
      if (body.dueDate !== undefined) update.dueDate = body.dueDate;
      if (body.category !== undefined) update.category = body.category;
      if (body.isPaid !== undefined) update.isPaid = body.isPaid;
      if (body.icon !== undefined) update.icon = body.icon;
      if (body.reminderType !== undefined) update.reminderType = body.reminderType;
      if (body.repeatType !== undefined) update.repeatType = body.repeatType;
      if (body.status !== undefined) update.status = body.status;
      if (body.snoozedUntil !== undefined) update.snoozedUntil = body.snoozedUntil;
      if (body.reminderDaysBefore !== undefined) update.reminderDaysBefore = body.reminderDaysBefore;
      const result = await bills.updateOne({ _id: toId(id), userId: req.userId }, { $set: update });
      if (result.matchedCount === 0) return res.status(404).json({ message: 'Bill not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Put bill error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.delete('/api/bills/:id', authMiddleware, async (req, res) => {
    try {
      const result = await bills.deleteOne({ _id: toId(req.params.id), userId: req.userId });
      if (result.deletedCount === 0) return res.status(404).json({ message: 'Bill not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Delete bill error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- Leaks (computed from transactions) -----
  const LEAK_SUGGESTIONS: Record<string, string> = {
    Swiggy: 'Cook at home 3x a week to save more',
    Zomato: 'Limit food delivery to weekends only',
    Starbucks: 'Try brewing coffee at home',
    'Chai Point': 'Make chai at home and carry a flask',
    Uber: 'Use public transport for short distances',
    Ola: 'Consider carpooling or metro for daily commute',
    Netflix: 'Share with family to split costs',
    Spotify: 'Use the free tier or student discount',
    BookMyShow: 'Look for early bird or weekday discounts',
    Amazon: 'Use a wishlist and wait for sales',
  };

  app.get('/api/leaks', authMiddleware, async (req, res) => {
    try {
      const list = await transactions.find({ userId: req.userId, isDebit: true }).toArray();
      const merchantFreq: Record<string, { count: number; total: number; category: CategoryType }> = {};
      list.forEach((t) => {
        if (!merchantFreq[t.merchant]) {
          merchantFreq[t.merchant] = { count: 0, total: 0, category: (t.category as CategoryType) || 'others' };
        }
        merchantFreq[t.merchant].count++;
        merchantFreq[t.merchant].total += t.amount;
      });
      const leaks: any[] = [];
      Object.entries(merchantFreq).forEach(([merchant, data]) => {
        if (data.count >= 3) {
          const freq = data.count >= 15 ? 'Daily' : data.count >= 8 ? 'Frequently' : 'Weekly';
          leaks.push({
            id: new ObjectId().toString(),
            merchant,
            category: data.category,
            frequency: freq,
            monthlyEstimate: Math.round(data.total),
            transactionCount: data.count,
            suggestion: LEAK_SUGGESTIONS[merchant] || 'Review if this expense is necessary',
          });
        }
      });
      leaks.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
      return res.json(leaks);
    } catch (err) {
      console.error('Get leaks error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // User settings (budget, reminder settings) - optional storage in users or separate collection
  app.get('/api/settings', authMiddleware, async (req, res) => {
    try {
      const user = await users.findOne({ _id: toId(req.userId) });
      const settings = (user as { settings?: unknown })?.settings || { monthlyBudget: 50000, reminderSettings: { defaultReminderDays: [3, 1, 0], soundEnabled: true, vibrationEnabled: true } };
      return res.json(settings);
    } catch (err) {
      console.error('Get settings error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.put('/api/settings', authMiddleware, async (req, res) => {
    try {
      const { monthlyBudget, reminderSettings } = req.body;
      const update: any = {};
      if (monthlyBudget != null) update['settings.monthlyBudget'] = Number(monthlyBudget);
      if (reminderSettings) update['settings.reminderSettings'] = reminderSettings;
      await users.updateOne({ _id: toId(req.userId) }, { $set: update });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Put settings error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
