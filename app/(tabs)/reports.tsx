import React, { useState, useMemo, useEffect } from 'react';
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
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useExpenses } from '@/lib/expense-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import {
  CATEGORIES,
  getCategoryBreakdown,
  CategoryType,
} from '@/lib/data';

const RANGE_OPTIONS = [
  { key: 'day', label: 'Day' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom Days' },
  { key: 'year', label: 'Year' },
] as const;

function CategoryBar({ category, total, percentage, maxPercentage, colors, isDark, formatAmount }: { category: CategoryType; total: number; percentage: number; maxPercentage: number; colors: ThemeColors; isDark: boolean; formatAmount: (n: number) => string }) {
  const cat = CATEGORIES[category];
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.catBarRow}>
      <View style={styles.catBarLeft}>
        <View style={[styles.catBarIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
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
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const { transactions, isLoading } = useExpenses();
  const { token } = useAuth();
  const [selectedRange, setSelectedRange] = useState<(typeof RANGE_OPTIONS)[number]['key']>('month');
  const [customDays, setCustomDays] = useState<10 | 30 | 60 | 90>(30);
  const [reportData, setReportData] = useState<{
    tasks_completed: number;
    reminders_missed: number;
    medicine_taken: number;
    life_score: number;
  } | null>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const monthTxs = useMemo(() => transactions, [transactions]);

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

  useEffect(() => {
    const loadReport = async () => {
      if (!token) return;
      try {
        const monthValue = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const yearValue = String(new Date().getFullYear());
        const value =
          selectedRange === 'custom' ? String(customDays) : selectedRange === 'month' ? monthValue : selectedRange === 'year' ? yearValue : '';
        const res = await apiRequest('GET', `/api/reports?type=${selectedRange}&value=${encodeURIComponent(value)}`, undefined, token);
        const json = await res.json();
        setReportData({
          tasks_completed: Number(json.tasks_completed || 0),
          reminders_missed: Number(json.reminders_missed || 0),
          medicine_taken: Number(json.medicine_taken || 0),
          life_score: Number(json.life_score || 0),
        });
      } catch {
        setReportData(null);
      }
    };
    loadReport();
  }, [token, selectedRange, customDays]);

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
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Monthly Report</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textTertiary }]}>
            Dynamic range report
          </Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
            {RANGE_OPTIONS.map((option) => {
              const isSelected = selectedRange === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setSelectedRange(option.key)}
                  style={[
                    styles.monthChip,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: 'transparent' },
                    isSelected && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' },
                  ]}
                >
                  <Text style={[
                    styles.monthChipText,
                    { color: colors.textTertiary },
                    isSelected && { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {selectedRange === 'custom' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {[10, 30, 60, 90].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setCustomDays(d as 10 | 30 | 60 | 90)}
                  style={[
                    styles.monthChip,
                    {
                      backgroundColor: customDays === d ? colors.accentDim : colors.card,
                      borderColor: customDays === d ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.monthChipText, { color: customDays === d ? colors.accent : colors.textSecondary }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(500) : undefined}>
          <LinearGradient
            colors={colors.heroGradient as unknown as [string, string, ...string[]]}
            style={[styles.summaryCard, { borderColor: colors.accent + '15' }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.summaryLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }]}>Total Spent</Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>{formatAmount(totalSpent)}</Text>
              </View>
              <View style={[styles.savingsCircle, { borderColor: colors.accentMint, backgroundColor: colors.accentMintDim }]}>
                <Text style={[styles.savingsValue, { color: colors.accentMint }]}>{reportData?.life_score ?? 0}</Text>
                <Text style={[styles.savingsLabel, { color: colors.accentMint + 'AA' }]}>LifeScore</Text>
              </View>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />

            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentBlueDim }]}>
                  <Ionicons name="receipt-outline" size={16} color={colors.accentBlue} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{monthTxs.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Transactions</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="trending-down" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>
                  {reportData?.tasks_completed ?? 0}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Tasks Done</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentMintDim }]}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.accentMint} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{reportData?.medicine_taken ?? 0}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Medicine Taken</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Category Breakdown</Text>
          <View style={[styles.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {breakdown.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No transactions this month</Text>
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
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No merchants this month</Text>
              </View>
            )}
            {merchantTotals.map(([merchant, data], idx) => {
              const cat = CATEGORIES[data.category];
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
    marginBottom: 24,
  },
  monthRow: {
    gap: 8,
    marginBottom: 28,
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
  },
  summaryCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    borderWidth: 1,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  },
  summaryStat: {
    alignItems: 'center',
    gap: 6,
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
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  dataCard: {
    borderRadius: 20,
    padding: 6,
    marginBottom: 28,
    borderWidth: 1,
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
});
