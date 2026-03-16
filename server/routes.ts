import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { connectMongo, getDb } from './db/mongodb';
import { getFirebaseMessaging } from './firebase-admin';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';

function toId(id: string): ObjectId | string {
  return /^[a-f0-9]{24}$/i.test(String(id)) ? new ObjectId(id) : String(id);
}

type CategoryType = 'food' | 'shopping' | 'transport' | 'entertainment' | 'bills' | 'healthcare' | 'education' | 'investment' | 'others';
type ReminderType = 'bill' | 'subscription' | 'custom';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReminderStatus = 'active' | 'paid' | 'snoozed';

const JWT_SECRET = process.env.JWT_SECRET || 'lifewise-secret-change-in-production';
const JWT_EXPIRY = '7d';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REMINDER_EMAIL_FROM = process.env.REMINDER_EMAIL_FROM || 'LifeWise <no-reply@lifewise.app>';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://lifewise.app';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET = process.env.AWS_S3_BUCKET;

const reminderTemplatePath = path.resolve(process.cwd(), 'server', 'templates', 'reminder-email.html');
const REMINDER_EMAIL_TEMPLATE = fs.existsSync(reminderTemplatePath)
  ? fs.readFileSync(reminderTemplatePath, 'utf-8')
  : '';

type ReminderChannel = 'email' | 'in_app';

const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({ region: AWS_REGION });
const textract = new TextractClient({ region: AWS_REGION });

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

function renderReminderEmailTemplate(params: {
  userName: string;
  reminderType: ReminderType;
  daysLeft: number;
  billName: string;
  dueDateLabel: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  reminderSchedule: string;
  appUrl: string;
}): string {
  if (!REMINDER_EMAIL_TEMPLATE) return '';
  const plural = params.daysLeft === 1 ? '' : 's';
  return REMINDER_EMAIL_TEMPLATE
    .replace(/{{USER_NAME}}/g, params.userName || 'there')
    .replace(/{{REMINDER_TYPE}}/g, params.reminderType || 'bill')
    .replace(/{{DAYS_LEFT}}/g, String(params.daysLeft))
    .replace(/{{DAYS_LEFT_PLURAL}}/g, plural)
    .replace(/{{BILL_NAME}}/g, params.billName)
    .replace(/{{DUE_DATE}}/g, params.dueDateLabel)
    .replace(/{{CATEGORY}}/g, params.category)
    .replace(/{{CURRENCY}}/g, params.currency)
    .replace(/{{AMOUNT}}/g, params.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 }))
    .replace(/{{STATUS}}/g, params.status)
    .replace(/{{REMINDER_SCHEDULE}}/g, params.reminderSchedule)
    .replace(/{{APP_URL}}/g, params.appUrl);
}

