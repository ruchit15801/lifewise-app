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
import { createClient, type RedisClientType } from 'redis';

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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || 'asst_WmTjqjLyo3ki1MFHtqDtal6R';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET = process.env.AWS_S3_BUCKET;

const reminderTemplatePath = path.resolve(process.cwd(), 'server', 'templates', 'reminder-email.html');
const REMINDER_EMAIL_TEMPLATE = fs.existsSync(reminderTemplatePath)
  ? fs.readFileSync(reminderTemplatePath, 'utf-8')
  : '';
const REDIS_URL = process.env.REDIS_URL;
let redisClient: RedisClientType | null = null;
const memoryDashboardCache = new Map<string, { value: string; expiresAt: number }>();

type ReminderChannel = 'email' | 'in_app';
type SmartReminderType = 'note' | 'payment' | 'document' | 'event';
type FamilyMemberType = 'parent' | 'child' | 'spouse' | 'self';
type FamilyModuleKey =
  | 'medicines'
  | 'health_insurance'
  | 'doctor_appointments'
  | 'medical_reports'
  | 'policy_reminders'
  | 'policies'
  | 'doctor_visits'
  | 'documents'
  | 'school_fees'
  | 'vaccination_reminders'
  | 'school_events'
  | 'bills'
  | 'subscriptions'
  | 'insurance'
  | 'personal_reminders';

const FAMILY_MODULES: Record<FamilyMemberType, FamilyModuleKey[]> = {
  parent: ['medicines', 'insurance', 'policies', 'doctor_visits', 'documents', 'health_insurance', 'doctor_appointments', 'medical_reports', 'policy_reminders'],
  child: ['school_fees', 'vaccination_reminders', 'medicines', 'school_events'],
  spouse: ['bills', 'subscriptions', 'insurance', 'documents', 'personal_reminders'],
  self: ['personal_reminders', 'bills', 'subscriptions', 'policy_reminders', 'documents'],
};

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

async function getCache(key: string): Promise<string | null> {
  if (redisClient) {
    try {
      return await redisClient.get(key);
    } catch {
      // fallback to memory cache
    }
  }
  const item = memoryDashboardCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryDashboardCache.delete(key);
    return null;
  }
  return item.value;
}

async function setCache(key: string, value: string, ttlSec: number): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(key, value, { EX: ttlSec });
      return;
    } catch {
      // fallback to memory cache
    }
  }
  memoryDashboardCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

async function delCache(key: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch {
      // fallback only
    }
  }
  memoryDashboardCache.delete(key);
}

function normalizeDigits(input: string): string {
  return input.replace(/[^\x20-\x7E]/g, ' ');
}

function extractAmount(text: string): number {
  const amountMatch =
    text.match(/(?:₹|rs\.?|rupees?)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|rupees?)/i) ||
    text.match(/\b([\d,]{2,}(?:\.\d{1,2})?)\b/);
  if (!amountMatch?.[1]) return 0;
  return Number(amountMatch[1].replace(/,/g, '')) || 0;
}

function extractPerson(text: string): string | null {
  const patterns = [
    /(?:to|for)\s+([A-Za-z][A-Za-z\s]{1,40})/i,
    /([A-Za-z][A-Za-z\s]{1,40})\s+(?:ne|ko)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().split(/\s+/).slice(0, 2).join(' ');
  }
  return null;
}

function extractDateFromText(rawText: string): Date {
  const text = rawText.toLowerCase();
  const now = new Date();
  const out = new Date(now);
  out.setHours(9, 0, 0, 0);

  if (/\b(today|aaje|aaj)\b/.test(text)) return out;
  if (/\b(tomorrow|kal)\b/.test(text)) {
    out.setDate(out.getDate() + 1);
    return out;
  }
  if (/\b(day after tomorrow|parso)\b/.test(text)) {
    out.setDate(out.getDate() + 2);
    return out;
  }
  const inDaysMatch = text.match(/\b(?:in|after)\s+(\d{1,2})\s+days?\b/);
  if (inDaysMatch?.[1]) {
    out.setDate(out.getDate() + Number(inDaysMatch[1]));
    return out;
  }
  return out;
}

function inferReminderType(text: string): SmartReminderType {
  const lower = text.toLowerCase();
  if (/(pay|payment|upi|bill|loan|rupiya|rupees?|₹)/i.test(lower)) return 'payment';
  if (/(document|passport|policy|paper|file)/i.test(lower)) return 'document';
  if (/(event|birthday|anniversary|meeting|appointment)/i.test(lower)) return 'event';
  return 'note';
}

function toReminderTitle(type: SmartReminderType, person: string | null, amount: number, fallback: string): string {
  if (type === 'payment' && (person || amount > 0)) {
    const amountLabel = amount > 0 ? `₹${Math.round(amount)}` : 'amount';
    const personLabel = person || 'someone';
    return `Pay ${personLabel} ${amountLabel}`;
  }
  if (type === 'document') return `Document reminder: ${fallback}`;
  if (type === 'event') return `Event reminder: ${fallback}`;
  return `Note: ${fallback}`;
}

function createFamilyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createFamilyId(): string {
  return `FAM${Math.floor(1000 + Math.random() * 9000)}`;
}

function mapRelationshipToMemberType(rel?: string): FamilyMemberType {
  const normalized = String(rel || 'self').toLowerCase();
  if ([
    'parent', 'father', 'mother', 'papa', 'mummy', 'dad', 'mom',
    'grandmother', 'grandfather', 'grandma', 'grandpa',
  ].includes(normalized)) return 'parent';
  if (['child', 'son', 'daughter', 'kid', 'boy child', 'girl child'].includes(normalized)) return 'child';
  if (['spouse', 'wife', 'husband', 'partner', 'brother', 'sister'].includes(normalized)) return 'spouse';
  return 'self';
}

