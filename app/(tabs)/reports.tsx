import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useExpenses } from '@/lib/expense-context';
import {
  CATEGORIES,
  formatCurrency,
  getCategoryBreakdown,
  CategoryType,
} from '@/lib/data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CategoryBar({ category, total, percentage, maxPercentage }: { category: CategoryType; total: number; percentage: number; maxPercentage: number }) {
  const cat = CATEGORIES[category];
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.catBarRow}>
      <View style={styles.catBarLeft}>
        <View style={[styles.catBarIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <View style={styles.catBarInfo}>
          <Text style={styles.catBarName}>{cat.label}</Text>
          <Text style={styles.catBarPercent}>{Math.round(percentage)}%</Text>
        </View>
      </View>
      <View style={styles.catBarRight}>
        <View style={styles.catBarTrack}>
          <View style={[styles.catBarFill, { width: `${barWidth}%` as any, backgroundColor: cat.color }]} />
        </View>
        <Text style={[styles.catBarAmount, { color: cat.color }]}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, isLoading, monthlyBudget } = useExpenses();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const monthTxs = useMemo(() =>
    transactions.filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }),
    [transactions, selectedMonth, selectedYear]
  );

  const breakdown = useMemo(() => getCategoryBreakdown(monthTxs), [monthTxs]);
  const totalSpent = monthTxs.reduce((s, tx) => s + (tx.isDebit ? tx.amount : 0), 0);
  const maxPercentage = breakdown.length > 0 ? breakdown[0].percentage : 0;

  const merchantTotals = useMemo(() => {
    const map: Record<string, { total: number; count: number; category: CategoryType }> = {};
    monthTxs.forEach(tx => {
      if (!map[tx.merchant]) map[tx.merchant] = { total: 0, count: 0, category: tx.category };
      map[tx.merchant].total += tx.amount;
      map[tx.merchant].count++;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5);
  }, [monthTxs]);

  const savingsRate = monthlyBudget > 0
    ? Math.max(0, Math.round(((monthlyBudget - totalSpent) / monthlyBudget) * 100))
    : 0;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <Text style={styles.screenTitle}>Monthly Report</Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
            {MONTHS.map((m, idx) => (
              <Pressable
                key={m}
                onPress={() => setSelectedMonth(idx)}
                style={[
                  styles.monthChip,
                  selectedMonth === idx && styles.monthChipActive,
                  idx > now.getMonth() && styles.monthChipDisabled,
                ]}
                disabled={idx > now.getMonth()}
              >
                <Text style={[
                  styles.monthChipText,
                  selectedMonth === idx && styles.monthChipTextActive,
                  idx > now.getMonth() && styles.monthChipTextDisabled,
                ]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(500) : undefined}>
          <LinearGradient
            colors={['#111133', '#0D0D2B']}
            style={styles.summaryCard}
          >
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.summaryLabel}>Total Spent</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(totalSpent)}</Text>
              </View>
              <View style={styles.savingsCircle}>
                <Text style={styles.savingsValue}>{savingsRate}%</Text>
                <Text style={styles.savingsLabel}>Saved</Text>
              </View>
            </View>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Ionicons name="receipt-outline" size={16} color={Colors.dark.textSecondary} />
                <Text style={styles.summaryStatValue}>{monthTxs.length}</Text>
                <Text style={styles.summaryStatLabel}>Transactions</Text>
              </View>
              <View style={styles.summaryStat}>
                <Ionicons name="trending-down" size={16} color={Colors.dark.textSecondary} />
                <Text style={styles.summaryStatValue}>
                  {monthTxs.length > 0 ? formatCurrency(Math.round(totalSpent / Math.max(1, new Date().getDate()))) : '0'}
                </Text>
                <Text style={styles.summaryStatLabel}>Daily Avg</Text>
              </View>
              <View style={styles.summaryStat}>
                <Ionicons name="pricetag-outline" size={16} color={Colors.dark.textSecondary} />
                <Text style={styles.summaryStatValue}>{breakdown.length}</Text>
                <Text style={styles.summaryStatLabel}>Categories</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(500) : undefined}>
          <Text style={styles.sectionTitle}>Category Breakdown</Text>
          <View style={styles.catCard}>
            {breakdown.map((item, idx) => (
              <React.Fragment key={item.category}>
                <CategoryBar
                  category={item.category}
                  total={item.total}
                  percentage={item.percentage}
                  maxPercentage={maxPercentage}
                />
                {idx < breakdown.length - 1 && <View style={styles.catDivider} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(500) : undefined}>
          <Text style={styles.sectionTitle}>Top Merchants</Text>
          <View style={styles.catCard}>
            {merchantTotals.map(([merchant, data], idx) => {
              const cat = CATEGORIES[data.category];
              return (
                <React.Fragment key={merchant}>
                  <View style={styles.merchantRow}>
                    <View style={[styles.merchantIcon, { backgroundColor: cat.color + '18' }]}>
                      <Ionicons name={cat.icon as any} size={16} color={cat.color} />
                    </View>
                    <View style={styles.merchantInfo}>
                      <Text style={styles.merchantName}>{merchant}</Text>
                      <Text style={styles.merchantCount}>{data.count} transactions</Text>
                    </View>
                    <Text style={styles.merchantAmount}>{formatCurrency(data.total)}</Text>
                  </View>
                  {idx < merchantTotals.length - 1 && <View style={styles.catDivider} />}
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
    backgroundColor: Colors.dark.bg,
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
    fontSize: 28,
    color: Colors.dark.text,
    marginBottom: 20,
  },
  monthRow: {
    gap: 8,
    marginBottom: 24,
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  monthChipActive: {
    backgroundColor: Colors.dark.accentBlueDim,
    borderColor: Colors.dark.accentBlue + '50',
  },
  monthChipDisabled: {
    opacity: 0.3,
  },
  monthChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  monthChipTextActive: {
    color: Colors.dark.accentBlue,
  },
  monthChipTextDisabled: {
    color: Colors.dark.textTertiary,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.dark.accentBlue + '20',
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    color: Colors.dark.text,
  },
  savingsCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.dark.accent,
  },
  savingsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.dark.textTertiary,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  summaryStat: {
    alignItems: 'center',
    gap: 6,
  },
  summaryStatValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  summaryStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: Colors.dark.text,
    marginBottom: 14,
  },
  catCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  catBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  catBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  catBarIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  catBarInfo: {
    flex: 1,
  },
  catBarName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.text,
  },
  catBarPercent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  catBarRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  catBarTrack: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  catBarAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  catDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: 14,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  merchantIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  merchantInfo: {
    flex: 1,
  },
  merchantName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.dark.text,
  },
  merchantCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  merchantAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.text,
  },
});