async function sendReminderEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[Reminder email] RESEND_API_KEY not set, skipping email send.');
    return;
  }
  if (!opts.html) {
    console.log('[Reminder email] Empty HTML, skipping email send.');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMINDER_EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend email error:', err);
    }
  } catch (e) {
    console.error('Reminder email send error:', e);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await connectMongo();
  const db = getDb();
  const users = db.collection('users');
  const transactions = db.collection('transactions');
  const bills = db.collection('bills');
  const family = db.collection('family_members');
  const otpStore = db.collection('otp_store');
  const notifications = db.collection('notifications');
  const reminderLogs = db.collection('reminder_logs');
  const pushTokens = db.collection('push_tokens');

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

  app.post('/api/auth/oauth/google', async (req, res) => {
    try {
      const { idToken } = req.body as { idToken?: string };
      if (!idToken) {
        return res.status(400).json({ message: 'idToken is required' });
      }

      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (!verifyRes.ok) {
        return res.status(401).json({ message: 'Invalid Google token' });
      }

      const payload = (await verifyRes.json()) as {
        email?: string;
        email_verified?: string;
        name?: string;
        sub?: string;
      };

      const email = payload.email?.toLowerCase().trim();
      if (!email) {
        return res.status(400).json({ message: 'Google account has no email' });
      }

      let user = await users.findOne({ email });
      if (!user) {
        const doc = {
          name: payload.name || email.split('@')[0],
          email,
          passwordHash: null,
          googleSub: payload.sub || null,
          emailVerified: payload.email_verified === 'true',
          createdAt: new Date(),
        };
        const result = await users.insertOne(doc);
        user = { _id: result.insertedId, ...doc } as any;
      }

      const userId = (user as any)._id.toString();
      const token = jwt.sign({ userId, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

      return res.json({
        user: {
          id: userId,
          email: user.email,
          name: user.name,
          phone: (user as any).phone,
          phoneVerified: (user as any).phoneVerified ?? false,
        },
        token,
      });
    } catch (err) {
      console.error('Google OAuth login error:', err);
      return res.status(500).json({ message: 'Server error. Please try again.' });
    }
  });

  app.post('/api/auth/oauth/apple', async (req, res) => {
    try {
      const { appleUserId, email, name } = req.body as {
        appleUserId?: string;
        email?: string;
        name?: string;
      };
      if (!appleUserId) {
        return res.status(400).json({ message: 'appleUserId is required' });
      }

      let user = null;
      if (email) {
        user = await users.findOne({ email: email.toLowerCase().trim() });
      }
      if (!user) {
        user = await users.findOne({ appleUserId });
      }

      if (!user) {
        const finalEmail = email?.toLowerCase().trim() || `${appleUserId}@apple.local`;
        const doc = {
          name: name || 'Apple User',
          email: finalEmail,
          passwordHash: null,
          appleUserId,
          emailVerified: !!email,
          createdAt: new Date(),
        };
        const result = await users.insertOne(doc);
        user = { _id: result.insertedId, ...doc } as any;
      }

      const userId = (user as any)._id.toString();
      const token = jwt.sign({ userId, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

      return res.json({
        user: {
          id: userId,
          email: user.email,
          name: user.name,
          phone: (user as any).phone,
          phoneVerified: (user as any).phoneVerified ?? false,
        },
        token,
      });
    } catch (err) {
      console.error('Apple OAuth login error:', err);
      return res.status(500).json({ message: 'Server error. Please try again.' });
    }
  });

  app.post('/api/push-token', authMiddleware, async (req, res) => {
    try {
      const { token, platform } = req.body as { token?: string; platform?: 'ios' | 'android' | 'web' };
      if (!token) {
        return res.status(400).json({ message: 'token is required' });
      }

      await pushTokens.updateOne(
        { userId: req.userId, token },
        {
          $set: {
            userId: req.userId,
            token,
            platform: platform || 'android',
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('Save push token error:', err);
      return res.status(500).json({ message: 'Server error.' });
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

  // ----- In-app notifications -----
  app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
      const list = await notifications
        .find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      const out = list.map((n) => ({
        id: n._id.toString(),
        type: n.type || 'reminder',
        title: n.title,
        body: n.body,
        read: !!n.read,
        createdAt: n.createdAt,
        meta: n.meta || {},
      }));
      return res.json(out);
    } catch (err) {
      console.error('Get notifications error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/notifications/mark-read', authMiddleware, async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ updated: 0 });
      }
      const objectIds = ids.map((id) => toId(id));
      const result = await notifications.updateMany(
        { _id: { $in: objectIds }, userId: req.userId },
        { $set: { read: true } },
      );
      return res.json({ updated: result.modifiedCount || 0 });
    } catch (err) {
      console.error('Mark notifications read error:', err);
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

  // Scan Bill (image -> OCR -> bill reminder)
  app.post(
    '/api/bills/scan',
    authMiddleware,
    upload.single('image'),
    async (req: any, res: any) => {
      try {
        if (!S3_BUCKET) {
          return res
            .status(500)
            .json({ message: 'S3 bucket not configured. Set AWS_S3_BUCKET.' });
        }
        const file = req.file as Express.Multer.File | undefined;
        if (!file || !file.buffer) {
          return res.status(400).json({ message: 'image file is required' });
        }

        const key = `bills/${req.userId}/${Date.now()}-${file.originalname}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || 'image/jpeg',
          }),
        );

        const texRes = await textract.send(
          new DetectDocumentTextCommand({
            Document: { Bytes: file.buffer },
          }),
        );

        const lines =
          texRes.Blocks?.filter((b) => b.BlockType === 'LINE')
            .map((b) => b.Text || '')
            .filter(Boolean) ?? [];
        const fullText = lines.join('\n');

        let title = lines.find((l) =>
          /bill|invoice|electric/i.test(l),
        ) || 'Scanned Bill';

        let amount = 0;
        const amountMatch =
          fullText.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/i) ||
          fullText.match(/amount[:\s]*₹?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (amountMatch && amountMatch[1]) {
          amount = Number(amountMatch[1].replace(/,/g, '')) || 0;
        }

        let dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const dateMatch =
          fullText.match(/due\s*date[:\s]*([0-9]{1,2}\s+\w+\s+\d{4})/i) ||
          fullText.match(/([0-9]{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i);
        if (dateMatch && dateMatch[1]) {
          const parsed = new Date(dateMatch[1]);
          if (!Number.isNaN(parsed.getTime())) {
            dueDate = parsed;
          }
        }

        const reminderDate = new Date(dueDate.getTime());
        reminderDate.setDate(reminderDate.getDate() - 2);
        reminderDate.setHours(9, 0, 0, 0);

        const doc = {
          userId: req.userId,
          name: title.slice(0, 80),
          amount,
          dueDate: dueDate.toISOString(),
          category: 'bills' as CategoryType,
          isPaid: false,
          icon: 'receipt',
          reminderType: 'bill' as ReminderType,
          repeatType: 'monthly' as RepeatType,
          status: 'active' as ReminderStatus,
          snoozedUntil: undefined,
          reminderDaysBefore: [2, 0],
          source: 'scan_bill',
          imageKey: key,
          imageUrl: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
          createdAt: new Date(),
        };

        const result = await bills.insertOne(doc);
        return res.status(201).json({ id: result.insertedId.toString(), ...doc });
      } catch (err) {
        console.error('Scan bill error:', err);
        return res.status(500).json({ message: 'Server error.' });
      }
    },
  );

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

  // Quick Add reminder from free text
  app.post('/api/reminders/quick-add', authMiddleware, async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ message: 'text is required' });
      }

      let title = text.trim();
      let due = new Date();
      due.setDate(due.getDate() + 1);

      if (OPENAI_API_KEY) {
        try {
          const prompt =
            'You are a reminder parser. Given a natural language reminder in English or Hinglish, ' +
            'extract: title, isoDate (YYYY-MM-DD), and hour (0-23). ' +
            'If no date is mentioned, assume tomorrow. If no time, use 9. ' +
            'Reply ONLY with strict JSON: {"title": "...", "isoDate": "...", "hour": 9}. Input: ' +
            JSON.stringify(text);

          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0,
            }),
          });

          if (aiRes.ok) {
            const json = await aiRes.json();
            const content = json.choices?.[0]?.message?.content;
            if (content) {
              try {
                const parsed = JSON.parse(content);
                if (parsed.title) title = String(parsed.title);
                if (parsed.isoDate) {
                  const parsedDate = new Date(parsed.isoDate);
                  if (!Number.isNaN(parsedDate.getTime())) {
                    due = parsedDate;
                  }
                }
                if (typeof parsed.hour === 'number') {
                  due.setHours(parsed.hour, 0, 0, 0);
                } else {
                  due.setHours(9, 0, 0, 0);
                }
              } catch {
                // ignore JSON parse error, fallback to defaults
              }
            }
          }
        } catch {
          // ignore AI failure, fallback to defaults
        }
      } else {
        due.setHours(9, 0, 0, 0);
      }

      const doc = {
        userId: req.userId,
        name: title.slice(0, 80),
        amount: 0,
        dueDate: due.toISOString(),
        category: 'bills' as CategoryType,
        isPaid: false,
        icon: 'flash',
        reminderType: 'custom' as ReminderType,
        repeatType: 'none' as RepeatType,
        status: 'active' as ReminderStatus,
        snoozedUntil: undefined,
        reminderDaysBefore: [0],
        source: 'quick_add',
        createdAt: new Date(),
      };

      const result = await bills.insertOne(doc);
      return res.status(201).json({ id: result.insertedId.toString(), ...doc });
    } catch (err) {
      console.error('Quick add reminder error:', err);
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
      const settings =
        (user as { settings?: unknown })?.settings || {
          monthlyBudget: 100000,
          reminderSettings: {
            defaultReminderDays: [3, 1, 0],
            soundEnabled: true,
            vibrationEnabled: true,
          },
        };
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

  // ----- AI Assistant (data-aware chat) -----
  app.post('/api/assistant/chat', authMiddleware, async (req, res) => {
    try {
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ message: 'Assistant is not configured. Set OPENAI_API_KEY.' });
      }

      const body = req.body as {
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      };
      const userMessages = Array.isArray(body.messages) ? body.messages : [];

      const [userDoc, recentTx, recentBills, familyMembers] = await Promise.all([
        users.findOne({ _id: toId(req.userId) }),
        transactions.find({ userId: req.userId }).sort({ date: -1 }).limit(50).toArray(),
        bills.find({ userId: req.userId }).limit(20).toArray(),
        family.find({ userId: req.userId }).limit(10).toArray(),
      ]);

      const leakList = await transactions
        .find({ userId: req.userId, isDebit: true })
        .toArray();

      const merchantFreq: Record<string, { count: number; total: number; category: CategoryType }> = {};
      leakList.forEach((t) => {
        if (!merchantFreq[t.merchant]) {
          merchantFreq[t.merchant] = {
            count: 0,
            total: 0,
            category: (t.category as CategoryType) || 'others',
          };
        }
        merchantFreq[t.merchant].count++;
        merchantFreq[t.merchant].total += t.amount;
      });
      const leaksSnapshot = Object.entries(merchantFreq)
        .filter(([, data]) => data.count >= 3)
        .map(([merchant, data]) => ({
          merchant,
          monthlyEstimate: data.total,
          transactionCount: data.count,
          category: data.category,
        }));

      const snapshot = {
        user: {
          id: req.userId,
          name: (userDoc as any)?.name || undefined,
          email: (userDoc as any)?.email || undefined,
        },
        transactions: recentTx.map((t: any) => ({
          amount: t.amount,
          category: t.category,
          merchant: t.merchant,
          date: t.date,
          isDebit: t.isDebit !== false,
        })),
        bills: recentBills.map((b: any) => ({
          name: b.name,
          amount: b.amount,
          dueDate: b.dueDate,
          status: b.status || 'active',
          reminderType: b.reminderType || 'bill',
        })),
        leaks: leaksSnapshot,
        family: familyMembers.map((m: any) => ({
          name: m.name,
          relationship: m.relationship,
          medicinesCount: Array.isArray(m.medicines) ? m.medicines.length : 0,
        })),
      };

      const systemPrompt =
        'You are LifeWise, a financial and life assistant for Indian users. ' +
        'You MUST base advice on the provided JSON snapshot of the user data. ' +
        'Explain in simple, friendly language (you can mix light Hinglish but keep it clear). ' +
        'Never invent transactions or bills. Be concise and practical.';

      const messagesForModel = [
        { role: 'system', content: systemPrompt },
        {
          role: 'system',
          content: `User data snapshot (JSON): ${JSON.stringify(snapshot)}`,
        },
        ...userMessages.filter((m) => m.role === 'user' || m.role === 'assistant'),
      ];

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: messagesForModel,
          temperature: 0.4,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        console.error('OpenAI error:', errText);
        return res.status(500).json({ message: 'Assistant error. Please try again later.' });
      }

      const json = await openAiRes.json();
      const reply =
        json.choices?.[0]?.message?.content ||
        'Sorry, I could not generate a response right now.';

      return res.json({ reply });
    } catch (err) {
      console.error('Assistant chat error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- Family Hub (members + medicines) -----
  app.get('/api/family', authMiddleware, async (req, res) => {
    try {
      const list = await family.find({ userId: req.userId }).toArray();
      const out = list.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        relationship: m.relationship || 'self',
        medicines: Array.isArray(m.medicines) ? m.medicines : [],
      }));
      return res.json(out);
    } catch (err) {
      console.error('Get family error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/family', authMiddleware, async (req, res) => {
    try {
      const { name, relationship } = req.body;
      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }
      const doc = {
        userId: req.userId,
        name: String(name).trim(),
        relationship: String(relationship || 'self'),
        medicines: [] as unknown[],
        createdAt: new Date(),
      };
      const result = await family.insertOne(doc);
      return res.status(201).json({
        id: result.insertedId.toString(),
        name: doc.name,
        relationship: doc.relationship,
        medicines: [],
      });
    } catch (err) {
      console.error('Post family error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.delete('/api/family/:id', authMiddleware, async (req, res) => {
    try {
      const result = await family.deleteOne({ _id: toId(req.params.id), userId: req.userId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Family member not found' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Delete family error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/family/:id/medicines', authMiddleware, async (req, res) => {
    try {
      const memberId = req.params.id;
      const { name, time, frequency } = req.body;
      if (!name) {
        return res.status(400).json({ message: 'Medicine name is required' });
      }
      const medId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const med = {
        id: medId,
        name: String(name).trim(),
        time: String(time || '8:00 AM'),
        frequency: String(frequency || 'Daily'),
        taken: false,
        snoozed: false,
      };
      const result = await family.updateOne(
        { _id: toId(memberId), userId: req.userId },
        { $push: { medicines: med } },
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ message: 'Family member not found' });
      }
      const updated = await family.findOne({ _id: toId(memberId), userId: req.userId });
      if (!updated) {
        return res.status(500).json({ message: 'Failed to load updated member' });
      }
      return res.status(201).json({
        id: updated._id.toString(),
        name: updated.name,
        relationship: updated.relationship,
        medicines: updated.medicines || [],
      });
    } catch (err) {
      console.error('Post family medicine error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.patch('/api/family/:memberId/medicines/:medId', authMiddleware, async (req, res) => {
    try {
      const { memberId, medId } = req.params;
      const { action } = req.body as { action: 'taken' | 'snooze' | 'skip' };
      const member = await family.findOne({ _id: toId(memberId), userId: req.userId });
      if (!member) {
        return res.status(404).json({ message: 'Family member not found' });
      }
      const meds = Array.isArray(member.medicines) ? member.medicines : [];
      const updatedMeds = meds.map((m: any) => {
        if (m.id !== medId) return m;
        if (action === 'taken') return { ...m, taken: true, snoozed: false };
        if (action === 'snooze') return { ...m, snoozed: true };
        if (action === 'skip') return { ...m, taken: false, snoozed: false };
        return m;
      });
      await family.updateOne(
        { _id: toId(memberId), userId: req.userId },
        { $set: { medicines: updatedMeds } },
      );
      const updated = await family.findOne({ _id: toId(memberId), userId: req.userId });
      if (!updated) {
        return res.status(500).json({ message: 'Failed to load updated member' });
      }
      return res.json({
        id: updated._id.toString(),
        name: updated.name,
        relationship: updated.relationship,
        medicines: updated.medicines || [],
      });
    } catch (err) {
      console.error('Patch family medicine error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- Reminder scheduler (email + in-app) -----
  const REMINDER_CHECK_INTERVAL_MS = 60_000;
  const REMINDER_WINDOW_MINUTES = 5;

  function startReminderScheduler() {
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

        const activeBills = await bills
          .find({
            status: { $in: ['active', 'snoozed'] },
            isPaid: { $ne: true },
          })
          .toArray();

        for (const bill of activeBills) {
          try {
            const baseDate = bill.status === 'snoozed' && bill.snoozedUntil ? new Date(bill.snoozedUntil) : new Date(bill.dueDate);
            if (Number.isNaN(baseDate.getTime())) continue;

            const msDiff = baseDate.getTime() - now.getTime();
            const daysLeftRaw = msDiff / (24 * 60 * 60 * 1000);
            const daysLeft = Math.max(0, Math.round(daysLeftRaw));

            const reminderDays: number[] = Array.isArray(bill.reminderDaysBefore) && bill.reminderDaysBefore.length
              ? bill.reminderDaysBefore
              : [3, 1, 0];

            if (!reminderDays.includes(daysLeft)) continue;

            const billTimeWithinWindow =
              baseDate.getTime() >= now.getTime() - 60 * 1000 &&
              baseDate.getTime() <= windowEnd.getTime();

            if (!billTimeWithinWindow && daysLeft !== 0) {
              continue;
            }

            const user = await users.findOne({ _id: bill.userId ? toId(bill.userId) : toId('' + bill.userId) });
            if (!user || !user.email) continue;

            const channels: ReminderChannel[] = ['email', 'in_app'];

            for (const channel of channels) {
              const already = await reminderLogs.findOne({
                userId: user._id?.toString?.() ?? user._id,
                billId: bill._id.toString(),
                channel,
                dayOffset: daysLeft,
              });
              if (already) continue;

              if (channel === 'email') {
                const html = renderReminderEmailTemplate({
                  userName: user.name || user.email,
                  reminderType: bill.reminderType || 'bill',
                  daysLeft,
                  billName: bill.name || 'Bill',
                  dueDateLabel: baseDate.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                  category: bill.category || 'bills',
                  amount: bill.amount || 0,
                  currency: '₹',
                  status: bill.status || 'active',
                  reminderSchedule: (Array.isArray(reminderDays) ? reminderDays : [])
                    .sort((a, b) => a - b)
                    .map((d) => (d === 0 ? 'on due day' : `${d}d before`))
                    .join(', '),
                  appUrl: APP_BASE_URL,
                });

                await sendReminderEmail({
                  to: user.email,
                  subject: `Reminder: ${bill.name || 'Payment'} due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
                  html,
                });
              } else if (channel === 'in_app') {
                const title = bill.name || 'Upcoming payment';
                const body =
                  daysLeft === 0
                    ? `Your ${bill.name || 'payment'} is due today.`
                    : `Your ${bill.name || 'payment'} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;

                const meta = {
                  billId: bill._id.toString(),
                  amount: bill.amount || 0,
                  dueDate: baseDate.toISOString(),
                  reminderType: bill.reminderType || 'bill',
                };

                await notifications.insertOne({
                  userId: user._id?.toString?.() ?? user._id,
                  type: 'reminder',
                  title,
                  body,
                  read: false,
                  createdAt: new Date(),
                  meta,
                });

                const messaging = getFirebaseMessaging();
                if (messaging) {
                  try {
                    const tokenDocs = await pushTokens
                      .find({ userId: user._id?.toString?.() ?? user._id })
                      .project<{ token: string }>({ token: 1, _id: 0 })
                      .toArray();

                    const tokens = tokenDocs.map((t) => t.token).filter(Boolean);

                    if (tokens.length) {
                      await messaging.sendEachForMulticast({
                        tokens,
                        notification: {
                          title,
                          body,
                        },
                        data: {
                          type: 'reminder',
                          billId: meta.billId,
                        },
                      });
                    }
                  } catch (err) {
                    console.error('FCM send error:', err);
                  }
                }
              }

              await reminderLogs.insertOne({
                userId: user._id?.toString?.() ?? user._id,
                billId: bill._id.toString(),
                channel,
                dayOffset: daysLeft,
                sentAt: new Date(),
              });
            }
          } catch (err) {
            console.error('Reminder scheduler per-bill error:', err);
          }
        }
      } catch (err) {
        console.error('Reminder scheduler error:', err);
      } finally {
        running = false;
      }
    }, REMINDER_CHECK_INTERVAL_MS);
  }

  startReminderScheduler();

  const httpServer = createServer(app);
  return httpServer;
}
