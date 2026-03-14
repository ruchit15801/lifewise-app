import Colors from '@/constants/colors';

export type CategoryType = 'food' | 'shopping' | 'transport' | 'entertainment' | 'bills' | 'healthcare' | 'education' | 'investment' | 'others';

export type ReminderType = 'bill' | 'subscription' | 'custom';
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderStatus = 'active' | 'paid' | 'snoozed';

export interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  category: CategoryType;
  date: string;
  upiId: string;
  isDebit: boolean;
  description: string;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  category: CategoryType;
  isPaid: boolean;
  icon: string;
  reminderType: ReminderType;
  repeatType: RepeatType;
  status: ReminderStatus;
  snoozedUntil?: string;
  reminderDaysBefore: number[];
}

export interface MoneyLeak {
  id: string;
  merchant: string;
  category: CategoryType;
  frequency: string;
  monthlyEstimate: number;
  transactionCount: number;
  suggestion: string;
}

export interface ReminderSettings {
  defaultReminderDays: number[];
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  defaultReminderDays: [3, 1, 0],
  soundEnabled: true,
  vibrationEnabled: true,
};

export const CATEGORIES: Record<CategoryType, { label: string; color: string; icon: string }> = {
  food: { label: 'Food & Dining', color: Colors.categories.food, icon: 'fast-food' },
  shopping: { label: 'Shopping', color: Colors.categories.shopping, icon: 'cart' },
  transport: { label: 'Transport', color: Colors.categories.transport, icon: 'car' },
  entertainment: { label: 'Entertainment', color: Colors.categories.entertainment, icon: 'film' },
  bills: { label: 'Bills & Utilities', color: Colors.categories.bills, icon: 'flash' },
  healthcare: { label: 'Healthcare', color: Colors.categories.healthcare, icon: 'medkit' },
  education: { label: 'Education', color: Colors.categories.education, icon: 'book' },
  investment: { label: 'Investment', color: Colors.categories.investment, icon: 'trending-up' },
  others: { label: 'Others', color: Colors.categories.others, icon: 'ellipsis-horizontal' },
};

export const REMINDER_TYPE_CONFIG: Record<ReminderType, { label: string; icon: string; color: string }> = {
  bill: { label: 'Bill', icon: 'receipt', color: Colors.categories.bills },
  subscription: { label: 'Subscription', icon: 'refresh', color: Colors.categories.entertainment },
  custom: { label: 'Custom', icon: 'create', color: Colors.dark.accentBlue },
};

export const REPEAT_OPTIONS: { key: RepeatType; label: string }[] = [
  { key: 'none', label: 'One-time' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export const ICON_OPTIONS = [
  'flash', 'wifi', 'phone-portrait', 'home', 'play', 'musical-notes',
  'barbell', 'shield-checkmark', 'card', 'water', 'car', 'cart',
  'film', 'book', 'medkit', 'game-controller', 'newspaper', 'globe',
];

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return amount.toLocaleString('en-IN');
  }
  return amount.toString();
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function getCategoryBreakdown(transactions: Transaction[]): { category: CategoryType; total: number; percentage: number }[] {
  const totals: Partial<Record<CategoryType, number>> = {};
  let grandTotal = 0;

  transactions.forEach(tx => {
    if (tx.isDebit) {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
      grandTotal += tx.amount;
    }
  });

  return Object.entries(totals)
    .map(([cat, total]) => ({
      category: cat as CategoryType,
      total: total as number,
      percentage: grandTotal > 0 ? ((total as number) / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function getTodaySpending(transactions: Transaction[]): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return transactions
    .filter(tx => {
      const txDate = new Date(tx.date);
      const txDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
      return txDay.getTime() === today.getTime() && tx.isDebit;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function getMonthlySpending(transactions: Transaction[], month?: number, year?: number): number {
  const now = new Date();
  const m = month ?? now.getMonth();
  const y = year ?? now.getFullYear();

  return transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === m && d.getFullYear() === y && tx.isDebit;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function getDaysUntil(dateStr: string): number {
  const now = new Date();
  const due = new Date(dateStr);
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
