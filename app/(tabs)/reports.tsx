import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Colors, { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useExpenses } from '@/lib/expense-context';
import { useTabBarContentInset } from '@/lib/tab-bar';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import { getReminderIntentFromBill } from '@/lib/reminder-intent';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CATEGORIES,
  getCategoryBreakdown,
  CategoryType,
} from '@/lib/data';
import CategoryIcon from '@/components/CategoryIcon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CategoryBar({ category, total, percentage, maxPercentage, colors, isDark, formatAmount }: { category: CategoryType; total: number; percentage: number; maxPercentage: number; colors: ThemeColors; isDark: boolean; formatAmount: (n: number) => string }) {
  const safeCat = (category as string || 'others').toLowerCase() as CategoryType;
  const cat = CATEGORIES[safeCat] || CATEGORIES.others;
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.catBarRow}>
      <View style={styles.catBarLeft}>
        <View style={[styles.catBarIcon, { backgroundColor: cat.color + '18' }]}>
          <CategoryIcon category={category} size={18} />
        </View>
        <View style={styles.catBarInfo}>
          <Text style={[styles.catBarName, { color: colors.text }]}>{cat.label}</Text>
          <Text style={[styles.catBarPercent, { color: colors.textTertiary }]}>{Math.round(percentage)}%</Text>
        </View>
      </View>
      <View style={styles.catBarRight}>
        <View style={[styles.catBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <LinearGradient
            colors={[cat.color, cat.color + 'BB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.catBarFill, { width: `${barWidth}%` as any }]}
          />
        </View>
        <Text style={[styles.catBarAmount, { color: colors.text }]}>{formatAmount(total)}</Text>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarContentInset();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const { transactions, bills, isLoading, monthlyBudget, lifeScore, getReports } = useExpenses();
  const [backendReport, setBackendReport] = useState<any>(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const { token } = useAuth();
  const now = new Date();
  type FilterKey = 'today' | 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'multiMonth' | 'year' | 'custom';
  const [filterKey, setFilterKey] = useState<FilterKey>('today');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => [now.getMonth()]);
  const selectedMonth = selectedMonths[0] ?? now.getMonth();

  const [customStart, setCustomStart] = useState<Date>(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [customEnd, setCustomEnd] = useState<Date>(() => {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
  const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);
  const [draftCustomStart, setDraftCustomStart] = useState<Date>(customStart);
  const [draftCustomEnd, setDraftCustomEnd] = useState<Date>(customEnd);

  // Family medicines (for "Medicines Taken" metric).
  const [medicines, setMedicines] = useState<
    Array<{
      lastStatus?: string;
      lastTakenAt?: string | null;
    }>
  >([]);
  const [isMedicinesLoading, setIsMedicinesLoading] = useState(false);

  useEffect(() => {
    if (filterKey === 'month') {
      const m = selectedMonths[0] ?? now.getMonth();
      setSelectedMonths([m]);
    }
  }, [filterKey]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    (async () => {
      try {
        setIsMedicinesLoading(true);
        const res = await apiRequest('GET', '/api/family', undefined, token);
        const data = (await res.json()) as Array<{
          medicines?: Array<{ lastStatus?: string; lastTakenAt?: string | null }>;
        }>;
        const flattened = data
          .flatMap((m) => (Array.isArray(m.medicines) ? m.medicines : []))
          .map((med) => ({
            lastStatus: med.lastStatus,
            lastTakenAt: med.lastTakenAt ?? null,
          }));
        if (mounted) setMedicines(flattened);
      } catch {
        if (mounted) setMedicines([]);
      } finally {
        if (mounted) setIsMedicinesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  const sortedSelectedMonths = useMemo(() => [...selectedMonths].sort((a, b) => a - b), [selectedMonths]);

  const rangeInfo = useMemo(() => {
    const nowDay = startOfDay(now);

    if (filterKey === 'today') {
      const prevDay = new Date(nowDay.getTime() - DAY_MS);
      return {
        label: 'Today',
        prevLabel: 'Yesterday',
        currStart: nowDay,
        currEnd: endOfDay(nowDay),
        prevStart: startOfDay(prevDay),
        prevEnd: endOfDay(prevDay),
      };
    }

    if (filterKey === 'week') {
      // Last 7 days including today.
      const currStartDay = new Date(nowDay.getTime() - 6 * DAY_MS);
      const currStart = startOfDay(currStartDay);
      const currEnd = endOfDay(nowDay);
      const days = 7;
      const prevStart = startOfDay(new Date(currStart.getTime() - days * DAY_MS));
      const prevEnd = endOfDay(new Date(currEnd.getTime() - days * DAY_MS));
      return {
        label: 'Last 7 days',
        prevLabel: 'Previous 7 days',
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    if (filterKey === 'threeMonths') {
      // Rolling 3 months ending today.
      const currStartDay = new Date(nowDay);
      currStartDay.setMonth(currStartDay.getMonth() - 3);
      const currStart = startOfDay(currStartDay);
      const currEnd = endOfDay(nowDay);
      const days = Math.max(1, Math.round((currEnd.getTime() - currStart.getTime()) / DAY_MS) + 1);
      const prevStart = startOfDay(new Date(currStart.getTime() - days * DAY_MS));
      const prevEnd = endOfDay(new Date(currEnd.getTime() - days * DAY_MS));
      return {
        label: 'Last 3 months',
        prevLabel: 'Previous 3 months',
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    if (filterKey === 'sixMonths') {
      // Rolling 6 months ending today.
      const currStartDay = new Date(nowDay);
      currStartDay.setMonth(currStartDay.getMonth() - 6);
      const currStart = startOfDay(currStartDay);
      const currEnd = endOfDay(nowDay);
      const days = Math.max(1, Math.round((currEnd.getTime() - currStart.getTime()) / DAY_MS) + 1);
      const prevStart = startOfDay(new Date(currStart.getTime() - days * DAY_MS));
      const prevEnd = endOfDay(new Date(currEnd.getTime() - days * DAY_MS));
      return {
        label: 'Last 6 months',
        prevLabel: 'Previous 6 months',
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    if (filterKey === 'custom') {
      const currStart = startOfDay(customStart);
      const currEnd = endOfDay(customEnd);
      const days = Math.max(1, Math.round((currEnd.getTime() - currStart.getTime()) / DAY_MS) + 1);
      const prevStart = new Date(currStart.getTime() - days * DAY_MS);
      const prevEnd = new Date(currEnd.getTime() - days * DAY_MS);
      return {
        label: `${currStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${currEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        prevLabel: `${prevStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${prevEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    if (filterKey === 'month') {
      const m = selectedMonth;
      const currStart = new Date(selectedYear, m, 1);
      const currEnd = new Date(selectedYear, m + 1, 0);

      const prevDate = new Date(selectedYear, m, 1);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
      const prevEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0);

      return {
        label: `${MONTHS[m]} ${selectedYear}`,
        prevLabel: `${MONTHS[prevDate.getMonth()]} ${prevDate.getFullYear()}`,
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    if (filterKey === 'multiMonth') {
      const months = sortedSelectedMonths.length ? sortedSelectedMonths : [now.getMonth()];
      const minM = months[0];
      const maxM = months[months.length - 1];
      const currStart = new Date(selectedYear, minM, 1);
      const currEnd = new Date(selectedYear, maxM + 1, 0);

      const prevYear = selectedYear - 1;
      const prevStart = new Date(prevYear, minM, 1);
      const prevEnd = new Date(prevYear, maxM + 1, 0);

      return {
        label: `${months.map((m) => MONTHS[m]).join(', ')} ${selectedYear}`,
        prevLabel: `${months.map((m) => MONTHS[m]).join(', ')} ${prevYear}`,
        currStart,
        currEnd,
        prevStart,
        prevEnd,
      };
    }

    // year
    const currStart = new Date(selectedYear, 0, 1);
    const currEnd = new Date(selectedYear, 11, 31);
    const prevYear = selectedYear - 1;
    return {
      label: `${selectedYear}`,
      prevLabel: `${prevYear}`,
      currStart,
      currEnd,
      prevStart: new Date(prevYear, 0, 1),
      prevEnd: new Date(prevYear, 11, 31),
    };
  }, [filterKey, customStart, customEnd, selectedYear, selectedMonth, sortedSelectedMonths]);

  useEffect(() => {
    (async () => {
      if (!rangeInfo.currStart || !rangeInfo.currEnd) return;
      setIsReportsLoading(true);
      const data = await getReports(rangeInfo.currStart.toISOString(), rangeInfo.currEnd.toISOString());
      setBackendReport(data);
      setIsReportsLoading(false);
    })();
  }, [rangeInfo, getReports]);

  const currPredicate = useMemo(() => {
    return (d: Date) => {
      if (
        filterKey === 'today' ||
        filterKey === 'week' ||
        filterKey === 'custom' ||
        filterKey === 'month' ||
        filterKey === 'threeMonths' ||
        filterKey === 'sixMonths' ||
        filterKey === 'year'
      ) {
        return d.getTime() >= rangeInfo.currStart.getTime() && d.getTime() <= rangeInfo.currEnd.getTime();
      }
      // multiMonth
      return d.getFullYear() === selectedYear && sortedSelectedMonths.includes(d.getMonth());
    };
  }, [filterKey, rangeInfo, selectedYear, sortedSelectedMonths]);

  const prevPredicate = useMemo(() => {
    return (d: Date) => {
      if (filterKey === 'multiMonth') {
        // Compare same months previous year.
        return d.getFullYear() === selectedYear - 1 && sortedSelectedMonths.includes(d.getMonth());
      }
      return d.getTime() >= rangeInfo.prevStart.getTime() && d.getTime() <= rangeInfo.prevEnd.getTime();
    };
  }, [filterKey, rangeInfo, selectedYear, sortedSelectedMonths]);

  const reportTxs = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.date);
      return currPredicate(d);
    });
  }, [transactions, currPredicate]);

  const prevTxs = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.date);
      return prevPredicate(d);
    });
  }, [transactions, prevPredicate]);

  const reportBills = useMemo(() => {
    return bills.filter((b) => {
      const d = new Date(b.dueDate);
      return currPredicate(d);
    });
  }, [bills, currPredicate]);

  const prevBills = useMemo(() => {
    return bills.filter((b) => {
      const d = new Date(b.dueDate);
      return prevPredicate(d);
    });
  }, [bills, prevPredicate]);

  const totalSpent = backendReport ? backendReport.expense : reportTxs.reduce((s, tx) => s + (tx.isDebit ? tx.amount : 0), 0);
  const prevTotalSpent = backendReport ? backendReport.previousExpense : prevTxs.reduce((s, tx) => s + (tx.isDebit ? tx.amount : 0), 0);
  const totalIncome = backendReport ? backendReport.income : reportTxs.reduce((s, tx) => s + (!tx.isDebit ? tx.amount : 0), 0);

  const breakdown = useMemo(() => {
    if (backendReport && backendReport.categories) {
      const cats = Object.entries(backendReport.categories as Record<string, { total: number; count: number }>)
        .map(([cat, data]) => ({
          category: cat as CategoryType,
          total: data.total,
          percentage: (data.total / (totalSpent || 1)) * 100
        }))
        .sort((a, b) => b.total - a.total);
      return cats;
    }
    return getCategoryBreakdown(reportTxs);
  }, [reportTxs, backendReport, totalSpent]);
  const maxPercentage = breakdown.length > 0 ? breakdown[0].percentage : 0;

  const merchantTotals = useMemo(() => {
    const map: Record<string, { total: number; count: number; category: CategoryType }> = {};
    reportTxs.forEach((tx) => {
      if (!map[tx.merchant]) map[tx.merchant] = { total: 0, count: 0, category: tx.category };
      map[tx.merchant].total += tx.amount;
      map[tx.merchant].count++;
    });
    return Object.entries(map).sort(([, a], [, b]) => b.total - a.total).slice(0, 5);
  }, [reportTxs]);

  const daysInPeriod = useMemo(() => {
    const days =
      Math.round((rangeInfo.currEnd.getTime() - rangeInfo.currStart.getTime()) / DAY_MS) + 1;
    return Math.max(1, days);
  }, [rangeInfo]);

  const paidBills = useMemo(() => reportBills.filter((b) => b.status === 'paid' || b.isPaid), [reportBills]);
  const prevPaidBills = useMemo(() => prevBills.filter((b) => b.status === 'paid' || b.isPaid), [prevBills]);

  const remindersCompleted = paidBills.length;
  const prevRemindersCompleted = prevPaidBills.length;

  const billsPaid = useMemo(() => paidBills.filter((b) => getReminderIntentFromBill(b) === 'bills').length, [paidBills]);
  const billsDue = useMemo(
    () => reportBills.filter((b) => !(b.status === 'paid' || b.isPaid) && getReminderIntentFromBill(b) === 'bills').length,
    [reportBills],
  );

  const habitsCompleted = useMemo(
    () => paidBills.filter((b) => getReminderIntentFromBill(b) === 'habits').length,
    [paidBills],
  );
  const habitsTotal = useMemo(
    () => reportBills.filter((b) => getReminderIntentFromBill(b) === 'habits').length,
    [reportBills],
  );

  const habitsConsistency = habitsTotal > 0 ? habitsCompleted / habitsTotal : 0;

  const medicinesTaken = useMemo(() => {
    const meds = medicines;
    return meds.filter((m) => {
      if (m.lastStatus !== 'taken') return false;
      if (!m.lastTakenAt) return false;
      const dt = new Date(m.lastTakenAt);
      return currPredicate(dt);
    }).length;
  }, [medicines, currPredicate]);

  const medicinesPointsTotal = medicines.length > 0 ? medicinesTaken / medicines.length : 0;
  const habitConsistencyPct = Math.round(habitsConsistency * 100);
  const medicinesTakenRatioPct = medicines.length > 0 ? Math.round((medicinesTaken / medicines.length) * 100) : 0;

  const billsPaidRatio = reportBills.filter((b) => getReminderIntentFromBill(b) === 'bills').length > 0
    ? billsPaid / Math.max(1, reportBills.filter((b) => getReminderIntentFromBill(b) === 'bills').length)
    : 0;

  const billsTimeline = useMemo(() => {
    const billsIntent = reportBills.filter((b) => getReminderIntentFromBill(b) === 'bills');

    const start = startOfDay(rangeInfo.currStart);
    const end = startOfDay(rangeInfo.currEnd);
    const daysCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    const safeDays = Math.max(1, daysCount);

    const useDaily = safeDays <= 14;
    const bucketCount = useDaily ? safeDays : Math.ceil(safeDays / 7);

    const dueCounts = new Array(bucketCount).fill(0) as number[];
    const paidCounts = new Array(bucketCount).fill(0) as number[];

    billsIntent.forEach((b) => {
      const dueDt = new Date(b.dueDate);
      if (Number.isNaN(dueDt.getTime())) return;
      const d = startOfDay(dueDt);
      const dayIdx = Math.round((d.getTime() - start.getTime()) / DAY_MS);
      if (dayIdx < 0 || dayIdx >= safeDays) return;

      const idx = useDaily ? dayIdx : Math.floor(dayIdx / 7);
      if (idx < 0 || idx >= bucketCount) return;

      dueCounts[idx] += 1;
      if (b.status === 'paid' || b.isPaid) paidCounts[idx] += 1;
    });

    const maxDue = Math.max(1, ...dueCounts);
    const labels = dueCounts.map((_, i) => {
      if (useDaily) {
        const dd = new Date(start.getTime() + i * DAY_MS);
        return dd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      }
      return `W${i + 1}`;
    });

    return { labels, dueCounts, paidCounts, maxDue, useDaily };
  }, [reportBills, rangeInfo, DAY_MS]);

  const spendingPoints = monthlyBudget > 0
    ? clamp(Math.round(100 - (totalSpent / Math.max(1, (monthlyBudget / 30) * daysInPeriod)) * 100), 0, 100)
    : 0;

  const billsPoints = Math.round(billsPaidRatio * 30);
  const habitsPoints = Math.round(habitsConsistency * 20);
  const medsPoints = Math.round(medicinesPointsTotal * 10);

  const lifeScoreDisplay = lifeScore?.score ?? 85; // Fallback to 85 as per existing UI logic if not loaded
  const lifeScoreLabel = lifeScore?.score != null ? 'Official Score' : 'Estimated Score';
  const lifeScoreEstimate = lifeScoreDisplay; // for internal use below

  const lifeScorePrev = useMemo(() => {
    const prevPaidBillsForScore = prevPaidBills;
    const prevBillsForIntent = prevBills.filter((b) => getReminderIntentFromBill(b) === 'bills');
    const prevBillsDueInIntent = prevBillsForIntent;
    const prevBillsPaidInIntent = prevPaidBillsForScore.filter((b) => getReminderIntentFromBill(b) === 'bills');
    const prevBillsPaidRatio =
      prevBillsDueInIntent.length > 0 ? prevBillsPaidInIntent.length / prevBillsDueInIntent.length : 0;

    const prevHabitsCompleted = prevPaidBillsForScore.filter((b) => getReminderIntentFromBill(b) === 'habits').length;
    const prevHabitsTotal = prevBills.filter((b) => getReminderIntentFromBill(b) === 'habits').length;
    const prevHabitsConsistency = prevHabitsTotal > 0 ? prevHabitsCompleted / prevHabitsTotal : 0;

    const prevMedicinesTaken = medicines.filter((m) => {
      if (m.lastStatus !== 'taken') return false;
      if (!m.lastTakenAt) return false;
      return prevPredicate(new Date(m.lastTakenAt));
    }).length;
    const prevMedicinesRatio = medicines.length > 0 ? prevMedicinesTaken / medicines.length : 0;

    const prevSpendingPoints = monthlyBudget > 0
      ? clamp(Math.round(100 - (prevTotalSpent / Math.max(1, (monthlyBudget / 30) * daysInPeriod)) * 100), 0, 100)
      : 0;

    const prevBillsPoints = Math.round(prevBillsPaidRatio * 30);
    const prevHabitsPoints = Math.round(prevHabitsConsistency * 20);
    const prevMedsPoints = Math.round(prevMedicinesRatio * 10);

    return clamp(Math.round(prevSpendingPoints * 0.7 + prevBillsPoints * 0.2 + prevHabitsPoints * 0.08 + prevMedsPoints * 0.02), 0, 100);
  }, [prevPaidBills, prevBills, medicines, prevPredicate, prevTotalSpent, monthlyBudget, daysInPeriod]);

  const comparison = useMemo(() => {
    const spentDelta = totalSpent - prevTotalSpent;
    const remindersDelta = remindersCompleted - prevRemindersCompleted;
    const lifeScoreDelta = lifeScoreEstimate - lifeScorePrev;
    return { spentDelta, remindersDelta, lifeScoreDelta };
  }, [totalSpent, prevTotalSpent, remindersCompleted, prevRemindersCompleted, lifeScoreEstimate, lifeScorePrev]);

  const trendBars = useMemo(() => {
    // Simple bar-style "chart" using Views (no extra chart libraries).
    if (filterKey === 'today' || (filterKey === 'custom' && daysInPeriod === 1)) {
      const hours = new Array(24).fill(0) as number[];
      reportTxs.forEach((tx) => {
        if (!tx.isDebit) return;
        const d = new Date(tx.date);
        if (!currPredicate(d)) return;
        hours[d.getHours()] += tx.amount;
      });
      const max = Math.max(1, ...hours);
      return {
        kind: 'hour' as const,
        labels: hours.map((_, i) => `${i}`),
        values: hours,
        max,
      };
    }

    const start = startOfDay(rangeInfo.currStart);
    const end = startOfDay(rangeInfo.currEnd);
    const daysCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

    if (daysCount <= 14) {
      const values = new Array(daysCount).fill(0) as number[];
      reportTxs.forEach((tx) => {
        if (!tx.isDebit) return;
        const d = new Date(tx.date);
        if (!currPredicate(d)) return;
        const dayIdx = Math.round((startOfDay(d).getTime() - start.getTime()) / DAY_MS);
        if (dayIdx >= 0 && dayIdx < values.length) values[dayIdx] += tx.amount;
      });
      const max = Math.max(1, ...values);
      return {
        kind: 'day' as const,
        labels: values.map((_, i) => {
          const dd = new Date(start.getTime() + i * DAY_MS);
          return dd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        }),
        values,
        max,
      };
    }

    // Weekly buckets
    const weeks = Math.ceil(daysCount / 7);
    const values = new Array(weeks).fill(0) as number[];
    reportTxs.forEach((tx) => {
      if (!tx.isDebit) return;
      const d = new Date(tx.date);
      if (!currPredicate(d)) return;
      const dayIdx = Math.round((startOfDay(d).getTime() - start.getTime()) / DAY_MS);
      if (dayIdx < 0) return;
      const weekIdx = Math.floor(dayIdx / 7);
      if (weekIdx >= 0 && weekIdx < values.length) values[weekIdx] += tx.amount;
    });
    const max = Math.max(1, ...values);
    return {
      kind: 'week' as const,
      labels: values.map((_, i) => `W${i + 1}`),
      values,
      max,
    };
  }, [filterKey, reportTxs, currPredicate, rangeInfo, DAY_MS, daysInPeriod]);

  const filterChips: Array<{ key: FilterKey; label: string; icon: string }> = [
    { key: 'today', label: 'Today', icon: 'calendar' },
    { key: 'week', label: 'Week', icon: 'calendar' },
    { key: 'month', label: 'Month', icon: 'calendar' },
    { key: 'threeMonths', label: '3M', icon: 'calendar' },
    { key: 'sixMonths', label: '6M', icon: 'calendar' },
    { key: 'year', label: 'Year', icon: 'wallet' },
    { key: 'custom', label: 'Custom', icon: 'apps' },
  ];

  const handleSelectFilterChip = (key: FilterKey) => {
    setShowCustomStartPicker(false);
    setShowCustomEndPicker(false);
    if (key !== 'custom') {
      // Close pickers when switching away from custom.
      setDraftCustomStart(customStart);
      setDraftCustomEnd(customEnd);
    }
    setFilterKey(key);

    if (key === 'custom') {
      setDraftCustomStart(customStart);
      setDraftCustomEnd(customEnd);
      setShowCustomStartPicker(true);
    }

    if (key === 'year') {
      setShowYearPicker(true);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: tabBarInset.bottom },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <View style={styles.reportsTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.screenTitle, { color: colors.text }]}>Reports</Text>
              <Text style={[styles.screenSubtitle, { color: colors.textTertiary }]}>
                {rangeInfo.label} • Compare vs {rangeInfo.prevLabel}
              </Text>
            </View>
          </View>

          <View style={styles.filterChipsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsScroll}
            >
              {filterChips.map((chip) => {
                const active = filterKey === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => handleSelectFilterChip(chip.key)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                      active && {
                        backgroundColor: colors.accentDim,
                        borderColor: colors.accent + '40',
                      },
                    ]}
                  >
                    <Ionicons
                      name={chip.icon as any}
                      size={16}
                      color={active ? colors.accent : colors.textTertiary}
                    />
                    <Text style={[styles.filterChipText, { color: active ? colors.accent : colors.textSecondary }]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Custom Date Start Picker */}
          <Modal transparent animationType="fade" visible={showCustomStartPicker}>
            <View style={styles.modalBackdropCentered}>
              <View style={[styles.modalCardCentered, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Start Date</Text>
                <View style={{ paddingVertical: 8 }}>
                  <DateTimePicker
                    value={draftCustomStart}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (!d) return;
                      const next = new Date(d);
                      next.setHours(0, 0, 0, 0);
                      setDraftCustomStart((prev) => (prev.getTime() === next.getTime() ? prev : next));
                    }}
                  />
                </View>
                <View style={styles.modalActionsRow}>
                  <Pressable onPress={() => setShowCustomStartPicker(false)} style={styles.modalTextBtn}>
                    <Text style={[styles.modalTextBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const fixedStart = new Date(draftCustomStart);
                      fixedStart.setHours(0, 0, 0, 0);
                      setCustomStart(fixedStart);
                      if (fixedStart.getTime() > customEnd.getTime()) {
                        setCustomEnd(endOfDay(fixedStart));
                      }
                      setShowCustomStartPicker(false);
                    }}
                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentDim }]}
                  >
                    <Text style={[styles.modalPrimaryBtnLabel, { color: colors.accent }]}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          {/* Custom Date End Picker */}
          <Modal transparent animationType="fade" visible={showCustomEndPicker}>
            <View style={styles.modalBackdropCentered}>
              <View style={[styles.modalCardCentered, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select End Date</Text>
                <View style={{ paddingVertical: 8 }}>
                  <DateTimePicker
                    value={draftCustomEnd}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (!d) return;
                      const next = new Date(d);
                      next.setHours(23, 59, 59, 999);
                      setDraftCustomEnd((prev) => (prev.getTime() === next.getTime() ? prev : next));
                    }}
                  />
                </View>
                <View style={styles.modalActionsRow}>
                  <Pressable onPress={() => setShowCustomEndPicker(false)} style={styles.modalTextBtn}>
                    <Text style={[styles.modalTextBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const fixedEnd = new Date(draftCustomEnd);
                      fixedEnd.setHours(23, 59, 59, 999);
                      setCustomEnd(fixedEnd);
                      if (customStart.getTime() > fixedEnd.getTime()) {
                        setCustomStart(startOfDay(fixedEnd));
                      }
                      setShowCustomEndPicker(false);
                    }}
                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentDim }]}
                  >
                    <Text style={[styles.modalPrimaryBtnLabel, { color: colors.accent }]}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          {filterKey === 'custom' && (
            <View style={styles.customChipWrap}>
              <Pressable
                style={[
                  styles.customChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => {
                  setDraftCustomStart(customStart);
                  setDraftCustomEnd(customEnd);
                  setShowCustomEndPicker(false);
                  setShowCustomStartPicker(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customChipLabel, { color: colors.textTertiary }]}>Start date</Text>
                  <Text style={[styles.customChipValue, { color: colors.text }]}>
                    {customStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.customChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => {
                  setDraftCustomStart(customStart);
                  setDraftCustomEnd(customEnd);
                  setShowCustomStartPicker(false);
                  setShowCustomEndPicker(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customChipLabel, { color: colors.textTertiary }]}>End Date</Text>
                  <Text style={[styles.customChipValue, { color: colors.text }]}>
                    {customEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {(filterKey === 'month' || filterKey === 'multiMonth') && (
            <View style={{ marginTop: 4 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.monthRow}
              >
                {MONTHS.map((m, idx) => {
                  const isSelected = selectedMonths.includes(idx);
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        if (filterKey === 'month') {
                          setSelectedMonths([idx]);
                          return;
                        }
                        setSelectedMonths((prev) => {
                          if (prev.includes(idx)) {
                            const next = prev.filter((x) => x !== idx);
                            return next.length ? next : prev; // keep at least one selected
                          }
                          const next = [...prev, idx].sort((a, b) => a - b);
                          return next;
                        });
                      }}
                      style={[
                        styles.monthChip,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        isSelected && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthChipText,
                          { color: colors.textTertiary },
                          isSelected && { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
                        ]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Animated.View>

        {showYearPicker && (
          <Modal transparent animationType="fade" visible={showYearPicker}>
            <View style={styles.modalBackdropCentered}>
              <View style={[styles.modalCardCentered, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Pick year</Text>
                <View style={{ paddingVertical: 8 }}>
                  <DateTimePicker
                    value={new Date(selectedYear, 0, 1)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (!d) return;
                      setSelectedYear(d.getFullYear());
                    }}
                  />
                </View>
                <View style={styles.modalActionsRow}>
                  <Pressable onPress={() => setShowYearPicker(false)} style={styles.modalTextBtn}>
                    <Text style={[styles.modalTextBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowYearPicker(false)}
                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentDim }]}
                  >
                    <Text style={[styles.modalPrimaryBtnLabel, { color: colors.accent }]}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(500) : undefined}>
          <LinearGradient
            colors={colors.heroGradient as unknown as [string, string, ...string[]]}
            style={[styles.summaryCard, { borderColor: colors.accent + '15' }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.summaryTop }>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }]}>Total Spending</Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>{formatAmount(totalSpent)}</Text>
                <Text style={[styles.deltaText, { color: colors.textTertiary }]}>
                  Spent {comparison.spentDelta >= 0 ? '+' : '-'}
                  {formatAmount(Math.abs(comparison.spentDelta))} vs {rangeInfo.prevLabel} • Reminders{' '}
                  {comparison.remindersDelta >= 0 ? '+' : ''}
                  {comparison.remindersDelta} • LifeScore{' '}
                  {comparison.lifeScoreDelta >= 0 ? '+' : ''}
                  {comparison.lifeScoreDelta}
                </Text>
              </View>
              <View style={[styles.scoreCircle, { borderColor: colors.accentDim, backgroundColor: colors.accentDim }]}>
                <Text style={[styles.scoreValue, { color: colors.accent }]}>{lifeScoreDisplay}</Text>
                <Text style={[styles.scoreLabel, { color: colors.accent + 'AA' }]}>{lifeScoreLabel}</Text>
              </View>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />

            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentBlueDim }]}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.accentBlue} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{remindersCompleted}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Reminders Done</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentMintDim }]}>
                  <Ionicons name="medkit" size={16} color={colors.accentMint} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>
                  {isMedicinesLoading ? '…' : medicinesTaken}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Medicines Taken</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.warningDim }]}>
                  <Ionicons name="notifications" size={16} color={colors.warning} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{billsDue}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Bills Due</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="water" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{habitsCompleted}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Habits Done</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(260).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Trend</Text>
          <View style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.trendSubtitle, { color: colors.textTertiary }]}>
              {trendBars.kind === 'hour'
                ? 'Hourly activity'
                : trendBars.kind === 'day'
                  ? 'Daily spending'
                  : 'Weekly spending'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendRow}>
              {trendBars.values.map((v, idx) => {
                const height = Math.round((v / trendBars.max) * 92) || 4;
                return (
                  <View key={`${idx}`} style={styles.trendBarWrap}>
                    <View style={[styles.trendBar, { height, backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]} />
                    <Text style={[styles.trendBarLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                      {trendBars.labels[idx]}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Habits Performance</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.habitsHeaderRow}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.accentDim }]}>
                <Ionicons name="water" size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.habitsBigValue, { color: colors.text }]}>
                  {habitsCompleted}/{habitsTotal}
                </Text>
                <Text style={[styles.habitsSmallLabel, { color: colors.textTertiary }]}>
                  Consistency: {habitConsistencyPct}%
                </Text>
              </View>
              <Text style={[styles.habitsPctText, { color: colors.accent }]}>{habitConsistencyPct}%</Text>
            </View>
            <View style={styles.habitsBarTrack}>
              <View
                style={[
                  styles.habitsBarFill,
                  {
                    width: `${habitConsistencyPct}%`,
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.habitsFootnote, { color: colors.textSecondary, marginTop: 10 }]}>
              Based on habit-type reminders completed in this selected period.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(340).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Bills Payment Timeline</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 14 }]}>
            {billsTimeline.dueCounts.every((n) => n === 0) ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No bills due in this period</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineRow}>
                {billsTimeline.dueCounts.map((due, idx) => {
                  const paid = billsTimeline.paidCounts[idx] ?? 0;
                  const totalH = Math.round((due / billsTimeline.maxDue) * 92) || 4;
                  const paidH = due > 0 ? Math.round((paid / due) * totalH) : 0;
                  const unpaidH = totalH - paidH;
                  return (
                    <View key={`bills-t-${idx}`} style={styles.timelineBarWrap}>
                      <View style={[styles.timelineBarStack, { height: totalH }]}>
                        <View style={[styles.timelineBarUnpaid, { height: unpaidH, backgroundColor: '#E5E7EB' }]} />
                        {paidH > 0 ? (
                          <View style={[styles.timelineBarPaid, { height: paidH, backgroundColor: colors.accentMint }]} />
                        ) : null}
                      </View>
                      <Text style={[styles.timelineLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                        {billsTimeline.labels[idx]}
                      </Text>
                      <Text style={[styles.timelineCounts, { color: colors.textSecondary }]}>
                        {paid}/{due} paid
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(380).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Medicines Metrics</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.medsHeaderRow}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.accentMintDim }]}>
                <Ionicons name="medkit" size={16} color={colors.accentMint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.medsBigValue, { color: colors.text }]}>
                  {isMedicinesLoading ? 'Loading…' : `${medicinesTaken}/${medicines.length}`}
                </Text>
                <Text style={[styles.medsSmallLabel, { color: colors.textTertiary }]}>
                  Taken ratio: {medicinesTakenRatioPct}%
                </Text>
              </View>
              <Text style={[styles.medsPctText, { color: colors.accentMint }]}>
                {medicinesTakenRatioPct}%
              </Text>
            </View>
            <Text style={[styles.habitsFootnote, { color: colors.textSecondary, marginTop: 10 }]}>
              Estimated from each medicine’s latest status (`taken`) and `lastTakenAt`.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Category Breakdown</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {breakdown.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No transactions for this filter</Text>
              </View>
            )}
            {breakdown.map((item, idx) => (
              <React.Fragment key={item.category}>
                <CategoryBar
                  category={item.category}
                  total={item.total}
                  percentage={item.percentage}
                  maxPercentage={maxPercentage}
                  colors={colors}
                  isDark={isDark}
                  formatAmount={formatAmount}
                />
                {idx < breakdown.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Merchants</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {merchantTotals.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No merchants for this filter</Text>
              </View>
            )}
            {merchantTotals.map(([merchant, data], idx) => {
              const cat = CATEGORIES[data.category as CategoryType] || CATEGORIES.others;
              return (
                <React.Fragment key={merchant}>
                  <View style={styles.merchantRow}>
                    <View style={[styles.merchantIcon, { backgroundColor: cat.color + '15' }]}>
                      <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                    </View>
                    <View style={styles.merchantInfo}>
                      <Text style={[styles.merchantName, { color: colors.text }]}>{merchant}</Text>
                      <Text style={[styles.merchantCount, { color: colors.textTertiary }]}>{data.count} transactions</Text>
                    </View>
                    <Text style={[styles.merchantAmount, { color: colors.text }]}>{formatAmount(data.total)}</Text>
                  </View>
                  {idx < merchantTotals.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginBottom: 10,
  },
  monthRow: {
    gap: 8,
    marginTop: 0,
    marginBottom: 18,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  monthPickerHeaderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  monthChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  monthChipDisabled: {
    opacity: 0.3,
  },
  monthChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    borderRadius: 20,
  },
  summaryCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    marginTop: 12,
    borderWidth: 1,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  deltaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 8,
  },
  summaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  summaryAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    letterSpacing: -0.5,
  },
  savingsCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 22,
  },
  scoreLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  savingsValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  savingsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  summaryDivider: {
    height: 1,
    borderRadius: 1,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 18,
    flexWrap: 'wrap',
    rowGap: 14,
  },
  summaryStat: {
    alignItems: 'center',
    gap: 6,
    width: '48%',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  summaryStatValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  summaryStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  dataCard: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
  },
  trendCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  trendSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginBottom: 12,
  },
  trendRow: {
    gap: 10,
    paddingBottom: 8,
  },
  trendBarWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  trendBar: {
    width: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  trendBarLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  catBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  catBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  catBarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  catBarInfo: {
    flex: 1,
  },
  catBarName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  catBarPercent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  catBarRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 8,
  },
  catBarTrack: {
    width: '85%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  catBarAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  merchantIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  merchantInfo: {
    flex: 1,
  },
  merchantName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  merchantCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  merchantAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },

  // --- Extra cards (Habits/Bills/Medicines) ---
  habitsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitsBigValue: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
  },
  habitsSmallLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  habitsPctText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
  },
  habitsBarTrack: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  habitsBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  habitsFootnote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },

  timelineRow: {
    gap: 12,
    paddingBottom: 6,
  },
  timelineBarWrap: {
    width: 46,
    alignItems: 'center',
  },
  timelineBarStack: {
    width: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,1)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  timelineBarUnpaid: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  timelineBarPaid: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  timelineLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 6,
  },
  timelineCounts: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 4,
  },

  medsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medsBigValue: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
  },
  medsSmallLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  medsPctText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
  },
  // --- Report filter UI ---
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modeChip: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 150,
  },
  modeChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  pickRow: {
    marginTop: 0,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  pickRowText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },

  filterScrollRow: {
    gap: 10,
    paddingBottom: 8,
  },

  customRangeWrap: {
    marginTop: 6,
    gap: 8,
    paddingVertical: 0,
    borderRadius: 16,
    borderWidth: 0,
  },

  customRangeLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 4,
  },

  customChipWrap: {
    marginTop: 0,
    gap: 6,
  },
  customChip: {
    borderRadius: 14,
    borderWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    minHeight: 40,
  },
  customChipLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  customChipValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 1,
  },

  // --- Time Filter Selector ---
  reportsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  filterChipsRow: {
    marginBottom: 8,
  },
  filterChipsScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  filterIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSelectorWrap: {
    marginTop: 8,
    marginBottom: 18,
  },
  filterSelectorLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  filterSelectorRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  filterSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  filterSelectorTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  filterSelectorValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },

  modalBackdropBottom: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  filterMenuSheet: {
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  filterMenuHandle: {
    width: 56,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(148,163,184,0.9)',
    marginBottom: 10,
  },
  filterMenuTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginBottom: 12,
  },
  filterMenuItem: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  filterMenuItemText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // --- Modal helpers ---
  modalBackdropCentered: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCardCentered: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTextBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  modalTextBtnLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  modalPrimaryBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  modalPrimaryBtnLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
