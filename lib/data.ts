import Colors from '@/constants/colors';

export type CategoryType = 'food' | 'shopping' | 'transport' | 'entertainment' | 'bills' | 'healthcare' | 'education' | 'investment' | 'others';

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

const MERCHANTS: { name: string; category: CategoryType; upiId: string; minAmount: number; maxAmount: number }[] = [
  { name: 'Swiggy', category: 'food', upiId: 'swiggy@axisbank', minAmount: 150, maxAmount: 800 },
  { name: 'Zomato', category: 'food', upiId: 'zomato@hdfcbank', minAmount: 200, maxAmount: 900 },
  { name: 'Dominos', category: 'food', upiId: 'dominos@icici', minAmount: 300, maxAmount: 1200 },
  { name: 'Starbucks', category: 'food', upiId: 'starbucks@paytm', minAmount: 250, maxAmount: 650 },
  { name: 'Chai Point', category: 'food', upiId: 'chaipoint@upi', minAmount: 60, maxAmount: 180 },
  { name: 'Amazon', category: 'shopping', upiId: 'amazon@apl', minAmount: 500, maxAmount: 5000 },
  { name: 'Flipkart', category: 'shopping', upiId: 'flipkart@axl', minAmount: 400, maxAmount: 8000 },
  { name: 'Myntra', category: 'shopping', upiId: 'myntra@ybl', minAmount: 800, maxAmount: 4000 },
  { name: 'Uber', category: 'transport', upiId: 'uber@icici', minAmount: 80, maxAmount: 500 },
  { name: 'Ola', category: 'transport', upiId: 'ola@axisbank', minAmount: 70, maxAmount: 450 },
  { name: 'Metro Card', category: 'transport', upiId: 'dmrc@sbi', minAmount: 50, maxAmount: 200 },
  { name: 'Netflix', category: 'entertainment', upiId: 'netflix@icici', minAmount: 199, maxAmount: 649 },
  { name: 'Spotify', category: 'entertainment', upiId: 'spotify@hdfcbank', minAmount: 119, maxAmount: 179 },
  { name: 'BookMyShow', category: 'entertainment', upiId: 'bms@paytm', minAmount: 200, maxAmount: 1500 },
  { name: 'Airtel', category: 'bills', upiId: 'airtel@paytm', minAmount: 239, maxAmount: 999 },
  { name: 'Jio Recharge', category: 'bills', upiId: 'jio@axisbank', minAmount: 199, maxAmount: 599 },
  { name: 'Electricity Board', category: 'bills', upiId: 'bescom@sbi', minAmount: 800, maxAmount: 3500 },
  { name: 'Apollo Pharmacy', category: 'healthcare', upiId: 'apollo@hdfcbank', minAmount: 100, maxAmount: 2000 },
  { name: 'Practo Consult', category: 'healthcare', upiId: 'practo@icici', minAmount: 300, maxAmount: 800 },
  { name: 'Udemy', category: 'education', upiId: 'udemy@paytm', minAmount: 399, maxAmount: 3499 },
  { name: 'Zerodha', category: 'investment', upiId: 'zerodha@hdfcbank', minAmount: 1000, maxAmount: 10000 },
  { name: 'Petrol Pump', category: 'transport', upiId: 'hpcl@sbi', minAmount: 500, maxAmount: 3000 },
];

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function generateTransactions(days: number = 30): Transaction[] {
  const transactions: Transaction[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const txCount = randomBetween(2, 6);

    for (let t = 0; t < txCount; t++) {
      const merchant = MERCHANTS[randomBetween(0, MERCHANTS.length - 1)];
      const hour = randomBetween(7, 23);
      const minute = randomBetween(0, 59);
      const txDate = new Date(date);
      txDate.setHours(hour, minute, 0, 0);

      const amount = randomBetween(merchant.minAmount, merchant.maxAmount);

      transactions.push({
        id: generateId() + t + d,
        merchant: merchant.name,
        amount,
        category: merchant.category,
        date: txDate.toISOString(),
        upiId: merchant.upiId,
        isDebit: true,
        description: `Paid to ${merchant.name} via UPI`,
      });
    }
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return transactions;
}

export function generateBills(): Bill[] {
  const now = new Date();
  return [
    { id: 'b1', name: 'Electricity Bill', amount: 2450, dueDate: addDays(now, 3).toISOString(), category: 'bills', isPaid: false, icon: 'flash' },
    { id: 'b2', name: 'WiFi - Airtel', amount: 999, dueDate: addDays(now, 5).toISOString(), category: 'bills', isPaid: false, icon: 'wifi' },
    { id: 'b3', name: 'Netflix Premium', amount: 649, dueDate: addDays(now, 8).toISOString(), category: 'entertainment', isPaid: false, icon: 'play' },
    { id: 'b4', name: 'Mobile Recharge', amount: 299, dueDate: addDays(now, 1).toISOString(), category: 'bills', isPaid: false, icon: 'phone-portrait' },
    { id: 'b5', name: 'Rent Payment', amount: 18000, dueDate: addDays(now, 12).toISOString(), category: 'bills', isPaid: false, icon: 'home' },
    { id: 'b6', name: 'Spotify Family', amount: 179, dueDate: addDays(now, 15).toISOString(), category: 'entertainment', isPaid: false, icon: 'musical-notes' },
    { id: 'b7', name: 'Gym Membership', amount: 2500, dueDate: addDays(now, 20).toISOString(), category: 'healthcare', isPaid: false, icon: 'barbell' },
    { id: 'b8', name: 'Car Insurance EMI', amount: 3200, dueDate: addDays(now, 25).toISOString(), category: 'others', isPaid: false, icon: 'shield-checkmark' },
  ];
}

export function generateLeaks(transactions: Transaction[]): MoneyLeak[] {
  const merchantFreq: Record<string, { count: number; total: number; category: CategoryType }> = {};

  transactions.forEach(tx => {
    if (!merchantFreq[tx.merchant]) {
      merchantFreq[tx.merchant] = { count: 0, total: 0, category: tx.category };
    }
    merchantFreq[tx.merchant].count++;
    merchantFreq[tx.merchant].total += tx.amount;
  });

  const leaks: MoneyLeak[] = [];
  const suggestions: Record<string, string> = {
    'Swiggy': 'Cook at home 3x a week to save more',
    'Zomato': 'Limit food delivery to weekends only',
    'Starbucks': 'Try brewing coffee at home',
    'Chai Point': 'Make chai at home and carry a flask',
    'Uber': 'Use public transport for short distances',
    'Ola': 'Consider carpooling or metro for daily commute',
    'Netflix': 'Share with family to split costs',
    'Spotify': 'Use the free tier or student discount',
    'BookMyShow': 'Look for early bird or weekday discounts',
    'Amazon': 'Use a wishlist and wait for sales',
  };

  Object.entries(merchantFreq).forEach(([merchant, data]) => {
    if (data.count >= 3) {
      const freq = data.count >= 15 ? 'Daily' : data.count >= 8 ? 'Frequently' : 'Weekly';
      leaks.push({
        id: generateId(),
        merchant,
        category: data.category,
        frequency: freq,
        monthlyEstimate: Math.round(data.total),
        transactionCount: data.count,
        suggestion: suggestions[merchant] || 'Review if this expense is necessary',
      });
    }
  });

  leaks.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
  return leaks;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
