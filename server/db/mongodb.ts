import { MongoClient, Db } from 'mongodb';
import { getMemoryDb } from './memory';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'lifewise';
const CONNECT_TIMEOUT_MS = 5000;

let client: MongoClient;
let db: Db | null = null;
let useMemory = false;

export async function connectMongo(): Promise<Db | ReturnType<typeof getMemoryDb>> {
  if (useMemory) return getMemoryDb();
  if (db) return db;

  try {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS });
    await client.connect();
    db = client.db(DB_NAME);
    await ensureIndexes(db);
    console.log('LifeWise: Connected to MongoDB');
    return db;
  } catch (err) {
    console.warn('MongoDB connection failed (using in-memory store):', (err as Error).message);
    console.warn('Set MONGODB_URI for persistent data (e.g. MongoDB Atlas).');
    useMemory = true;
    return getMemoryDb();
  }
}

async function ensureIndexes(database: Db) {
  await database.collection('users').createIndex({ email: 1 }, { unique: true });
  await database.collection('users').createIndex({ phone: 1 });
  await database.collection('transactions').createIndex({ userId: 1, date: -1 });
  await database.collection('bills').createIndex({ userId: 1, dueDate: 1 });
  await database.collection('notifications').createIndex({ userId: 1, createdAt: -1 });
  await database.collection('reminder_logs').createIndex({ userId: 1, billId: 1, channel: 1, dayOffset: 1 }, { unique: true });
  await database.collection('reminders').createIndex({ userId: 1, createdAt: -1 });
  await database.collection('family_members').createIndex({ connectionCode: 1 });
  await database.collection('family_members').createIndex({ userId: 1, createdAt: -1 });
  await database.collection('family_members').createIndex({ linkedUserId: 1, createdAt: -1 });
  try {
    await database.collection('family_members').createIndex(
      { connectionCode: 1 },
      {
        name: 'connectionCode_unique_string',
        unique: true,
        partialFilterExpression: { connectionCode: { $type: 'string' } },
      },
    );
  } catch {
    // Keep startup resilient when old index definitions already exist in DB.
  }
  await database.collection('life_memory').createIndex({ userId: 1 }, { unique: true });
  await database.collection('life_scores').createIndex({ userId: 1, createdAt: -1 });
  await database.collection('reports').createIndex({ userId: 1, generatedAt: -1 });
  await database.collection('life_events').createIndex({ userId: 1, date: -1 });
  await database.collection('family_nodes').createIndex({ parentUser: 1, relation: 1 });
  await database.collection('families').createIndex({ familyCode: 1 }, { unique: true });
  await database.collection('family_groups').createIndex({ familyCode: 1 }, { unique: true });
  await database.collection('family_members').createIndex(
    { userId: 1, familyId: 1 },
    {
      unique: true,
      partialFilterExpression: { familyId: { $type: 'string' } },
    },
  );
  await database.collection('daily_metrics').createIndex({ userId: 1, date: 1 }, { unique: true });
  await database.collection('ai_chats').createIndex({ userId: 1, updatedAt: -1 });
  await database.collection('ai_chat_messages').createIndex({ chatId: 1, createdAt: 1 });
  await database.collection('ai_conversations').createIndex({ userId: 1, createdAt: -1 });
  await database.collection('money_leak_limits').createIndex({ userId: 1, category: 1 }, { unique: true });
}

export function getDb(): Db | ReturnType<typeof getMemoryDb> {
  if (useMemory) return getMemoryDb();
  if (!db) throw new Error('Database not connected. Call connectMongo() first.');
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    db = null;
  }
}

