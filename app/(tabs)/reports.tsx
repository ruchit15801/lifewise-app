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
import Colors, { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import {
  CATEGORIES,
  formatCurrency,
  getCategoryBreakdown,
  CategoryType,
} from '@/lib/data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CategoryBar({ category, total, percentage, maxPercentage, colors, isDark }: { category: CategoryType; total: number; percentage: number; maxPercentage: number; colors: ThemeColors; isDark: boolean }) {
  const cat = CATEGORIES[category];
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.catBarRow}>
      <View style={styles.catBarLeft}>
        <View style={[styles.catBarIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <View style={styles.catBarInfo}>
          <Text style={[styles.catBarName, { color: colors.text }]}>{cat.label}</Text>
          <Text style={[styles.catBarPercent, { color: colors.textTertiary }]}>{Math.round(percentage)}%</Text>
        </View>
      </View>
      <View style={styles.catBarRight}>
        <View style={[styles.catBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={[styles.catBarFill, { width: `${barWidth}%` as any, backgroundColor: cat.color }]} />
        </View>
        <Text style={[styles.catBarAmount, { color: cat.color }]}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
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
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const gradientColors: [string, string] = isDark ? ['#111133', '#0D0D2B'] : ['#E8ECF4', '#DEE4F0'];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Monthly Report</Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
            {MONTHS.map((m, idx) => (
              <Pressable
                key={m}
                onPress={() => setSelectedMonth(idx)}
                style={[
                  styles.monthChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  selectedMonth === idx && { backgroundColor: colors.accentBlueDim, borderColor: colors.accentBlue + '50' },
                  idx > now.getMonth() && styles.monthChipDisabled,
                ]}
                disabled={idx > now.getMonth()}
              >
                <Text style={[
                  styles.monthChipText,
                  { color: colors.textSecondary },
                  selectedMonth === idx && { color: colors.accentBlue },
                  idx > now.getMonth() && { color: colors.textTertiary },
                ]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(500) : undefined}>
          <LinearGradient
            colors={gradientColors}
            style={[styles.summaryCard, { borderColor: colors.accentBlue + '20' }]}
          >
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Spent</Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>{formatCurrency(totalSpent)}</Text>
              </View>
              <View style={[styles.savingsCircle, { borderColor: colors.accent }]}>
                <Text style={[styles.savingsValue, { color: colors.accent }]}>{savingsRate}%</Text>
                <Text style={[styles.savingsLabel, { color: colors.textTertiary }]}>Saved</Text>
              </View>
            </View>
            <View style={[styles.summaryStats, { borderTopColor: colors.border }]}>
              <View style={styles.summaryStat}>
                <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{monthTxs.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Transactions</Text>
              </View>
              <View style={styles.summaryStat}>
                <Ionicons name="trending-down" size={16} color={colors.textSecondary} />
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>
                  {monthTxs.length > 0 ? formatCurrency(Math.round(totalSpent / Math.max(1, new Date().getDate()))) : '0'}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Daily Avg</Text>
              </View>
              <View style={styles.summaryStat}>
                <Ionicons name="pricetag-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{breakdown.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Categories</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Category Breakdown</Text>
          <View style={[styles.catCard, { backgroundColor: colors.card }]}>
            {breakdown.map((item, idx) => (
              <React.Fragment key={item.category}>
                <CategoryBar
                  category={item.category}
                  total={item.total}
                  percentage={item.percentage}
                  maxPercentage={maxPercentage}
                  colors={colors}
                  isDark={isDark}
                />
                {idx < breakdown.length - 1 && <View style={[styles.catDivider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Merchants</Text>
          <View style={[styles.catCard, { backgroundColor: colors.card }]}>
            {merchantTotals.map(([merchant, data], idx) => {
              const cat = CATEGORIES[data.category];
              return (
                <React.Fragment key={merchant}>
                  <View style={styles.merchantRow}>
                    <View style={[styles.merchantIcon, { backgroundColor: cat.color + '18' }]}>
                      <Ionicons name={cat.icon as any} size={16} color={cat.color} />
                    </View>
                    <View style={styles.merchantInfo}>
                      <Text style={[styles.merchantName, { color: colors.text }]}>{merchant}</Text>
                      <Text style={[styles.merchantCount, { color: colors.textTertiary }]}>{data.count} transactions</Text>
                    </View>
                    <Text style={[styles.merchantAmount, { color: colors.text }]}>{formatCurrency(data.total)}</Text>
                  </View>
                  {idx < merchantTotals.length - 1 && <View style={[styles.catDivider, { backgroundColor: colors.border }]} />}
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
    fontSize: 28,
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
    borderWidth: 1,
  },
  monthChipDisabled: {
    opacity: 0.3,
  },
  monthChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
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
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
  },
  savingsCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  savingsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  summaryStat: {
    alignItems: 'center',
    gap: 6,
  },
  summaryStatValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  summaryStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    marginBottom: 14,
  },
  catCard: {
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
  },
  catBarPercent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
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
  },
  merchantCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  merchantAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