function getRangeStart(range: string): Date {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (range) {
    case 'day':
      return start;
    case '10days':
      start.setDate(start.getDate() - 9);
      return start;
    case '30days':
      start.setDate(start.getDate() - 29);
      return start;
    case '50days':
      start.setDate(start.getDate() - 49);
      return start;
    case 'monthly':
      start.setDate(1);
      return start;
    case 'yearly':
      start.setMonth(0, 1);
      return start;
    default:
      start.setDate(start.getDate() - 29);
      return start;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  if (REDIS_URL && !redisClient) {
    try {
      redisClient = createClient({ url: REDIS_URL });
      redisClient.on('error', () => {
        // ignore runtime redis errors and fallback to in-memory cache
      });
      await redisClient.connect();
      console.log('LifeWise: Redis cache connected');
    } catch {
      redisClient = null;
      console.warn('LifeWise: Redis unavailable, using in-memory cache');
    }
  }
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
  const reminders = db.collection('reminders');
  const lifeMemory = db.collection('life_memory');
  const lifeScores = db.collection('life_scores');
  const reports = db.collection('reports');
  const medicineLogs = db.collection('medicine_logs');
  const lifeEvents = db.collection('life_events');
  const familyNodes = db.collection('family_nodes');
  const familyTasks = db.collection('family_tasks');
  const families = db.collection('families');
  const familyGroups = db.collection('family_groups');
  const familyMembersCollection = db.collection('family_members');
  const dailyMetrics = db.collection('daily_metrics');
  const aiChats = db.collection('ai_chats');
  const aiChatMessages = db.collection('ai_chat_messages');
  const aiConversations = db.collection('ai_conversations');
  const moneyLeakLimits = db.collection('money_leak_limits');

  async function addLifeEvent(params: {
    userId: string;
    type: 'reminder' | 'medicine' | 'bill' | 'task' | 'habit' | 'expense';
    title: string;
    date?: Date;
    source: string;
    metadata?: Record<string, unknown>;
  }) {
    await lifeEvents.insertOne({
      userId: params.userId,
      type: params.type,
      title: params.title,
      date: (params.date || new Date()).toISOString(),
      source: params.source,
      metadata: params.metadata || {},
      createdAt: new Date(),
    });
  }

  function emitFamilyEvent(familyId: string, event: string, payload: Record<string, unknown>) {
    try {
      const io = app.get('io');
      if (io) {
        io.to(`family:${familyId}`).emit(event, payload);
      }
    } catch {
      // no-op when socket is not initialized yet
    }
  }

  function emitUserEvent(userId: string, event: string, payload: Record<string, unknown>) {
    try {
      const io = app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit(event, payload);
      }
    } catch {
      // no-op
    }
  }

  async function invalidateDashboard(userId: string) {
    await delCache(`dashboard:${userId}`);
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
        },
      });
    } catch (err) {
      console.error('Me error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.put('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const { name, phone, avatarUrl } = req.body as { name?: string; phone?: string | null; avatarUrl?: string | null };
      const update: any = {};
      if (name !== undefined) update.name = String(name).trim();
      if (phone !== undefined) update.phone = phone === null ? null : String(phone).trim();
      if (avatarUrl !== undefined) update.avatarUrl = avatarUrl === null ? null : String(avatarUrl);

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
      await addLifeEvent({
        userId: req.userId,
        type: 'expense',
        title: `Spent ₹${Math.round(doc.amount)} at ${doc.merchant}`,
        date: new Date(doc.date),
        source: 'transactions',
        metadata: { category: doc.category, isDebit: doc.isDebit },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'expense_added', { id: result.insertedId.toString(), amount: doc.amount, merchant: doc.merchant });
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
        await addLifeEvent({
          userId: req.userId,
          type: 'expense',
          title: `Spent ₹${Math.round(doc.amount)} at ${doc.merchant}`,
          date: new Date(doc.date),
          source: 'sms_sync',
          metadata: { category: doc.category, isDebit: doc.isDebit },
        });
        emitUserEvent(req.userId, 'expense_added', { amount: doc.amount, merchant: doc.merchant, source: 'sms_sync' });
        synced++;
      }
      await invalidateDashboard(req.userId);
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
      await addLifeEvent({
        userId: req.userId,
        type: 'bill',
        title: `Bill added: ${doc.name}`,
        date: new Date(doc.dueDate),
        source: 'bills',
        metadata: { amount: doc.amount, status: doc.status },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'reminder_created', { id: result.insertedId.toString(), title: doc.name });
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
        await addLifeEvent({
          userId: req.userId,
          type: 'bill',
          title: `Bill scanned: ${doc.name}`,
          date: new Date(doc.dueDate),
          source: 'scan_bill',
          metadata: { amount: doc.amount },
        });
        await invalidateDashboard(req.userId);
        emitUserEvent(req.userId, 'bill_scanned', { id: result.insertedId.toString(), title: doc.name, amount: doc.amount });
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
      if (update.isPaid === true || update.status === 'paid') {
        await addLifeEvent({
          userId: req.userId,
          type: 'bill',
          title: 'Bill paid',
          source: 'bills',
          metadata: { billId: id },
        });
      }
      await invalidateDashboard(req.userId);
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

      const openAIKey = getOpenAIKey();
      if (openAIKey) {
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
              Authorization: `Bearer ${openAIKey}`,
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
      await addLifeEvent({
        userId: req.userId,
        type: 'reminder',
        title: doc.name,
        date: new Date(doc.dueDate),
        source: 'quick_add',
        metadata: { reminderType: 'custom' },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'reminder_created', { id: result.insertedId.toString(), title: doc.name });
      return res.status(201).json({ id: result.insertedId.toString(), ...doc });
    } catch (err) {
      console.error('Quick add reminder error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // Smart Life Capture: AI reminder creation from natural language text
  app.post('/api/reminders/ai-create', authMiddleware, async (req, res) => {
    try {
      const { text_input } = req.body as { text_input?: string };
      if (!text_input || !String(text_input).trim()) {
        return res.status(400).json({ message: 'text_input is required' });
      }

      const cleanText = normalizeDigits(String(text_input).trim());
      const amount = extractAmount(cleanText);
      const person = extractPerson(cleanText);
      const date = extractDateFromText(cleanText);
      const type = inferReminderType(cleanText);
      const title = toReminderTitle(type, person, amount, cleanText.slice(0, 48));

      const doc = {
        userId: req.userId,
        title,
        textInput: cleanText,
        amount,
        person,
        date: date.toISOString(),
        type,
        category: type === 'payment' ? 'bills' : 'others',
        status: 'active',
        source: 'smart_life_capture',
        createdAt: new Date(),
      };
      const reminderResult = await reminders.insertOne(doc);
      await addLifeEvent({
        userId: req.userId,
        type: type === 'payment' ? 'bill' : 'reminder',
        title,
        date,
        source: 'smart_life_capture',
        metadata: { amount, person, reminderType: type },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'reminder_created', { title, type });

      const billDoc = {
        userId: req.userId,
        name: title,
        amount: amount || 0,
        dueDate: date.toISOString(),
        category: (type === 'payment' ? 'bills' : 'others') as CategoryType,
        isPaid: false,
        icon: type === 'document' ? 'document-text' : type === 'event' ? 'calendar' : 'flash',
        reminderType: 'custom' as ReminderType,
        repeatType: 'none' as RepeatType,
        status: 'active' as ReminderStatus,
        reminderDaysBefore: [0],
        source: 'smart_life_capture',
        createdAt: new Date(),
      };
      const billResult = await bills.insertOne(billDoc);

      return res.status(201).json({
        id: reminderResult.insertedId.toString(),
        billId: billResult.insertedId.toString(),
        title,
        amount,
        person,
        date: date.toISOString(),
        type,
      });
    } catch (err) {
      console.error('AI create reminder error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // Voice Reminder mode: speech-to-text output arrives as voice_text
  app.post('/api/voice-reminder', authMiddleware, async (req, res) => {
    try {
      const { voice_text } = req.body as { voice_text?: string };
      if (!voice_text || !String(voice_text).trim()) {
        return res.status(400).json({ message: 'voice_text is required' });
      }

      const cleanText = normalizeDigits(String(voice_text).trim());
      const amount = extractAmount(cleanText);
      const person = extractPerson(cleanText);
      const date = extractDateFromText(cleanText);
      const type = inferReminderType(cleanText);
      const title = toReminderTitle(type, person, amount, cleanText.slice(0, 48));

      const doc = {
        userId: req.userId,
        title,
        textInput: cleanText,
        amount,
        person,
        date: date.toISOString(),
        type,
        category: type === 'payment' ? 'bills' : 'others',
        status: 'active',
        source: 'voice_reminder',
        createdAt: new Date(),
      };
      const reminderResult = await reminders.insertOne(doc);
      await addLifeEvent({
        userId: req.userId,
        type: type === 'payment' ? 'bill' : 'reminder',
        title,
        date,
        source: 'voice_reminder',
        metadata: { amount, person, reminderType: type },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'reminder_created', { title, type });

      const billDoc = {
        userId: req.userId,
        name: title,
        amount: amount || 0,
        dueDate: date.toISOString(),
        category: (type === 'payment' ? 'bills' : 'others') as CategoryType,
        isPaid: false,
        icon: 'mic',
        reminderType: 'custom' as ReminderType,
        repeatType: 'none' as RepeatType,
        status: 'active' as ReminderStatus,
        reminderDaysBefore: [0],
        source: 'voice_reminder',
        createdAt: new Date(),
      };
      const billResult = await bills.insertOne(billDoc);

      return res.status(201).json({
        id: reminderResult.insertedId.toString(),
        billId: billResult.insertedId.toString(),
        title,
        amount,
        person,
        date: date.toISOString(),
        type,
      });
    } catch (err) {
      console.error('Voice reminder create error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post(
    '/api/voice-reminder/transcribe',
    authMiddleware,
    upload.single('audio'),
    async (req: any, res: any) => {
      try {
        const openAIKey = getOpenAIKey();
        if (!openAIKey) {
          return res.status(500).json({ message: 'OPENAI_API_KEY is not configured' });
        }
        const file = req.file as Express.Multer.File | undefined;
        if (!file?.buffer) {
          return res.status(400).json({ message: 'audio file is required' });
        }

        const form = new FormData();
        form.append('model', 'whisper-1');
        form.append(
          'prompt',
          'Transcribe exactly in the same language and script as spoken. Do not translate to another language.',
        );
        form.append(
          'file',
          new Blob([file.buffer], { type: file.mimetype || 'audio/m4a' }),
          file.originalname || 'voice.m4a',
        );

        const aiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAIKey}`,
          },
          body: form,
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error('Voice transcription error:', errText);
          return res.status(500).json({ message: 'Failed to transcribe audio' });
        }

        const json = (await aiRes.json()) as { text?: string };
        const text = String(json.text || '').trim();
        if (!text) {
          return res.status(400).json({ message: 'Could not detect speech' });
        }
        return res.json({ text });
      } catch (err) {
        console.error('Voice transcription route error:', err);
        return res.status(500).json({ message: 'Server error.' });
      }
    },
  );

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

  app.get('/api/money-leaks', authMiddleware, async (req, res) => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const allDebits = await transactions.find({ userId: req.userId, isDebit: true }).toArray();
      const monthlyTx = allDebits.filter((t) => new Date(t.date).getTime() >= monthStart.getTime());
      const prevMonthlyTx = allDebits.filter((t) => {
        const ts = new Date(t.date).getTime();
        return ts >= prevMonthStart.getTime() && ts <= prevMonthEnd.getTime();
      });

      const classifyLeakCategory = (merchantRaw: string, categoryRaw: string) => {
        const merchant = String(merchantRaw || '').toLowerCase();
        const category = String(categoryRaw || '').toLowerCase();
        if (/(swiggy|zomato|ubereats|dominos|pizza|cafe|eat|food)/.test(merchant) || category === 'food') return 'food_delivery';
        if (/(netflix|spotify|prime|hotstar|youtube|subscription|apple|google)/.test(merchant)) return 'subscriptions';
        if (/(uber|ola|rapido|ride|cab)/.test(merchant) || category === 'transport') return 'ride_apps';
        if (category === 'shopping' || /(amazon|flipkart|myntra|meesho|shopping)/.test(merchant)) return 'impulse_shopping';
        if (category === 'entertainment' || /(bookmyshow|movie|game|cinema|ott)/.test(merchant)) return 'entertainment';
        return 'others';
      };

      const LABELS: Record<string, { title: string; icon: string }> = {
        food_delivery: { title: 'Food Delivery', icon: 'fast-food' },
        subscriptions: { title: 'Subscriptions', icon: 'refresh-circle' },
        impulse_shopping: { title: 'Impulse Shopping', icon: 'cart' },
        ride_apps: { title: 'Ride Apps', icon: 'car' },
        entertainment: { title: 'Entertainment', icon: 'film' },
        others: { title: 'Other Leaks', icon: 'wallet' },
      };

      const categoryMap: Record<
        string,
        {
          monthly_spend: number;
          previous_month_spend: number;
          transaction_count: number;
          merchants: Record<string, { amount: number; count: number }>;
        }
      > = {};

      const ensureCategory = (key: string) => {
        if (!categoryMap[key]) {
          categoryMap[key] = {
            monthly_spend: 0,
            previous_month_spend: 0,
            transaction_count: 0,
            merchants: {},
          };
        }
      };

      monthlyTx.forEach((tx: any) => {
        const cat = classifyLeakCategory(tx.merchant, tx.category);
        ensureCategory(cat);
        categoryMap[cat].monthly_spend += Number(tx.amount || 0);
        categoryMap[cat].transaction_count += 1;
        const mk = String(tx.merchant || 'Unknown');
        if (!categoryMap[cat].merchants[mk]) categoryMap[cat].merchants[mk] = { amount: 0, count: 0 };
        categoryMap[cat].merchants[mk].amount += Number(tx.amount || 0);
        categoryMap[cat].merchants[mk].count += 1;
      });

      prevMonthlyTx.forEach((tx: any) => {
        const cat = classifyLeakCategory(tx.merchant, tx.category);
        ensureCategory(cat);
        categoryMap[cat].previous_month_spend += Number(tx.amount || 0);
      });

      const isLeakCategory = (key: string, val: { monthly_spend: number; transaction_count: number; merchants: Record<string, { amount: number; count: number }> }) => {
        if (key === 'food_delivery') return val.transaction_count > 10 || val.monthly_spend > 2000;
        if (key === 'subscriptions') return Object.keys(val.merchants).length > 3 || val.monthly_spend > 1000;
        if (key === 'impulse_shopping') return val.monthly_spend > 5000;
        if (key === 'ride_apps') return val.monthly_spend > 2000;
        if (key === 'entertainment') return val.monthly_spend > 1800;
        return val.monthly_spend > 2500;
      };

      const categories = Object.entries(categoryMap)
        .map(([key, val]) => {
          const prev = val.previous_month_spend;
          const trend = prev > 0 ? ((val.monthly_spend - prev) / prev) * 100 : val.monthly_spend > 0 ? 100 : 0;
          return {
            category: key,
            title: LABELS[key]?.title || key,
            icon: LABELS[key]?.icon || 'wallet',
            monthly_spend: Math.round(val.monthly_spend),
            transaction_count: val.transaction_count,
            trend_percent: Math.round(trend * 10) / 10,
            yearly_projection: Math.round(val.monthly_spend * 12),
            merchant_breakdown: Object.entries(val.merchants)
              .map(([merchant, mk]) => ({
                merchant,
                amount: Math.round(mk.amount),
                count: mk.count,
              }))
              .sort((a, b) => b.amount - a.amount),
            is_leak: isLeakCategory(key, val),
          };
        })
        .filter((x) => x.monthly_spend > 0)
        .sort((a, b) => b.monthly_spend - a.monthly_spend);

      const leakCategories = categories.filter((c) => c.is_leak).length > 0 ? categories.filter((c) => c.is_leak) : categories.slice(0, 5);
      const monthlyLeak = leakCategories.reduce((s, c) => s + c.monthly_spend, 0);
      const prevLeak = leakCategories.reduce((s, c) => s + Math.max(0, c.monthly_spend / (1 + (c.trend_percent || 0) / 100)), 0);
      const growthPercent = prevLeak > 0 ? ((monthlyLeak - prevLeak) / prevLeak) * 100 : 0;
      const yearlyLeak = Math.round(monthlyLeak * 12);
      const projectedWithTrend = Math.round(monthlyLeak * 12 * (1 + Math.max(0, growthPercent) / 100));
      const severity = monthlyLeak < 3000 ? 'low' : monthlyLeak < 7000 ? 'moderate' : 'high';

      const weekBuckets = [
        { key: 'Week 1', from: 1, to: 7 },
        { key: 'Week 2', from: 8, to: 14 },
        { key: 'Week 3', from: 15, to: 21 },
        { key: 'Week 4', from: 22, to: 31 },
      ];
      const weekly_trends = weekBuckets.map((wk) => ({
        week: wk.key,
        amount: Math.round(
          monthlyTx
            .filter((tx: any) => {
              const day = new Date(tx.date).getDate();
              return day >= wk.from && day <= wk.to;
            })
            .reduce((s, tx: any) => s + Number(tx.amount || 0), 0),
        ),
      }));

      const suggestions = leakCategories.slice(0, 3).map((cat, idx) => ({
        id: `s-${idx + 1}`,
        title:
          cat.category === 'food_delivery'
            ? 'Reduce food orders by 3 per month'
            : cat.category === 'subscriptions'
            ? 'Cancel at least one unused subscription'
            : cat.category === 'impulse_shopping'
            ? 'Apply 24-hour wait before shopping'
            : `Cut ${cat.title} spend by 20%`,
        description: `Potential yearly saving: ₹${Math.round(cat.yearly_projection * 0.25).toLocaleString('en-IN')}`,
        annual_saving: Math.round(cat.yearly_projection * 0.25),
        category: cat.category,
      }));

      const limits = await moneyLeakLimits.find({ userId: req.userId }).toArray();
      const limitMap: Record<string, number> = {};
      limits.forEach((l: any) => {
        limitMap[String(l.category)] = Number(l.monthlyLimit || 0);
      });
      const limitAlerts = leakCategories
        .filter((cat) => limitMap[cat.category] && cat.monthly_spend >= limitMap[cat.category])
        .map((cat) => ({
          category: cat.category,
          spent: cat.monthly_spend,
          limit: limitMap[cat.category],
          message: `You already spent ₹${cat.monthly_spend.toLocaleString('en-IN')} on ${cat.title}. Limit: ₹${limitMap[cat.category].toLocaleString('en-IN')}`,
        }));

      return res.json({
        summary: {
          title: 'Your Money Leak This Month',
          monthly_leak: monthlyLeak,
          subtitle: 'This is money that could have been saved.',
          leak_level: severity,
          growth_percent: Math.round(growthPercent * 10) / 10,
        },
        categories: leakCategories,
        prediction: {
          total_potential_leak: yearlyLeak,
          projected_with_trend: projectedWithTrend,
          monthly_growth_percent: Math.round(growthPercent * 10) / 10,
          categories: leakCategories.map((c) => ({
            category: c.title,
            monthly_spend: c.monthly_spend,
            yearly_projection: c.yearly_projection,
            trend: `${c.trend_percent >= 0 ? '+' : ''}${c.trend_percent}%`,
          })),
        },
        smart_suggestions: suggestions,
        weekly_trends,
        action_center: {
          limits: leakCategories.map((c) => ({
            category: c.category,
            label: c.title,
            current_spend: c.monthly_spend,
            monthly_limit: limitMap[c.category] || null,
          })),
        },
        notifications: {
          limit_alerts: limitAlerts,
          daily_insight:
            monthlyLeak > 0
              ? `Your spending habits could cost ₹${yearlyLeak.toLocaleString('en-IN')} this year.`
              : 'No significant leaks detected this month.',
        },
      });
    } catch (err) {
      console.error('Get money leaks error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/money-leaks/limit', authMiddleware, async (req, res) => {
    try {
      const category = String(req.body?.category || '').trim();
      const monthlyLimit = Number(req.body?.monthly_limit || 0);
      if (!category || !monthlyLimit) {
        return res.status(400).json({ message: 'category and monthly_limit are required' });
      }
      await moneyLeakLimits.updateOne(
        { userId: req.userId, category },
        { $set: { userId: req.userId, category, monthlyLimit, updatedAt: new Date() } },
        { upsert: true } as any,
      );
      return res.json({ ok: true, category, monthly_limit: monthlyLimit });
    } catch (err) {
      console.error('Set money leak limit error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/money-leaks/analytics', authMiddleware, async (req, res) => {
    try {
      const action = String(req.body?.action || '').trim();
      const category = String(req.body?.category || '').trim();
      if (!action) return res.status(400).json({ message: 'action is required' });
      await addLifeEvent({
        userId: req.userId,
        type: 'habit',
        title: `MoneyLeak action: ${action}`,
        source: 'money_leaks',
        metadata: { category: category || null },
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Money leak analytics error:', err);
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

  app.post('/api/user/sms-detection', authMiddleware, async (req, res) => {
    try {
      const { sms_detection_enabled } = req.body as { sms_detection_enabled?: boolean };
      const enabled = !!sms_detection_enabled;
      await users.updateOne(
        { _id: toId(req.userId) },
        { $set: { sms_detection_enabled: enabled } },
      );
      return res.json({ user_id: req.userId, sms_detection_enabled: enabled });
    } catch (err) {
      console.error('Update sms detection flag error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/onboarding/permission-log', async (req: any, res) => {
    try {
      const { user_id, permission, status } = req.body as { user_id?: string; permission?: string; status?: string };
      if (!permission || !status) {
        return res.status(400).json({ message: 'permission and status are required' });
      }
      const uid = user_id || req.userId;
      if (uid) {
        await users.updateOne(
          { _id: toId(uid) },
          {
            $set: {
              onboardingPermissionLog: {
                permission: String(permission),
                status: String(status),
                updatedAt: new Date(),
              },
              sms_detection_enabled: permission === 'sms' && status === 'granted',
            },
          },
        );
      }
      return res.json({ user_id: uid || null, permission, status });
    } catch (err) {
      console.error('Onboarding permission log error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/family/create', authMiddleware, async (req, res) => {
    try {
      const ownerGroupsCount = await families.countDocuments({ ownerId: req.userId });
      if (ownerGroupsCount >= 3) {
        return res.status(400).json({ message: 'You can create maximum 3 family groups.' });
      }
      let familyId = createFamilyId();
      let familyCode = createFamilyCode();
      for (let i = 0; i < 5; i++) {
        const exists = await families.findOne({ familyCode });
        if (!exists) break;
        familyId = createFamilyId();
        familyCode = createFamilyCode();
      }
      const familyDoc = {
        _id: familyId,
        ownerId: req.userId,
        groupName: String(req.body?.group_name || 'Family Hub').slice(0, 60),
        familyCode,
        members: [{ user_id: req.userId, role: 'owner' }],
        createdAt: new Date(),
      };
      await families.insertOne(familyDoc);
      await familyGroups.insertOne({ ...familyDoc, familyId });
      await familyMembersCollection.insertOne({
        userId: req.userId,
        familyId,
        role: 'owner',
        createdAt: new Date(),
      });
      emitFamilyEvent(familyId, 'family_member_added', { family_id: familyId, user_id: req.userId, role: 'owner' });
      return res.status(201).json({ family_id: familyId, family_code: familyCode });
    } catch (err) {
      console.error('Family create error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/family/join', authMiddleware, async (req, res) => {
    try {
      const { family_code } = req.body as { family_code?: string };
      if (!family_code) return res.status(400).json({ message: 'family_code is required' });
      const code = String(family_code).trim().toUpperCase();
      const familyDoc = await families.findOne({ familyCode: code });
      if (!familyDoc) return res.status(404).json({ message: 'Family code invalid' });

      const existingMembers = Array.isArray(familyDoc.members) ? familyDoc.members : [];
      const already = existingMembers.some((m: any) => String(m.user_id) === String(req.userId));
      if (!already) {
        const nextMembers = [...existingMembers, { user_id: req.userId, role: 'member' }];
        await families.updateOne(
          { _id: familyDoc._id },
          { $set: { members: nextMembers } },
        );
        await familyMembersCollection.insertOne({
          userId: req.userId,
          familyId: familyDoc._id,
          role: 'member',
          createdAt: new Date(),
        });
        await familyGroups.updateOne(
          { familyId: familyDoc._id },
          { $set: { members: nextMembers, updatedAt: new Date() } },
          { upsert: true } as any,
        );
      }

      emitFamilyEvent(String(familyDoc._id), 'family_member_joined', {
        family_id: familyDoc._id,
        user_id: req.userId,
        message: 'New member joined the family',
      });
      emitFamilyEvent(String(familyDoc._id), 'family_member_added', {
        family_id: familyDoc._id,
        user_id: req.userId,
        role: 'member',
      });
      return res.json({ ok: true, family_id: familyDoc._id, family_code: familyDoc.familyCode });
    } catch (err) {
      console.error('Family join error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/family/member-modules', authMiddleware, async (req, res) => {
    try {
      const relationRaw = String(req.query.relation || 'self').toLowerCase();
      const relationToType: Record<string, FamilyMemberType> = {
        father: 'parent',
        mother: 'parent',
        grandmother: 'parent',
        grandfather: 'parent',
        wife: 'spouse',
        husband: 'spouse',
        'boy child': 'child',
        'girl child': 'child',
        brother: 'spouse',
        sister: 'spouse',
        other: 'self',
        child: 'child',
        spouse: 'spouse',
        self: 'self',
      };
      const memberType = relationToType[relationRaw] || mapRelationshipToMemberType(relationRaw);
      return res.json({
        relation: relationRaw,
        member_type: memberType,
        modules: FAMILY_MODULES[memberType] || FAMILY_MODULES.self,
      });
    } catch (err) {
      console.error('Get member modules error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/daily-metrics', authMiddleware, async (req, res) => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const txs = await transactions.find({ userId: req.userId }).toArray();
      const todayTxs = txs.filter((t) => String(t.date).slice(0, 10) === todayKey);
      const burned = Math.max(100, 120 + todayTxs.length * 30);
      const hydration = Math.max(2, Math.min(8, 3 + Math.round(todayTxs.length / 2)));
      const sleepHours = 6 + (todayTxs.length % 3);
      const nutrition = Math.max(1200, 1500 + todayTxs.reduce((s, t) => s + Number(t.amount || 0), 0) % 700);
      const meds = await family.find({ userId: req.userId }).toArray();
      const medTaken = meds
        .flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []))
        .reduce((s: number, med: any) => s + Number(med.takenReminders || 0), 0);

      const data = {
        hydration,
        sleep_hours: sleepHours,
        calories_burned: burned,
        nutrition_intake: nutrition,
        health_planet: Math.max(0, Math.min(100, medTaken * 5 + hydration * 4)),
        meds_supplements: medTaken,
        tasks: Math.max(0, todayTxs.length),
      };

      await dailyMetrics.updateOne(
        { userId: req.userId, date: todayKey },
        { $set: { userId: req.userId, date: todayKey, ...data, updatedAt: new Date() } },
        { upsert: true } as any,
      );
      return res.json(data);
    } catch (err) {
      console.error('Daily metrics error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
      const cacheKey = `dashboard:${req.userId}`;
      const cached = await getCache(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      const [txs, userBills, events] = await Promise.all([
        transactions.find({ userId: req.userId }).toArray(),
        bills.find({ userId: req.userId }).toArray(),
        lifeEvents.find({ userId: req.userId }).sort({ date: -1 }).limit(20).toArray(),
      ]);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthlySpend = txs
        .filter((t) => t.isDebit !== false && new Date(t.date).getTime() >= monthStart.getTime())
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const unpaidBills = userBills.filter((b) => !b.isPaid).length;
      const payload = {
        monthly_spend: monthlySpend,
        unpaid_bills: unpaidBills,
        recent_events: events.map((e) => ({
          id: e._id.toString(),
          title: e.title,
          type: e.type,
          date: e.date,
        })),
      };
      await setCache(cacheKey, JSON.stringify(payload), 180);
      return res.json(payload);
    } catch (err) {
      console.error('Dashboard data error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/reminders/voice-create', authMiddleware, async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || !String(text).trim()) {
        return res.status(400).json({ message: 'text is required' });
      }
      const cleanText = normalizeDigits(String(text).trim());
      const amount = extractAmount(cleanText);
      const person = extractPerson(cleanText);
      const date = extractDateFromText(cleanText);
      const type = inferReminderType(cleanText);
      const title = toReminderTitle(type, person, amount, cleanText.slice(0, 48));

      const doc = {
        userId: req.userId,
        title,
        textInput: cleanText,
        amount,
        person,
        date: date.toISOString().slice(0, 10),
        type,
        status: 'active',
        createdAt: new Date(),
      };
      const reminderResult = await reminders.insertOne(doc);
      await addLifeEvent({
        userId: req.userId,
        type: type === 'payment' ? 'bill' : 'reminder',
        title,
        date,
        source: 'voice_create',
        metadata: { amount, person, reminderType: type },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'reminder_created', { title, type });
      return res.status(201).json({
        id: reminderResult.insertedId.toString(),
        title,
        amount,
        date: doc.date,
        type,
      });
    } catch (err) {
      console.error('Voice-create reminder error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/memory/settings', authMiddleware, async (req, res) => {
    try {
      const existing = await lifeMemory.findOne({ userId: req.userId });
      const patternDuration = Number(existing?.patternDuration || 30);
      return res.json({ pattern_duration: patternDuration });
    } catch (err) {
      console.error('Get memory settings error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/memory/settings', authMiddleware, async (req, res) => {
    try {
      const { pattern_duration } = req.body as { pattern_duration?: number };
      const duration = Number(pattern_duration || 30);
      if (![10, 15, 30, 60].includes(duration)) {
        return res.status(400).json({ message: 'pattern_duration must be one of 10, 15, 30, 60' });
      }
      await lifeMemory.updateOne(
        { userId: req.userId },
        {
          $set: {
            userId: req.userId,
            patternDuration: duration,
            updatedAt: new Date(),
          },
        },
        { upsert: true } as any,
      );
      return res.json({ ok: true, pattern_duration: duration });
    } catch (err) {
      console.error('Post memory settings error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/memory/insights', authMiddleware, async (req, res) => {
    try {
      const settings = await lifeMemory.findOne({ userId: req.userId });
      const patternDuration = Number(settings?.patternDuration || 30);
      const start = new Date();
      start.setDate(start.getDate() - patternDuration);

      const txs = await transactions.find({ userId: req.userId, isDebit: true }).toArray();
      const recentTxs = txs.filter((t) => new Date(t.date).getTime() >= start.getTime());
      const meds = await medicineLogs.find({ userId: req.userId }).toArray();
      const recentMeds = meds.filter((m) => new Date(m.date || m.createdAt || 0).getTime() >= start.getTime());

      const weekendLate = recentTxs.filter((t) => {
        const dt = new Date(t.date);
        const day = dt.getDay();
        return (day === 0 || day === 6) && dt.getHours() >= 23;
      }).length;

      const overspendingDays = new Set(
        recentTxs
          .filter((t) => t.amount >= 1200)
          .map((t) => new Date(t.date).toISOString().slice(0, 10)),
      ).size;

      const medMissed = recentMeds.filter((m) => m.status === 'missed').length;

      const habits: string[] = [];
      if (weekendLate >= 2) habits.push('You usually sleep late on weekends.');
      if (overspendingDays >= 3) habits.push('You tend to overspend on a few specific days.');
      if (medMissed >= 2) habits.push('Medicine adherence can improve. You missed doses on multiple days.');
      if (habits.length === 0) habits.push('Good consistency detected. Keep maintaining your routine.');

      return res.json({
        pattern_duration: patternDuration,
        habits,
        metrics: {
          weekend_late_sleep_count: weekendLate,
          overspending_days: overspendingDays,
          medicine_missed_count: medMissed,
        },
      });
    } catch (err) {
      console.error('Get memory insights error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/reports', authMiddleware, async (req, res) => {
    try {
      const rangeRaw = String(req.query.range || req.query.type || '30days').toLowerCase();
      const valueRaw = String(req.query.value || '').toLowerCase();
      let start = new Date();
      let range = rangeRaw;
      start.setHours(0, 0, 0, 0);
      if (rangeRaw === 'day' || rangeRaw === 'daily') {
        range = 'day';
      } else if (rangeRaw === 'month' || rangeRaw === 'monthly') {
        range = 'month';
        if (/^\d{4}-\d{2}$/.test(valueRaw)) {
          const [yy, mm] = valueRaw.split('-').map(Number);
          start = new Date(yy, mm - 1, 1);
        } else {
          start.setDate(1);
        }
      } else if (rangeRaw === 'year' || rangeRaw === 'yearly') {
        range = 'year';
        if (/^\d{4}$/.test(valueRaw)) {
          start = new Date(Number(valueRaw), 0, 1);
        } else {
          start = new Date(new Date().getFullYear(), 0, 1);
        }
      } else if (rangeRaw === 'custom' || rangeRaw === 'customdays') {
        const allowed = [10, 30, 60, 90];
        const days = allowed.includes(Number(valueRaw)) ? Number(valueRaw) : 30;
        range = 'custom';
        start.setDate(start.getDate() - (days - 1));
      } else {
        const fallback = ['10days', '30days', '50days'].includes(rangeRaw) ? rangeRaw : '30days';
        start = getRangeStart(fallback);
        range = fallback;
      }

      const txs = await transactions.find({ userId: req.userId }).toArray();
      const memberList = await family.find({ userId: req.userId }).toArray();

      const filteredTxs = txs.filter((t) => new Date(t.date).getTime() >= start.getTime());
      const tasksCompleted = filteredTxs.filter((t) => !t.isDebit).length;
      const billsPaid = filteredTxs.filter((t) => t.isDebit).length;

      const allMeds = memberList.flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []));
      const medicineTaken = allMeds.reduce((sum, med: any) => sum + Number(med.takenReminders || 0), 0);

      const activeReminders = await bills.find({ userId: req.userId }).toArray();
      const remindersMissed = activeReminders.filter((b) => !b.isPaid && new Date(b.dueDate).getTime() < Date.now()).length;
      const lifeScore = Math.max(
        0,
        tasksCompleted * 2 + medicineTaken * 3 + billsPaid * 2 - remindersMissed * 2,
      );

      const reportDoc = {
        userId: req.userId,
        range,
        type: range,
        tasks_completed: tasksCompleted,
        reminders_missed: remindersMissed,
        bills_paid: billsPaid,
        medicine_taken: medicineTaken,
        life_score: lifeScore,
        generatedAt: new Date(),
      };
      await reports.insertOne(reportDoc);

      return res.json(reportDoc);
    } catch (err) {
      console.error('Get reports error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/activity', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const events = await lifeEvents
        .find({ userId: req.userId })
        .sort({ date: -1 })
        .limit(limit)
        .toArray();
      return res.json(
        events.map((ev) => ({
          id: ev._id.toString(),
          title: ev.title,
          type: ev.type,
          date: ev.date,
          source: ev.source || 'system',
          metadata: ev.metadata || {},
        })),
      );
    } catch (err) {
      console.error('Activity feed error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/life-flow/timeline', authMiddleware, async (req, res) => {
    try {
      const rangeRaw = String(req.query.range || '30days').toLowerCase();
      const start = getRangeStart(rangeRaw);
      const events = await lifeEvents
        .find({ userId: req.userId })
        .sort({ date: -1 })
        .limit(400)
        .toArray();
      const filtered = events.filter((ev) => new Date(ev.date).getTime() >= start.getTime());
      return res.json(
        filtered.map((ev) => ({
          id: ev._id.toString(),
          type: ev.type,
          title: ev.title,
          date: ev.date,
          source: ev.source,
          metadata: ev.metadata || {},
        })),
      );
    } catch (err) {
      console.error('Life-flow timeline error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/life-flow/daily-plan', authMiddleware, async (req, res) => {
    try {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const upcomingBills = (await bills.find({ userId: req.userId, isPaid: { $ne: true } }).toArray()).filter(
        (b) => {
          const due = new Date(b.dueDate).getTime();
          return due >= now.getTime() && due <= end.getTime() + 24 * 60 * 60 * 1000;
        },
      );
      const remindersToday = (await reminders.find({ userId: req.userId }).toArray()).filter((r) => {
        const d = new Date(r.date).getTime();
        return d >= now.getTime() && d <= end.getTime() + 24 * 60 * 60 * 1000;
      });
      const familyMembers = await family.find({ userId: req.userId }).toArray();
      const pendingFamilyTasks = await familyTasks.find({ userId: req.userId, done: { $ne: true } }).toArray();
      const familyPlan = familyMembers.flatMap((m) =>
        (Array.isArray(m.medicines) ? m.medicines : []).map((med: any) => ({
          time: med.slots?.morning || med.slots?.noon || med.slots?.evening || '9:00 AM',
          title: `${m.name}: ${med.name}`,
          type: 'medicine',
          source: 'family',
        })),
      );
      const predictedTasks = [];
      if (upcomingBills.length > 0) {
        predictedTasks.push({
          time: '5:00 PM',
          title: `${upcomingBills[0].name} due soon`,
          type: 'bill',
          source: 'prediction',
        });
      }
      const plan = [
        ...remindersToday.map((r) => ({
          time: new Date(r.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          title: r.title,
          type: 'reminder',
          source: r.source,
        })),
        ...upcomingBills.map((b) => ({
          time: new Date(b.dueDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          title: b.name,
          type: 'bill',
          source: b.source || 'bills',
        })),
        ...familyPlan,
        ...pendingFamilyTasks.slice(0, 5).map((t) => ({
          time: '11:00 AM',
          title: t.title,
          type: 'task',
          source: 'family_task',
        })),
        ...predictedTasks,
      ];
      return res.json({ date: new Date().toISOString().slice(0, 10), plan });
    } catch (err) {
      console.error('Daily plan error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/life-flow/predictions', authMiddleware, async (req, res) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const events = await lifeEvents.find({ userId: req.userId }).toArray();
      const recent = events.filter((e) => new Date(e.date).getTime() >= sevenDaysAgo.getTime());

      const missedMeds = recent.filter((e) => e.type === 'medicine' && e.metadata?.action === 'skip').length;
      const upcomingBills = (await bills.find({ userId: req.userId, isPaid: { $ne: true } }).toArray()).filter((b) => {
        const due = new Date(b.dueDate).getTime();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return due <= tomorrow.getTime() && due >= Date.now();
      });

      const predictions = [];
      if (missedMeds >= 3) {
        predictions.push({
          type: 'risk',
          title: 'You missed BP medicine 3 times this week.',
          suggestion: 'Should we move reminder earlier?',
          severity: 'high',
        });
      }
      if (upcomingBills.length > 0) {
        predictions.push({
          type: 'alert',
          title: `${upcomingBills[0].name} bill likely due tomorrow.`,
          suggestion: 'Pay now to avoid late fee.',
          severity: 'medium',
        });
      }
      if (predictions.length === 0) {
        predictions.push({
          type: 'info',
          title: 'No risky pattern detected this week.',
          suggestion: 'Keep following your LifeFlow plan.',
          severity: 'low',
        });
      }
      return res.json({ predictions });
    } catch (err) {
      console.error('Predictions error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/family/graph', authMiddleware, async (req, res) => {
    try {
      const nodes = await familyNodes.find({ parentUser: req.userId }).toArray();
      return res.json(
        nodes.map((n) => ({
          id: n._id.toString(),
          parent_user: n.parentUser,
          member_name: n.memberName,
          relation: n.relation,
          modules: n.modules || [],
        })),
      );
    } catch (err) {
      console.error('Family graph error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/life-flow/smart-capture', authMiddleware, async (req, res) => {
    try {
      const {
        type,
        input_mode,
        text_input,
      } = req.body as {
        type?: 'reminder' | 'bill' | 'task' | 'expense' | 'note';
        input_mode?: 'voice' | 'text' | 'photo';
        text_input?: string;
      };
      const captureType = type || 'note';
      const mode = input_mode || 'text';
      const text = String(text_input || '').trim();
      if (!text) return res.status(400).json({ message: 'text_input is required' });

      if (captureType === 'expense') {
        const amount = extractAmount(text);
        const doc = {
          userId: req.userId,
          merchant: extractPerson(text) || 'Smart Capture',
          amount: amount || 0,
          category: 'others' as CategoryType,
          date: new Date().toISOString(),
          upiId: '',
          isDebit: true,
          description: text,
        };
        const tx = await transactions.insertOne(doc);
        await addLifeEvent({
          userId: req.userId,
          type: 'expense',
          title: `Spent ₹${Math.round(doc.amount)} at ${doc.merchant}`,
          source: 'smart_capture',
          metadata: { input_mode: mode },
        });
        return res.status(201).json({ id: tx.insertedId.toString(), type: captureType });
      }

      if (captureType === 'bill' || captureType === 'reminder') {
        const amount = extractAmount(text);
        const date = extractDateFromText(text);
        const billDoc = {
          userId: req.userId,
          name: text.slice(0, 80),
          amount: amount || 0,
          dueDate: date.toISOString(),
          category: 'bills' as CategoryType,
          isPaid: false,
          icon: 'sparkles',
          reminderType: 'custom' as ReminderType,
          repeatType: 'none' as RepeatType,
          status: 'active' as ReminderStatus,
          reminderDaysBefore: [0],
          source: 'smart_capture',
          createdAt: new Date(),
        };
        const bill = await bills.insertOne(billDoc);
        await addLifeEvent({
          userId: req.userId,
          type: captureType === 'bill' ? 'bill' : 'reminder',
          title: billDoc.name,
          date,
          source: 'smart_capture',
          metadata: { amount: billDoc.amount, input_mode: mode },
        });
        return res.status(201).json({ id: bill.insertedId.toString(), type: captureType });
      }

      if (captureType === 'task') {
        const task = await familyTasks.insertOne({
          userId: req.userId,
          title: text,
          done: false,
          createdAt: new Date(),
        });
        await addLifeEvent({
          userId: req.userId,
          type: 'task',
          title: text,
          source: 'smart_capture',
          metadata: { input_mode: mode },
        });
        return res.status(201).json({ id: task.insertedId.toString(), type: captureType });
      }

      await addLifeEvent({
        userId: req.userId,
        type: 'habit',
        title: text,
        source: 'smart_capture',
        metadata: { input_mode: mode, capture_type: captureType },
      });
      return res.status(201).json({ ok: true, type: captureType });
    } catch (err) {
      console.error('Smart capture error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/capture/create', authMiddleware, async (req, res) => {
    try {
      const {
        title,
        category,
        amount,
        date,
        notes,
      } = req.body as {
        title?: string;
        category?: 'Reminder' | 'Expense' | 'Bill' | 'Task' | 'Document';
        amount?: number;
        date?: string;
        notes?: string;
      };
      if (!title || !category) {
        return res.status(400).json({ message: 'title and category are required' });
      }
      const eventDate = date ? new Date(date) : new Date();
      const cat = String(category).toLowerCase();
      const normalizedType =
        cat === 'expense' ? 'expense' : cat === 'bill' ? 'bill' : cat === 'task' ? 'task' : 'reminder';

      if (normalizedType === 'expense') {
        await transactions.insertOne({
          userId: req.userId,
          merchant: title,
          amount: Number(amount || 0),
          category: 'others',
          date: eventDate.toISOString(),
          upiId: '',
          isDebit: true,
          description: notes || '',
        });
      } else if (normalizedType === 'bill' || normalizedType === 'reminder') {
        await bills.insertOne({
          userId: req.userId,
          name: title,
          amount: Number(amount || 0),
          dueDate: eventDate.toISOString(),
          category: normalizedType === 'bill' ? 'bills' : 'others',
          isPaid: false,
          icon: normalizedType === 'bill' ? 'calendar' : 'flash',
          reminderType: 'custom',
          repeatType: 'none',
          status: 'active',
          reminderDaysBefore: [0],
          source: 'capture_create',
          notes: notes || '',
          createdAt: new Date(),
        });
      } else if (normalizedType === 'task') {
        await familyTasks.insertOne({
          userId: req.userId,
          title,
          done: false,
          createdAt: new Date(),
          notes: notes || '',
        });
      }

      await addLifeEvent({
        userId: req.userId,
        type: normalizedType as 'reminder' | 'medicine' | 'bill' | 'task' | 'habit' | 'expense',
        title,
        date: eventDate,
        source: 'capture_create',
        metadata: { category, amount: Number(amount || 0), notes: notes || '' },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, normalizedType === 'expense' ? 'expense_added' : 'reminder_created', {
        title,
        category,
      });
      emitUserEvent(req.userId, 'event_created', {
        title,
        category,
        type: normalizedType,
      });
      return res.status(201).json({ ok: true, title, category, amount: Number(amount || 0), date: eventDate.toISOString() });
    } catch (err) {
      console.error('Capture create error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/events/create', authMiddleware, async (req, res) => {
    try {
      const {
        title,
        category,
        amount,
        date,
        notes,
      } = req.body as {
        title?: string;
        category?: 'Reminder' | 'Expense' | 'Bill' | 'Task' | 'Document';
        amount?: number;
        date?: string;
        notes?: string;
      };
      if (!title || !category) {
        return res.status(400).json({ message: 'title and category are required' });
      }
      const eventDate = date ? new Date(date) : new Date();
      const cat = String(category).toLowerCase();
      const normalizedType =
        cat === 'expense' ? 'expense' : cat === 'bill' ? 'bill' : cat === 'task' ? 'task' : 'reminder';

      await addLifeEvent({
        userId: req.userId,
        type: normalizedType as 'reminder' | 'medicine' | 'bill' | 'task' | 'habit' | 'expense',
        title,
        date: eventDate,
        source: 'events_create',
        metadata: { category, amount: Number(amount || 0), notes: notes || '' },
      });
      await invalidateDashboard(req.userId);
      emitUserEvent(req.userId, 'event_created', { title, category, type: normalizedType });
      return res.status(201).json({ ok: true, title, category, amount: Number(amount || 0), date: eventDate.toISOString() });
    } catch (err) {
      console.error('Events create error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/capture/history', authMiddleware, async (req, res) => {
    try {
      const items = await lifeEvents
        .find({
          userId: req.userId,
          source: { $in: ['smart_capture', 'capture_create'] },
        })
        .sort({ date: -1 })
        .limit(100)
        .toArray();
      return res.json(items.map((i) => ({ id: i._id.toString(), type: i.type, title: i.title, date: i.date, source: i.source, metadata: i.metadata || {} })));
    } catch (err) {
      console.error('Capture history error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/reminders/voice-history', authMiddleware, async (req, res) => {
    try {
      const list = await reminders
        .find({
          userId: req.userId,
          source: { $in: ['voice_reminder', 'voice_create'] },
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      return res.json(list.map((r) => ({ id: r._id.toString(), title: r.title, text: r.textInput || '', amount: r.amount || 0, date: r.date, type: r.type || 'reminder' })));
    } catch (err) {
      console.error('Voice history error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.patch('/api/reminders/voice-history/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const { title, text } = req.body as { title?: string; text?: string };
      const update: Record<string, unknown> = {};

      if (typeof title === 'string' && title.trim()) {
        update.title = title.trim().slice(0, 140);
      }
      if (typeof text === 'string' && text.trim()) {
        update.textInput = text.trim().slice(0, 5000);
      }
      if (!Object.keys(update).length) {
        return res.status(400).json({ message: 'title or text is required' });
      }
      update.updatedAt = new Date();

      const result = await reminders.findOneAndUpdate(
        {
          _id: toId(id),
          userId: req.userId,
          source: { $in: ['voice_reminder', 'voice_create'] },
        },
        { $set: update },
        { returnDocument: 'after' },
      );

      const doc = result?.value;
      if (!doc) return res.status(404).json({ message: 'Voice reminder not found' });

      return res.json({
        id: doc._id.toString(),
        title: doc.title,
        text: doc.textInput || '',
        amount: doc.amount || 0,
        date: doc.date,
        type: doc.type || 'reminder',
      });
    } catch (err) {
      console.error('Voice reminder update error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.delete('/api/reminders/voice-history/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const result = await reminders.deleteOne({
        _id: toId(id),
        userId: req.userId,
        source: { $in: ['voice_reminder', 'voice_create'] },
      });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Voice reminder not found' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Voice reminder delete error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/bills/scanned-history', authMiddleware, async (req, res) => {
    try {
      const list = await bills.find({ userId: req.userId, source: 'scan_bill' }).sort({ createdAt: -1 }).limit(100).toArray();
      return res.json(list.map((b) => ({ id: b._id.toString(), name: b.name, amount: b.amount || 0, dueDate: b.dueDate, imageUrl: b.imageUrl || null })));
    } catch (err) {
      console.error('Scanned bills history error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/life-planet', authMiddleware, async (req, res) => {
    try {
      const userBills = await bills.find({ userId: req.userId }).toArray();
      const userTxs = await transactions.find({ userId: req.userId }).toArray();
      const userFamily = await family.find({ userId: req.userId }).toArray();
      const tasks = await familyTasks.find({ userId: req.userId }).toArray();

      const remindersCompleted = userBills.filter((b) => b.isPaid).length;
      const billsPaid = userTxs.filter((t) => t.isDebit).length;
      const tasksCompleted = tasks.filter((t: any) => t.done).length;
      const missedTasks = tasks.filter((t: any) => !t.done).length;
      const medicineTaken = userFamily
        .flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []))
        .reduce((sum: number, med: any) => sum + Number(med.takenReminders || 0), 0);

      const lifeScore = Math.max(
        0,
        remindersCompleted * 2 + medicineTaken * 3 + billsPaid * 2 - missedTasks,
      );
      const stage = lifeScore < 20 ? 1 : lifeScore < 45 ? 2 : lifeScore < 70 ? 3 : lifeScore < 95 ? 4 : 5;
      const stageLabel = ['Tiny planet', 'Green planet', 'Planet with trees', 'Civilization planet', 'Advanced planet'][stage - 1];

      await lifeScores.insertOne({
        userId: req.userId,
        lifeScore,
        stage,
        remindersCompleted,
        medicineTaken,
        billsPaid,
        tasksCompleted,
        missedTasks,
        createdAt: new Date(),
      });

      return res.json({
        life_score: lifeScore,
        stage,
        stage_label: stageLabel,
        completed_tasks: tasksCompleted,
        missed_tasks: missedTasks,
        metrics: {
          reminders_completed: remindersCompleted,
          medicine_taken: medicineTaken,
          bills_paid: billsPaid,
          tasks_completed: tasksCompleted,
          missed_tasks: missedTasks,
        },
      });
    } catch (err) {
      console.error('Get life planet error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/life-planet/status', authMiddleware, async (req, res) => {
    try {
      const userBills = await bills.find({ userId: req.userId }).toArray();
      const userTxs = await transactions.find({ userId: req.userId }).toArray();
      const userFamily = await family.find({ userId: req.userId }).toArray();
      const tasks = await familyTasks.find({ userId: req.userId }).toArray();

      const remindersCompleted = userBills.filter((b) => b.isPaid).length;
      const billsPaid = userTxs.filter((t) => t.isDebit).length;
      const tasksCompleted = tasks.filter((t: any) => t.done).length;
      const missedTasks = tasks.filter((t: any) => !t.done).length;
      const medicineTaken = userFamily
        .flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []))
        .reduce((sum: number, med: any) => sum + Number(med.takenReminders || 0), 0);

      const lifeScore = Math.max(0, remindersCompleted * 2 + medicineTaken * 3 + billsPaid * 2 - missedTasks);
      const stage = lifeScore < 20 ? 1 : lifeScore < 45 ? 2 : lifeScore < 70 ? 3 : lifeScore < 95 ? 4 : 5;
      return res.json({
        life_score: lifeScore,
        stage,
        completed_tasks: tasksCompleted,
        missed_tasks: missedTasks,
        reminders_completed: remindersCompleted,
        bills_paid: billsPaid,
        medicine_taken: medicineTaken,
      });
    } catch (err) {
      console.error('Get life planet status error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  // ----- AI Assistant (chat list + messages + generation) -----
  function toChatTitle(text: string): string {
    const cleaned = String(text || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'New chat';
    return cleaned.slice(0, 48);
  }

  async function generateAssistantReply(
    userId: string,
    userMessages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const openAIKey = getOpenAIKey();
    if (!openAIKey) {
      throw new Error('Assistant is not configured. Set OPENAI_API_KEY.');
    }

    const [userDoc, recentTx, recentBills, familyMembers] = await Promise.all([
      users.findOne({ _id: toId(userId) }),
      transactions.find({ userId }).sort({ date: -1 }).limit(50).toArray(),
      bills.find({ userId }).limit(20).toArray(),
      family.find({ userId }).limit(10).toArray(),
    ]);

    const leakList = await transactions.find({ userId, isDebit: true }).toArray();
    const merchantFreq: Record<string, { count: number; total: number; category: CategoryType }> = {};
    leakList.forEach((t: any) => {
      if (!merchantFreq[t.merchant]) {
        merchantFreq[t.merchant] = {
          count: 0,
          total: 0,
          category: (t.category as CategoryType) || 'others',
        };
      }
      merchantFreq[t.merchant].count++;
      merchantFreq[t.merchant].total += Number(t.amount || 0);
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
        id: userId,
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
      const createThreadRes = await fetch(`${baseUrl}/threads`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({}),
      });
      if (!createThreadRes.ok) throw new Error('Assistant thread creation failed.');
      const { id: threadId } = (await createThreadRes.json()) as { id: string };

      const contextContent = 'LifeWise user data context (use for personalised advice): ' + JSON.stringify(snapshot);
      const addCtxRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ role: 'user', content: contextContent }),
      });
      if (!addCtxRes.ok) throw new Error('Assistant context load failed.');

      for (const m of userMessages.filter((m) => m.role === 'user' || m.role === 'assistant')) {
        const addRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ role: m.role, content: m.content }),
        });
        if (!addRes.ok) throw new Error('Assistant message add failed.');
      }

      const runRes = await fetch(`${baseUrl}/threads/${threadId}/runs`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ assistant_id: OPENAI_ASSISTANT_ID }),
      });
      if (!runRes.ok) throw new Error('Assistant run failed.');
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
          throw new Error(`Assistant run ${status}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (status !== 'completed') throw new Error('Assistant timeout');

      const listMsgRes = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${openAIKey}`, 'OpenAI-Beta': 'assistants=v2' },
      });
      if (!listMsgRes.ok) throw new Error('Assistant messages fetch failed.');
      const listData = (await listMsgRes.json()) as {
        data?: Array<{ role: string; content?: Array<{ type: string; text?: { value?: string } }> }>;
      };
      const data = listData.data || [];
      const lastAssistant = data.find((m) => m.role === 'assistant');
      return (
        lastAssistant?.content?.find((c) => c.type === 'text')?.text?.value ||
        'Sorry, I could not generate a response right now.'
      );
    }

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
      body: JSON.stringify({ model: OPENAI_MODEL, messages: messagesForModel, temperature: 0.4 }),
    });
    if (!openAiRes.ok) throw new Error('Assistant completion failed.');
    const json = await openAiRes.json();
    return json.choices?.[0]?.message?.content || 'Sorry, I could not generate a response right now.';
  }

  app.get('/api/assistant/chats', authMiddleware, async (req, res) => {
    try {
      const list = await aiChats
        .find({ userId: req.userId })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return res.json(
        list.map((c: any) => ({
          id: c._id.toString(),
          title: c.title || 'New chat',
          preview: c.preview || '',
          updatedAt: c.updatedAt || c.createdAt,
          messageCount: Number(c.messageCount || 0),
        })),
      );
    } catch (err) {
      console.error('Assistant chat list error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/assistant/chats', authMiddleware, async (req, res) => {
    try {
      const body = req.body as { title?: string };
      const now = new Date();
      const result = await aiChats.insertOne({
        userId: req.userId,
        title: toChatTitle(body?.title || ''),
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      return res.status(201).json({ id: result.insertedId.toString() });
    } catch (err) {
      console.error('Assistant chat create error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/assistant/chats/:chatId/messages', authMiddleware, async (req, res) => {
    try {
      const chatId = req.params.chatId;
      const chatDoc = await aiChats.findOne({ _id: toId(chatId), userId: req.userId });
      if (!chatDoc) return res.status(404).json({ message: 'Chat not found' });
      const messages = await aiChatMessages
        .find({ chatId, userId: req.userId })
        .sort({ createdAt: 1 })
        .toArray();
      return res.json({
        chat: {
          id: chatId,
          title: (chatDoc as any).title || 'New chat',
          preview: (chatDoc as any).preview || '',
          updatedAt: (chatDoc as any).updatedAt || (chatDoc as any).createdAt,
        },
        messages: messages.map((m: any) => ({
          id: m._id.toString(),
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      console.error('Assistant messages error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/api/assistant/chat', authMiddleware, async (req, res) => {
    try {
      const body = req.body as {
        chat_id?: string;
        create_chat?: boolean;
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      };
      const userMessages = Array.isArray(body.messages) ? body.messages : [];
      const lastUserMessage = [...userMessages].reverse().find((m) => m.role === 'user' && String(m.content || '').trim());
      if (!lastUserMessage) return res.status(400).json({ message: 'Message is required' });

      let chatId = body.chat_id ? String(body.chat_id) : '';
      if (chatId) {
        const exists = await aiChats.findOne({ _id: toId(chatId), userId: req.userId });
        if (!exists) return res.status(404).json({ message: 'Chat not found' });
      } else if (body.create_chat) {
        const now = new Date();
        const createRes = await aiChats.insertOne({
          userId: req.userId,
          title: toChatTitle(lastUserMessage.content),
          preview: '',
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        chatId = createRes.insertedId.toString();
      }

      const reply = await generateAssistantReply(req.userId, userMessages);

      if (chatId) {
        const now = new Date();
        await aiChatMessages.insertMany([
          { chatId, userId: req.userId, role: 'user', content: lastUserMessage.content, createdAt: now },
          { chatId, userId: req.userId, role: 'assistant', content: reply, createdAt: new Date(now.getTime() + 1) },
        ]);
        await aiConversations.insertOne({
          userId: req.userId,
          chatId,
          message: lastUserMessage.content,
          reply,
          createdAt: now,
        });
        const doc = await aiChats.findOne({ _id: toId(chatId), userId: req.userId });
        const nextCount = Number((doc as any)?.messageCount || 0) + 2;
        await aiChats.updateOne(
          { _id: toId(chatId), userId: req.userId },
          {
            $set: {
              updatedAt: now,
              preview: reply.slice(0, 160),
              title: (doc as any)?.title || toChatTitle(lastUserMessage.content),
              messageCount: nextCount,
            },
          },
        );
      }

      return res.json({ reply, chat_id: chatId || null });
    } catch (err) {
      console.error('Assistant chat error:', err);
      return res.status(500).json({ message: 'Assistant error. Please try again later.' });
    }
  });

  app.post('/api/ai/chat', authMiddleware, async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ message: 'message is required' });
      const reply = await generateAssistantReply(req.userId, [{ role: 'user', content: message }]);
      await aiConversations.insertOne({
        userId: req.userId,
        chatId: null,
        message,
        reply,
        createdAt: new Date(),
      });
      return res.json({ reply });
    } catch (err) {
      console.error('AI chat error:', err);
      return res.status(500).json({ message: 'Assistant error. Please try again later.' });
    }
  });

  // ----- Family Hub (members + medicines) -----
  app.get('/api/family', authMiddleware, async (req, res) => {
    try {
      const list = await family
        .find({
          $or: [{ userId: req.userId }, { linkedUserId: req.userId }],
        })
        .sort({ createdAt: -1 })
        .toArray();
      const out = list.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        relationship: m.relationship || 'self',
        relation: m.relation || m.relationship || 'self',
        memberType: (m.memberType || mapRelationshipToMemberType(m.relationship || m.relation)) as FamilyMemberType,
        modulesEnabled: Array.isArray(m.modulesEnabled) ? m.modulesEnabled : [],
        connectionCode: m.connectionCode || null,
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
      const { name, relationship, relation, member_type } = req.body as {
        name?: string;
        relationship?: string;
        relation?: string;
        member_type?: FamilyMemberType;
      };
      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }
      const relValue = String(relation || relationship || member_type || 'self');
      const memberType = (member_type || mapRelationshipToMemberType(relValue)) as FamilyMemberType;
      const modulesEnabled = FAMILY_MODULES[memberType] || FAMILY_MODULES.self;
      let connectionCode = createFamilyCode();
      for (let i = 0; i < 5; i++) {
        const exists = await family.findOne({ connectionCode });
        if (!exists) break;
        connectionCode = createFamilyCode();
      }
      const doc = {
        userId: req.userId,
        name: String(name).trim(),
        relationship: relValue,
        relation: relValue,
        memberType,
        modulesEnabled,
        connectionCode,
        linkedUserId: null,
        medicines: [] as unknown[],
        createdAt: new Date(),
      };
      const result = await family.insertOne(doc);
      await Promise.all([
        familyNodes.insertOne({
          parentUser: req.userId,
          memberName: doc.name,
          relation: doc.relation,
          modules: doc.modulesEnabled,
          createdAt: new Date(),
        }),
        addLifeEvent({
          userId: req.userId,
          type: 'task',
          title: `Added family member: ${doc.name}`,
          source: 'family_hub',
          metadata: { relation: doc.relation, modules: doc.modulesEnabled },
        }),
      ]);
      return res.status(201).json({
        id: result.insertedId.toString(),
        name: doc.name,
        relationship: doc.relationship,
        relation: doc.relation,
        memberType: doc.memberType,
        modulesEnabled: doc.modulesEnabled,
        connectionCode: doc.connectionCode,
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

  app.post('/api/family/connect', authMiddleware, async (req, res) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code) {
        return res.status(400).json({ message: 'code is required' });
      }
      const codeValue = String(code).trim().toUpperCase();
      const member = await family.findOne({ connectionCode: codeValue });
      if (!member) {
        return res.status(404).json({ message: 'Invalid connection code' });
      }

      await family.updateOne(
        { _id: member._id },
        {
          $set: {
            linkedUserId: req.userId,
            linkedAt: new Date(),
          },
        },
      );

      return res.json({
        ok: true,
        member: {
          id: member._id.toString(),
          name: member.name,
          relation: member.relation || member.relationship,
          memberType: member.memberType || mapRelationshipToMemberType(member.relation || member.relationship),
          modulesEnabled: Array.isArray(member.modulesEnabled) ? member.modulesEnabled : [],
        },
      });
    } catch (err) {
      console.error('Family connect error:', err);
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
      await addLifeEvent({
        userId: req.userId,
        type: 'medicine',
        title:
          action === 'taken'
            ? 'Medicine marked as taken'
            : action === 'skip'
              ? 'Medicine missed'
              : 'Medicine snoozed',
        source: 'family_medicine',
        metadata: { memberId, medId, action },
      });
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
                const notifType =
                  bill.source === 'voice_reminder' || bill.source === 'smart_life_capture'
                    ? 'payment reminder'
                    : bill.category === 'healthcare'
                      ? 'medicine'
                      : 'reminder';

                await notifications.insertOne({
                  userId: user._id?.toString?.() ?? user._id,
                  type: notifType,
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

  function startLifeAnalyticsJobs() {
    setInterval(async () => {
      try {
        const allUsers = await users.find({}).limit(1000).toArray();
        for (const user of allUsers) {
          const userId = user._id?.toString?.() ?? user._id;
          if (!userId) continue;

          const userBills = await bills.find({ userId }).toArray();
          const userTxs = await transactions.find({ userId }).toArray();
          const userFamily = await family.find({ userId }).toArray();
          const settings = await lifeMemory.findOne({ userId });
          const patternDuration = Number(settings?.patternDuration || 30);
          const start = new Date();
          start.setDate(start.getDate() - patternDuration);

          const remindersCompleted = userBills.filter((b) => b.isPaid).length;
          const billsPaid = userTxs.filter((t) => t.isDebit).length;
          const tasksCompleted = userTxs.filter((t) => !t.isDebit).length;
          const medicineTaken = userFamily
            .flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []))
            .reduce((sum: number, med: any) => sum + Number(med.takenReminders || 0), 0);
          const missedReminders = userBills.filter((b) => !b.isPaid && new Date(b.dueDate).getTime() < Date.now()).length;
          const lifeScore = Math.max(
            0,
            tasksCompleted * 2 + medicineTaken * 3 + billsPaid * 2 - missedReminders * 2,
          );

          await lifeScores.insertOne({
            userId,
            lifeScore,
            remindersCompleted,
            medicineTaken,
            billsPaid,
            tasksCompleted,
            missedReminders,
            createdAt: new Date(),
          });

          const recentTxs = userTxs.filter((t) => new Date(t.date).getTime() >= start.getTime());
          const weekendLate = recentTxs.filter((t) => {
            const dt = new Date(t.date);
            const day = dt.getDay();
            return (day === 0 || day === 6) && dt.getHours() >= 23;
          }).length;

          await lifeMemory.updateOne(
            { userId },
            {
              $set: {
                userId,
                patternDuration,
                analysis: {
                  weekendLateSleepCount: weekendLate,
                  updatedAt: new Date(),
                },
              },
            },
            { upsert: true } as any,
          );
        }
      } catch (err) {
        console.error('Life analytics cron error:', err);
      }
    }, 60 * 60 * 1000);

    setInterval(async () => {
      try {
        const allUsers = await users.find({}).limit(1000).toArray();
        for (const user of allUsers) {
          const userId = user._id?.toString?.() ?? user._id;
          if (!userId) continue;
          const txs = await transactions.find({ userId }).toArray();
          const weekendLate = txs.filter((t) => {
            const dt = new Date(t.date);
            const day = dt.getDay();
            return (day === 0 || day === 6) && dt.getHours() >= 23;
          }).length;
          await lifeMemory.updateOne(
            { userId },
            {
              $set: {
                userId,
                analysis: {
                  weekendLateSleepCount: weekendLate,
                  updatedAt: new Date(),
                },
              },
            },
            { upsert: true } as any,
          );
        }
      } catch (err) {
        console.error('Pattern detection daily cron error:', err);
      }
    }, 24 * 60 * 60 * 1000);
  }

  startReminderScheduler();
  startLifeAnalyticsJobs();

  const httpServer = createServer(app);
  return httpServer;
}
