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
const APP_OPEN_URL = process.env.APP_OPEN_URL || APP_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || 'asst_WmTjqjLyo3ki1MFHtqDtal6R';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

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

function getOpenAIKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPENAI_TOKEN ||
    process.env.OPEN_AI_API_KEY
  );
}

async function parseReminderWithAI(text: string): Promise<{
  title: string;
  isoDate: string; // YYYY-MM-DD
  hour: number; // 0-23
  minute: number; // 0-59
  repeatType: RepeatType;
  reminderType: ReminderType;
}> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultIso = tomorrow.toISOString().slice(0, 10);

  const openAIKey = getOpenAIKey();
  if (!openAIKey) {
    return {
      title: text.trim().slice(0, 80) || 'Reminder',
      isoDate: defaultIso,
      hour: 9,
      minute: 0,
      repeatType: 'none',
      reminderType: 'custom',
    };
  }

  const prompt =
    'You are a reminder parser for a mobile app. Given a natural language reminder in ANY language (including Hindi and Gujarati), extract:\n' +
    '- title (short)\n' +
    '- isoDate (YYYY-MM-DD)\n' +
    '- hour (0-23)\n' +
    '- minute (0-59)\n' +
    '- repeatType one of: none,daily,weekly,monthly,yearly\n' +
    '- reminderType one of: bill,subscription,custom\n' +
    'Rules:\n' +
    '- If no date mentioned, assume tomorrow.\n' +
    '- If no time mentioned, use 9:00.\n' +
    '- If user says "every day"/"daily" etc, set repeatType accordingly.\n' +
    '- If text mentions bill/payment, set reminderType=bill. If subscription, reminderType=subscription. Else custom.\n' +
    'Return ONLY strict JSON with keys: title, isoDate, hour, minute, repeatType, reminderType.\n' +
    'Input: ' +
    JSON.stringify(text);

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    if (!aiRes.ok) throw new Error('openai_parse_failed');
    const json = await aiRes.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai_empty');
    const parsed = JSON.parse(content);

    const title = String(parsed.title || text).trim().slice(0, 80) || 'Reminder';
    const isoDate = String(parsed.isoDate || defaultIso).slice(0, 10);
    const hour = Math.max(0, Math.min(23, Number(parsed.hour)));
    const minute = Math.max(0, Math.min(59, Number(parsed.minute)));
    const repeatType = (String(parsed.repeatType || 'none') as RepeatType) || 'none';
    const reminderType = (String(parsed.reminderType || 'custom') as ReminderType) || 'custom';

    return {
      title,
      isoDate,
      hour: Number.isFinite(hour) ? hour : 9,
      minute: Number.isFinite(minute) ? minute : 0,
      repeatType: (['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).includes(repeatType)
        ? repeatType
        : 'none',
      reminderType: (['bill', 'subscription', 'custom'] as const).includes(reminderType)
        ? reminderType
        : 'custom',
    };
  } catch {
    return {
      title: text.trim().slice(0, 80) || 'Reminder',
      isoDate: defaultIso,
      hour: 9,
      minute: 0,
      repeatType: 'none',
      reminderType: 'custom',
    };
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
  const supportTickets = db.collection('support_tickets');

  // Seed a stable demo login for QA / demos.
  const demoEmail = 'demo@lifewise.test';
  const demoPassword = process.env.DEMO_USER_PASSWORD || 'Radhe@1415';
  const demoName = 'Demo User';
  let demoUserId: string | null = null;
  try {
    const existingDemo = await users.findOne({ email: demoEmail });
    const demoPasswordHash = await bcrypt.hash(demoPassword, 10);
    if (!existingDemo) {
      const created = await users.insertOne({
        name: demoName,
        email: demoEmail,
        passwordHash: demoPasswordHash,
        createdAt: new Date(),
        phone: '+919999000111',
        phoneVerified: true,
        settings: {
          monthlyBudget: 45000,
          reminderSettings: { defaultReminderDays: [7, 3, 1, 0], soundEnabled: true, vibrationEnabled: true },
        },
      });
      demoUserId = created.insertedId.toString();
      console.log('[seed] demo user created:', demoEmail);
    } else {
      await users.updateOne(
        { _id: existingDemo._id },
        {
          $set: {
            name: demoName,
            passwordHash: demoPasswordHash,
            phone: (existingDemo as any).phone || '+919999000111',
            phoneVerified: true,
            settings: {
              monthlyBudget: 45000,
              reminderSettings: { defaultReminderDays: [7, 3, 1, 0], soundEnabled: true, vibrationEnabled: true },
            },
          },
        },
      );
      demoUserId = existingDemo._id?.toString?.() ?? String(existingDemo._id);
      console.log('[seed] demo user refreshed:', demoEmail);
    }
  } catch (e) {
    console.error('[seed] demo user failed:', e);
  }

  // Seed realistic static data for the demo user so all flows can be tested.
  if (demoUserId) {
    try {
      const now = new Date();
      const mkDate = (daysOffset: number, hour = 10, minute = 0) => {
        const d = new Date(now);
        d.setDate(d.getDate() + daysOffset);
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
      };

      await Promise.all([
        transactions.deleteMany({ userId: demoUserId, source: 'demo-seed' } as any),
        bills.deleteMany({ userId: demoUserId, source: 'demo-seed' } as any),
        notifications.deleteMany({ userId: demoUserId, source: 'demo-seed' } as any),
        family.deleteMany({ userId: demoUserId, source: 'demo-seed' } as any),
      ]);

      await transactions.insertMany([
        { userId: demoUserId, merchant: 'Swiggy', amount: 380, category: 'food', date: mkDate(-1, 20, 15), upiId: 'swiggy@upi', isDebit: true, description: 'Dinner order', source: 'demo-seed' },
        { userId: demoUserId, merchant: 'Uber', amount: 240, category: 'transport', date: mkDate(-2, 9, 20), upiId: 'uber@upi', isDebit: true, description: 'Office commute', source: 'demo-seed' },
        { userId: demoUserId, merchant: 'Netflix', amount: 649, category: 'entertainment', date: mkDate(-3, 8, 0), upiId: 'netflix@upi', isDebit: true, description: 'Monthly subscription', source: 'demo-seed' },
        { userId: demoUserId, merchant: 'Apollo Pharmacy', amount: 1120, category: 'healthcare', date: mkDate(-4, 18, 45), upiId: 'apollo@upi', isDebit: true, description: 'Medicines', source: 'demo-seed' },
        { userId: demoUserId, merchant: 'Salary Credit', amount: 85000, category: 'others', date: mkDate(-8, 10, 0), upiId: 'employer@hdfcbank', isDebit: false, description: 'Monthly salary', source: 'demo-seed' },
      ] as any[]);

      await bills.insertMany([
        { userId: demoUserId, name: 'Electricity Bill', amount: 2350, dueDate: mkDate(0, 20, 0), category: 'bills', isPaid: false, icon: 'flash', reminderType: 'bill', repeatType: 'monthly', status: 'active', reminderDaysBefore: [3, 1, 0], source: 'demo-seed' },
        { userId: demoUserId, name: 'Netflix Premium', amount: 649, dueDate: mkDate(2, 9, 0), category: 'entertainment', isPaid: false, icon: 'refresh', reminderType: 'subscription', repeatType: 'monthly', status: 'active', reminderDaysBefore: [2, 1, 0], source: 'demo-seed' },
        { userId: demoUserId, name: 'Health Checkup', amount: 0, dueDate: mkDate(1, 7, 30), category: 'healthcare', isPaid: false, icon: 'medkit', reminderType: 'custom', repeatType: 'yearly', status: 'active', reminderDaysBefore: [7, 1, 0], source: 'demo-seed' },
        { userId: demoUserId, name: 'Passport Renewal', amount: 0, dueDate: mkDate(15, 11, 0), category: 'others', isPaid: false, icon: 'globe', reminderType: 'custom', repeatType: 'none', status: 'active', reminderDaysBefore: [10, 3, 1], source: 'demo-seed' },
      ] as any[]);

      await notifications.insertMany([
        { userId: demoUserId, type: 'reminder', title: 'Electricity Bill', body: 'Due today at 8:00 PM', read: false, createdAt: new Date(), source: 'demo-seed', meta: { billName: 'Electricity Bill' } },
        { userId: demoUserId, type: 'insight', title: 'Spending insight', body: 'Food spending is 14% higher this week.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 30), source: 'demo-seed' },
      ] as any[]);

      await family.insertMany([
        { userId: demoUserId, name: 'Maa', relationship: 'mother', medicines: [], source: 'demo-seed', createdAt: new Date() },
        { userId: demoUserId, name: 'Papa', relationship: 'father', medicines: [], source: 'demo-seed', createdAt: new Date() },
      ] as any[]);

      console.log('[seed] demo data refreshed for:', demoEmail);
    } catch (seedErr) {
      console.error('[seed] demo data failed:', seedErr);
    }
  }

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
          avatarUrl: (user as any).avatarUrl || null,
          dateOfBirth: (user as any).dateOfBirth || null,
        },
      });
    } catch (err) {
      console.error('Me error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.put('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const { name, phone, avatarUrl, email, dateOfBirth } = req.body as {
        name?: string;
        phone?: string | null;
        avatarUrl?: string | null;
        email?: string;
        dateOfBirth?: string | null;
      };
      const update: any = {};
      if (name !== undefined) update.name = String(name).trim();
      if (phone !== undefined) update.phone = phone === null ? null : String(phone).trim();
      if (avatarUrl !== undefined) update.avatarUrl = avatarUrl === null ? null : String(avatarUrl);
      if (email !== undefined) {
        const emailNext = String(email).toLowerCase().trim();
        if (!emailNext) {
          return res.status(400).json({ message: 'Email cannot be empty' });
        }
        const duplicate = await users.findOne({ email: emailNext, _id: { $ne: toId(req.userId) } as any });
        if (duplicate) {
          return res.status(409).json({ message: 'An account with this email already exists' });
        }
        update.email = emailNext;
      }
      if (dateOfBirth !== undefined) {
        const dob = dateOfBirth === null ? null : String(dateOfBirth).trim();
        if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
          return res.status(400).json({ message: 'Date of birth must be YYYY-MM-DD' });
        }
        update.dateOfBirth = dob;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      await users.updateOne({ _id: toId(req.userId) }, { $set: update });
      const user = await users.findOne({ _id: toId(req.userId) });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const uid = (user as { _id: string | { toString: () => string } })._id;
      return res.json({
        user: {
          id: typeof uid === 'string' ? uid : uid.toString(),
          email: user.email,
          name: user.name,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
          avatarUrl: (user as any).avatarUrl,
          dateOfBirth: (user as any).dateOfBirth || null,
        },
      });
    } catch (err) {
      console.error('Update me error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post(
    '/api/avatar',
    authMiddleware,
    upload.single('avatar'),
    async (req: any, res: any) => {
      try {
        if (!S3_BUCKET) {
          return res.status(500).json({ message: 'S3 bucket not configured. Set AWS_S3_BUCKET.' });
        }
        const file = req.file as Express.Multer.File | undefined;
        if (!file || !file.buffer) {
          return res.status(400).json({ message: 'avatar file is required' });
        }

        const key = `avatars/${req.userId}/${Date.now()}-${file.originalname}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || 'image/jpeg',
            ACL: 'public-read',
          } as any),
        );

        const url = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
        await users.updateOne({ _id: toId(req.userId) }, { $set: { avatarUrl: url } });
        return res.status(201).json({ url });
      } catch (err) {
        console.error('Upload avatar error:', err);
        return res.status(500).json({ message: 'Server error.' });
      }
    },
  );

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

  // ----- Support tickets -----
  app.post('/api/support', authMiddleware, async (req, res) => {
    try {
      const { subject, message } = req.body as { subject?: string; message?: string };
      if (!subject || !message) {
        return res.status(400).json({ message: 'Subject and message are required' });
      }

      const doc = {
        userId: req.userId,
        subject: String(subject).slice(0, 120),
        message: String(message).slice(0, 4000),
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await supportTickets.insertOne(doc);
      return res.status(201).json({ id: result.insertedId.toString(), ...doc });
    } catch (err) {
      console.error('Create support ticket error:', err);
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
        imageUrl: b.imageUrl,
        imageKey: b.imageKey,
        source: b.source,
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

  // Scan Bill Preview (image -> OCR -> validated fields, without creating a bill)
  app.post(
    '/api/bills/scan/preview',
    authMiddleware,
    upload.single('image'),
    async (req: any, res: any) => {
      try {
        if (!S3_BUCKET) {
          return res.status(500).json({ message: 'S3 bucket not configured. Set AWS_S3_BUCKET.' });
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
          texRes.Blocks?.filter((b) => b.BlockType === 'LINE').map((b) => b.Text || '').filter(Boolean) ?? [];
        const fullText = lines.join('\n');

        let title = lines.find((l) => /bill|invoice|electric/i.test(l)) || 'Scanned Bill';

        // Extract amount (support more formats than only "₹ ...")
        let amount = 0;
        const currencyAmountMatch = fullText.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (currencyAmountMatch?.[1]) {
          amount = Number(currencyAmountMatch[1].replace(/,/g, '')) || 0;
        } else {
          const contextualMatch =
            fullText.match(
              /(total|amount|payable|due|bill\s*amount|amount\s*due)\s*[:\s]*₹?\s*([\d,]+(?:\.\d{1,2})?)/i,
            ) || fullText.match(/(total|amount|payable|due)\s+₹?\s*([\d,]+(?:\.\d{1,2})?)/i);

          if (contextualMatch?.[2]) {
            amount = Number(contextualMatch[2].replace(/,/g, '')) || 0;
          }
        }

        // Detect due date (year optional in some bill formats)
        let dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const dateMatchWithYear =
          fullText.match(/due\s*date[:\s]*([0-9]{1,2}\s+\w+\s+\d{4})/i) ||
          fullText.match(
            /([0-9]{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i,
          );

        const dateMatchNoYear = fullText.match(
          /due\s*date[:\s]*([0-9]{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)(?:\s*,?\s*(\d{4}))?/i,
        );

        if (dateMatchWithYear?.[1]) {
          const parsed = new Date(dateMatchWithYear[1]);
          if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
        } else if (dateMatchNoYear?.[1]) {
          const yearToUse = dateMatchNoYear[3] ? Number(dateMatchNoYear[3]) : new Date().getFullYear();
          const parsed = new Date(`${dateMatchNoYear[1]} ${yearToUse}`);
          if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
        }

        const hasDateLike = Boolean(dateMatchWithYear?.[1] || dateMatchNoYear?.[1]);

        // Validate: reject random photos by requiring amount AND bill-like signals.
        const hasBillLikeKeywords = /(invoice|receipt|bill|statement|amount|total|payable|due|payment|paid|gst|tax|account\s*(number|no)|customer|meter|electric|utility|telephone)/i.test(
          fullText,
        );

        const hasTitleSignal = /(invoice|bill|electric|receipt)/i.test(title);

        if (amount <= 0 || !(hasBillLikeKeywords || hasDateLike || hasTitleSignal)) {
          return res.status(422).json({
            message:
              'This does not look like a bill photo. Please scan a real bill/invoice where amount and due date are visible.',
          });
        }

        const preview = {
          name: title.slice(0, 80),
          amount,
          dueDate: dueDate.toISOString(),
          category: 'bills' as CategoryType,
          icon: 'receipt',
          reminderType: 'bill' as ReminderType,
          repeatType: 'monthly' as RepeatType,
          status: 'active' as ReminderStatus,
          snoozedUntil: undefined,
          reminderDaysBefore: [3, 1, 0],
          source: 'scan_bill',
          imageKey: key,
          imageUrl: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
        };

        return res.json({ preview });
      } catch (err) {
        console.error('Scan bill preview error:', err);
        return res.status(500).json({ message: 'Server error.' });
      }
    },
  );

  // Scan Bill Commit (create a bill reminder from validated preview)
  app.post('/api/bills/scan/commit', authMiddleware, async (req: any, res: any) => {
    try {
      const preview = req.body?.preview;
      if (!preview) return res.status(400).json({ message: 'preview is required' });

      const amount = Number(preview.amount) || 0;
      if (amount <= 0) return res.status(422).json({ message: 'Invalid amount detected.' });

      const due = new Date(preview.dueDate);
      if (Number.isNaN(due.getTime())) return res.status(422).json({ message: 'Invalid due date detected.' });

      const reminderDaysBefore = Array.isArray(preview.reminderDaysBefore) ? preview.reminderDaysBefore : [3, 1, 0];

      const doc = {
        userId: req.userId,
        name: String(preview.name || 'Bill').slice(0, 80),
        amount,
        dueDate: due.toISOString(),
        category: (preview.category as CategoryType) || 'bills',
        isPaid: false,
        icon: preview.icon || 'receipt',
        reminderType: (preview.reminderType as ReminderType) || 'bill',
        repeatType: (preview.repeatType as RepeatType) || 'monthly',
        status: (preview.status as ReminderStatus) || 'active',
        snoozedUntil: preview.snoozedUntil,
        reminderDaysBefore,
        source: preview.source || 'scan_bill',
        imageKey: preview.imageKey,
        imageUrl: preview.imageUrl,
        createdAt: new Date(),
      };

      const result = await bills.insertOne(doc);
      return res.status(201).json({ id: result.insertedId.toString(), ...doc });
    } catch (err) {
      console.error('Scan bill commit error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // Scan Bill (legacy: image -> OCR -> bill reminder)
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

        // Extract amount (support more formats than only "₹ ...")
        let amount = 0;
        const currencyAmountMatch = fullText.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (currencyAmountMatch?.[1]) {
          amount = Number(currencyAmountMatch[1].replace(/,/g, '')) || 0;
        } else {
          const contextualMatch =
            fullText.match(
              /(total|amount|payable|due|bill\s*amount|amount\s*due)\s*[:\s]*₹?\s*([\d,]+(?:\.\d{1,2})?)/i,
            ) || fullText.match(/(total|amount|payable|due)\s+₹?\s*([\d,]+(?:\.\d{1,2})?)/i);
          if (contextualMatch?.[2]) {
            amount = Number(contextualMatch[2].replace(/,/g, '')) || 0;
          }
        }

        // Detect due date (year optional in some bill formats)
        let dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const dateMatchWithYear =
          fullText.match(/due\s*date[:\s]*([0-9]{1,2}\s+\w+\s+\d{4})/i) ||
          fullText.match(/([0-9]{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i);

        const dateMatchNoYear = fullText.match(
          /due\s*date[:\s]*([0-9]{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)(?:\s*,?\s*(\d{4}))?/i,
        );

        if (dateMatchWithYear?.[1]) {
          const parsed = new Date(dateMatchWithYear[1]);
          if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
        } else if (dateMatchNoYear?.[1]) {
          const yearToUse = dateMatchNoYear[3] ? Number(dateMatchNoYear[3]) : new Date().getFullYear();
          const parsed = new Date(`${dateMatchNoYear[1]} ${yearToUse}`);
          if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
        }

        const hasDateLike = Boolean(dateMatchWithYear?.[1] || dateMatchNoYear?.[1]);

        // Validate: reject random photos by requiring amount AND bill-like signals.
        // (Prevents success when user uploads a random/non-bill photo.)
        const hasBillLikeKeywords = /(invoice|receipt|bill|statement|amount|total|payable|due|payment|paid|gst|tax|account\s*(number|no)|customer|meter|electric|utility|telephone)/i.test(
          fullText,
        );
        const hasTitleSignal = /(invoice|bill|electric|receipt)/i.test(title);

        if (amount <= 0 || !(hasBillLikeKeywords || hasDateLike || hasTitleSignal)) {
          return res.status(422).json({
            message:
              'This does not look like a bill photo. Please scan a real bill/invoice where amount and due date are visible.',
          });
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
          reminderDaysBefore: [3, 1, 0],
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

      const parsed = await parseReminderWithAI(text);
      const due = new Date(`${parsed.isoDate}T00:00:00.000Z`);
      if (Number.isNaN(due.getTime())) {
        return res.status(400).json({ message: 'Could not parse reminder date' });
      }
      due.setHours(parsed.hour, parsed.minute, 0, 0);

      const doc = {
        userId: req.userId,
        name: parsed.title.slice(0, 80),
        amount: 0,
        dueDate: due.toISOString(),
        category: 'bills' as CategoryType,
        isPaid: false,
        icon: 'flash',
        reminderType: parsed.reminderType,
        repeatType: parsed.repeatType,
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

  // Parse reminder text (no save) - used for voice confirm/edit flows
  app.post('/api/reminders/parse', authMiddleware, async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ message: 'text is required' });
      }
      const parsed = await parseReminderWithAI(text);
      return res.json(parsed);
    } catch (err) {
      console.error('Parse reminder error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // Voice reminder: upload audio -> transcribe -> parse (no save)
  app.post(
    '/api/reminders/voice/parse',
    authMiddleware,
    upload.single('audio'),
    async (req: any, res: any) => {
      try {
        const openAIKey = getOpenAIKey();
        if (!openAIKey) {
          return res.status(500).json({ message: 'Voice is not configured. Set OPENAI_API_KEY.' });
        }
  
        const file = req.file as Express.Multer.File | undefined;
        if (!file || !file.buffer) {
          return res.status(400).json({ message: 'audio file is required' });
        }
  
        // Prefer env-configured transcription model, then safe default.
        const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  
        // Create form data
        const form = new FormData();
        const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/m4a' });
  
        form.append('file', blob, file.originalname || 'voice.m4a');
        form.append('model', MODEL);
        form.append('response_format', 'json');
  
        // 🔥 Strong language control prompt
        form.append(
          'prompt',
          [
            'The speaker may use Gujarati, Hindi, or English.',
            'CRITICAL RULES:',
            '- Detect the spoken language accurately.',
            '- If Gujarati is spoken, you MUST output ONLY in Gujarati script (ગુજરાતી લિપિ).',
            '- NEVER convert Gujarati into Hindi (Devanagari).',
            '- If Hindi is spoken, use Devanagari.',
            '- If English is spoken, use Latin script.',
            '- Do not translate.',
            '- Preserve original spoken words exactly.'
          ].join(' ')
        );
  
        const tRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openAIKey}` },
          body: form as any,
        });
  
        if (!tRes.ok) {
          const errText = await tRes.text().catch(() => '');
          console.error('OpenAI transcribe error:', errText);
          return res.status(500).json({ message: 'Could not transcribe audio. Please try again.' });
        }
  
        const tJson = (await tRes.json()) as { text?: string; language?: string | null };
        let text = String(tJson.text || '').trim();
  
        if (!text) {
          return res.status(400).json({ message: 'No speech detected. Please try again.' });
        }
  
        // Normalize script so Gujarati speech is stored/displayed in Gujarati script.
        const normalized = await normalizeTranscriptScript({
          text,
          languageHint: tJson.language || null,
          apiKey: openAIKey,
        });
        text = normalized.text;
  
        // ============================
        // 🔥 PARSE REMINDER
        // ============================
  
        const parsed = await parseReminderWithAI(text);
  
        return res.json({
          text,
          language: normalized.language,
          parsed,
        });
  
      } catch (err) {
        console.error('Voice parse error:', err);
        return res.status(500).json({ message: 'Server error.' });
      }
    }
  );
  
  
  // ============================
  // 🔥 CONVERT HINDI → GUJARATI
  // ============================
  
  async function convertToGujarati(text: string, apiKey: string) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Convert the given text into Gujarati script only. Do NOT translate meaning. Keep words same, only change script.'
            },
            {
              role: 'user',
              content: text
            }
          ],
        }),
      });
  
      const json = await response.json();
  
      return json?.choices?.[0]?.message?.content?.trim() || text;
  
    } catch (err) {
      console.error('Gujarati conversion error:', err);
      return text; // fallback safe
    }
  }

  type DetectedLang = 'gu' | 'hi' | 'en' | 'mixed' | 'unknown';

  function hasDevanagari(txt: string) {
    return /[\u0900-\u097F]/.test(txt);
  }

  function hasGujaratiScript(txt: string) {
    return /[\u0A80-\u0AFF]/.test(txt);
  }

  function hasLatinScript(txt: string) {
    return /[A-Za-z]/.test(txt);
  }

  async function detectLanguageWithAI(text: string, apiKey: string): Promise<DetectedLang> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Classify the dominant language of the user text. Return JSON only with key "language". Allowed values: gu, hi, en, mixed, unknown.',
            },
            { role: 'user', content: text },
          ],
        }),
      });

      if (!response.ok) return 'unknown';
      const json = await response.json();
      const raw = json?.choices?.[0]?.message?.content;
      if (!raw) return 'unknown';
      const parsed = JSON.parse(raw);
      const val = String(parsed?.language || '').toLowerCase();
      if (val === 'gu' || val === 'hi' || val === 'en' || val === 'mixed' || val === 'unknown') {
        return val;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  function normalizeHintLanguage(hint: string | null | undefined): DetectedLang {
    const h = String(hint || '').toLowerCase();
    if (h.startsWith('gu')) return 'gu';
    if (h.startsWith('hi')) return 'hi';
    if (h.startsWith('en')) return 'en';
    return 'unknown';
  }

  async function normalizeTranscriptScript({
    text,
    languageHint,
    apiKey,
  }: {
    text: string;
    languageHint: string | null;
    apiKey: string;
  }): Promise<{ text: string; language: string | null }> {
    let finalText = text.trim();
    if (!finalText) return { text: '', language: null };

    const hintLang = normalizeHintLanguage(languageHint);
    const hasHiScript = hasDevanagari(finalText);
    const hasGuScript = hasGujaratiScript(finalText);
    const hasEnScript = hasLatinScript(finalText);

    let detected: DetectedLang = hintLang;

    // Fast script-based detection first.
    if (hasGuScript && !hasHiScript && !hasEnScript) detected = 'gu';
    else if (hasHiScript && !hasGuScript && !hasEnScript && detected === 'unknown') detected = 'hi';
    else if (hasEnScript && !hasGuScript && !hasHiScript && detected === 'unknown') detected = 'en';

    // Devanagari can still be Gujarati speech rendered in Hindi script; confirm via AI.
    if (hasHiScript && !hasGuScript && (detected === 'unknown' || detected === 'hi')) {
      const aiDetected = await detectLanguageWithAI(finalText, apiKey);
      if (aiDetected !== 'unknown') detected = aiDetected;
    }

    if (hasHiScript && !hasGuScript && detected === 'gu') {
      finalText = await convertToGujarati(finalText, apiKey);
      if (hasGujaratiScript(finalText)) detected = 'gu';
    }

    return {
      text: finalText,
      language: detected === 'unknown' ? (languageHint || null) : detected,
    };
  }

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

  // ----- AI Assistant (Assistants API: Conversly asst_WmTjqjLyo3ki1MFHtqDtal6R, or fallback chat completions) -----
  app.post('/api/assistant/chat', authMiddleware, async (req, res) => {
    try {
      const openAIKey = getOpenAIKey();
      if (!openAIKey) {
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

      const authHeader = {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      };
      const baseUrl = 'https://api.openai.com/v1';

      if (OPENAI_ASSISTANT_ID) {
        // Use OpenAI Assistants API (Conversly assistant)
        const createThreadRes = await fetch(`${baseUrl}/threads`, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({}),
        });
        if (!createThreadRes.ok) {
          const errText = await createThreadRes.text();
          console.error('OpenAI threads error:', errText);
          return res.status(500).json({ message: 'Assistant error. Please try again later.' });
        }
        const { id: threadId } = (await createThreadRes.json()) as { id: string };

        const contextContent =
          'LifeWise user data context (use for personalised advice): ' + JSON.stringify(snapshot);
        const addCtxRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ role: 'user', content: contextContent }),
        });
        if (!addCtxRes.ok) {
          const errText = await addCtxRes.text();
          console.error('OpenAI add message error:', errText);
          return res.status(500).json({ message: 'Assistant error. Please try again later.' });
        }
        for (const m of userMessages.filter((m) => m.role === 'user' || m.role === 'assistant')) {
          const addRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ role: m.role, content: m.content }),
          });
          if (!addRes.ok) {
            const errText = await addRes.text();
            console.error('OpenAI add message error:', errText);
            return res.status(500).json({ message: 'Assistant error. Please try again later.' });
          }
        }

        const runRes = await fetch(`${baseUrl}/threads/${threadId}/runs`, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ assistant_id: OPENAI_ASSISTANT_ID }),
        });
        if (!runRes.ok) {
          const errText = await runRes.text();
          console.error('OpenAI create run error:', errText);
          return res.status(500).json({ message: 'Assistant error. Please try again later.' });
        }
        const { id: runId } = (await runRes.json()) as { id: string };

        const pollUntil = Date.now() + 60_000;
        let status: string = 'queued';
        while (Date.now() < pollUntil) {
          const runStatusRes = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`, {
            headers: { Authorization: `Bearer ${openAIKey}`, 'OpenAI-Beta': 'assistants=v2' },
          });
          if (!runStatusRes.ok) break;
          const runStatus = (await runStatusRes.json()) as { status: string };
          status = runStatus.status;
          if (status === 'completed') break;
          if (status === 'failed' || status === 'cancelled' || status === 'expired') {
            console.error('OpenAI run status:', status);
            return res.status(500).json({ message: 'Assistant error. Please try again later.' });
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (status !== 'completed') {
          return res.status(500).json({ message: 'Assistant is taking too long. Please try again.' });
        }

        const listMsgRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
          headers: { Authorization: `Bearer ${openAIKey}`, 'OpenAI-Beta': 'assistants=v2' },
        });
        if (!listMsgRes.ok) {
          const errText = await listMsgRes.text();
          console.error('OpenAI list messages error:', errText);
          return res.status(500).json({ message: 'Assistant error. Please try again later.' });
        }
        const listData = (await listMsgRes.json()) as {
          data?: Array<{ role: string; content?: Array<{ type: string; text?: { value?: string } }> }>;
        };
        const data = listData.data || [];
        const lastAssistant = data.find((m) => m.role === 'assistant');
        const reply =
          lastAssistant?.content?.find((c) => c.type === 'text')?.text?.value ||
          'Sorry, I could not generate a response right now.';
        return res.json({ reply });
      }

      // Fallback: chat completions (no assistant ID)
      const systemPrompt =
        'You are LifeWise, a financial and life assistant for Indian users. ' +
        'You MUST base advice on the provided JSON snapshot of the user data. ' +
        'Explain in simple, friendly language (you can mix light Hinglish but keep it clear). ' +
        'Never invent transactions or bills. Be concise and practical.';
      const messagesForModel = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `User data snapshot (JSON): ${JSON.stringify(snapshot)}` },
        ...userMessages.filter((m) => m.role === 'user' || m.role === 'assistant'),
      ];
      const openAiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeader,
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
      const {
        name,
        dosage,
        appearance,
        color,
        instruction,
        slots,
        scheduleType,
        startDate,
        endDate,
        caregiverName,
        caregiverContact,
      } = req.body as {
        name?: string;
        dosage?: string;
        appearance?: string;
        color?: string;
        instruction?: string;
        slots?: { morning?: string; noon?: string; evening?: string };
        scheduleType?: 'continuous' | 'custom';
        startDate?: string;
        endDate?: string | null;
        caregiverName?: string;
        caregiverContact?: string;
      };

      if (!name) {
        return res.status(400).json({ message: 'Medicine name is required' });
      }

      const medId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const safeSlots = slots && typeof slots === 'object' ? slots : {};
      const todayIso = new Date().toISOString().slice(0, 10);

      const med = {
        id: medId,
        name: String(name).trim(),
        dosage: dosage ? String(dosage).trim() : '',
        appearance: (appearance as string) || 'tablet',
        color: color ? String(color) : '#10B981',
        instruction: (instruction as string) || 'any',
        slots: {
          morning: safeSlots.morning || null,
          noon: safeSlots.noon || null,
          evening: safeSlots.evening || null,
        },
        scheduleType: scheduleType === 'custom' ? 'custom' as const : 'continuous' as const,
        startDate: startDate || todayIso,
        endDate: scheduleType === 'custom' && endDate ? endDate : null,
        caregiverName: caregiverName ? String(caregiverName).trim() : null,
        caregiverContact: caregiverContact ? String(caregiverContact).trim() : null,
        // Tracking fields for adherence / streaks
        totalReminders: 0,
        takenReminders: 0,
        missedReminders: 0,
        adherenceScore: 0,
        streak: 0,
        lastTakenAt: null,
        lastStatus: 'pending',
        createdAt: new Date(),
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
      const now = new Date();

      const updatedMeds = meds.map((m: any) => {
        if (m.id !== medId) return m;

        const base = {
          totalReminders: typeof m.totalReminders === 'number' ? m.totalReminders : 0,
          takenReminders: typeof m.takenReminders === 'number' ? m.takenReminders : 0,
          missedReminders: typeof m.missedReminders === 'number' ? m.missedReminders : 0,
          streak: typeof m.streak === 'number' ? m.streak : 0,
        };

        if (action === 'taken') {
          const total = base.totalReminders + 1;
          const taken = base.takenReminders + 1;
          const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
          return {
            ...m,
            taken: true,
            snoozed: false,
            lastStatus: 'taken',
            lastTakenAt: now,
            totalReminders: total,
            takenReminders: taken,
            missedReminders: base.missedReminders,
            adherenceScore: adherence,
            streak: base.streak + 1,
          };
        }

        if (action === 'snooze') {
          return {
            ...m,
            snoozed: true,
            lastStatus: 'snoozed',
          };
        }

        if (action === 'skip') {
          const total = base.totalReminders + 1;
          const missed = base.missedReminders + 1;
          const adherence =
            total > 0 ? Math.round((base.takenReminders / total) * 100) : 0;
          return {
            ...m,
            taken: false,
            snoozed: false,
            lastStatus: 'missed',
            totalReminders: total,
            takenReminders: base.takenReminders,
            missedReminders: missed,
            adherenceScore: adherence,
            streak: 0,
          };
        }

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
                  appUrl: APP_OPEN_URL,
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
