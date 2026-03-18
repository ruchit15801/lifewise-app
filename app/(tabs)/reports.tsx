import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CATEGORIES,
  getCategoryBreakdown,
  CategoryType,
} from '@/lib/data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const tabBarInset = useTabBarContentInset();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const { transactions, isLoading, monthlyBudget } = useExpenses();
  const now = new Date();
  type ReportMode = 'day' | 'months' | 'year';
  const [mode, setMode] = useState<ReportMode>('months');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(now));
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => [now.getMonth()]);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const reportTxs = useMemo(() => {
    const dayKey = selectedDate.toDateString();
    return transactions.filter((tx) => {
      const d = new Date(tx.date);
      if (mode === 'day') return d.toDateString() === dayKey;
      if (mode === 'months') return selectedMonths.includes(d.getMonth()) && d.getFullYear() === selectedYear;
      return d.getFullYear() === selectedYear;
    });
  }, [transactions, mode, selectedDate, selectedMonths, selectedYear]);

  const breakdown = useMemo(() => getCategoryBreakdown(reportTxs), [reportTxs]);
  const totalSpent = reportTxs.reduce((s, tx) => s + (tx.isDebit ? tx.amount : 0), 0);
  const maxPercentage = breakdown.length > 0 ? breakdown[0].percentage : 0;
  const rangeDays = useMemo(() => {
    if (mode === 'day') return 1;
    if (mode === 'months') {
      return selectedMonths.reduce((sum, m) => sum + new Date(selectedYear, m + 1, 0).getDate(), 0);
    }
    // yearly
    const y = selectedYear;
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return isLeap ? 366 : 365;
  }, [mode, selectedMonths, selectedYear]);

  const merchantTotals = useMemo(() => {
    const map: Record<string, { total: number; count: number; category: CategoryType }> = {};
    reportTxs.forEach(tx => {
      if (!map[tx.merchant]) map[tx.merchant] = { total: 0, count: 0, category: tx.category };
      map[tx.merchant].total += tx.amount;
      map[tx.merchant].count++;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5);
  }, [reportTxs]);

  const savingsRate =
    mode === 'months' && monthlyBudget > 0
      ? Math.max(0, Math.round(((monthlyBudget - totalSpent) / monthlyBudget) * 100))
      : 0;

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
          <Text style={[styles.screenTitle, { color: colors.text }]}>Spending Report</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textTertiary }]}>
            {mode === 'day'
              ? selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : mode === 'months'
                ? `${selectedMonths.map((m) => MONTHS[m]).join(', ')} ${selectedYear}`
                : `${selectedYear}`}
          </Text>

          <View style={styles.modeRow}>
            {(['day', 'months', 'year'] as ReportMode[]).map((m) => {
              const isActive = mode === m;
              const label = m === 'day' ? 'Day' : m === 'months' ? 'Months (2)' : 'Year';
              const icon = m === 'day' ? 'calendar' : m === 'months' ? 'calendar-outline' : 'cash';
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[
                    styles.modeChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isActive && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' },
                  ]}
                >
                  <Ionicons
                    name={icon as any}
                    size={14}
                    color={isActive ? colors.accent : colors.textTertiary}
                  />
                  <Text style={[styles.modeChipText, { color: colors.textTertiary }, isActive && { color: colors.accent }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(120).duration(500) : undefined}>
          {mode === 'day' && (
            <>
              <Pressable
                onPress={() => {
                  setShowDayPicker(true);
                }}
                style={[styles.pickRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="calendar" size={16} color={colors.accent} />
                <Text style={[styles.pickRowText, { color: colors.textSecondary }]} numberOfLines={1}>
                  Pick date: {selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
              </Pressable>
            </>
          )}

          {mode === 'months' && (
            <>
              <Pressable
                onPress={() => setShowMonthYearPicker(true)}
                style={[styles.pickRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="calendar" size={16} color={colors.accent} />
                <Text style={[styles.pickRowText, { color: colors.textSecondary }]}>Year: {selectedYear}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
              </Pressable>

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
                        if (!isSelected && selectedMonths.length >= 2) {
                          Alert.alert('Select up to 2 months', 'You can choose any 2 months for this report.');
                          return;
                        }
                        setSelectedMonths((prev) => {
                          if (prev.includes(idx)) return prev.filter((x) => x !== idx);
                          return [...prev, idx].sort((a, b) => a - b);
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
            </>
          )}

          {mode === 'year' && (
            <Pressable
              onPress={() => setShowYearPicker(true)}
              style={[styles.pickRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Ionicons name="cash" size={16} color={colors.accent} />
              <Text style={[styles.pickRowText, { color: colors.textSecondary }]}>Year: {selectedYear}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </Animated.View>

        {/* Date picker modals */}
        {showDayPicker && (
          <Modal transparent animationType="fade" visible={showDayPicker}>
            <View style={styles.modalBackdropCentered}>
              <View style={[styles.modalCardCentered, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Pick day</Text>
                <View style={{ paddingVertical: 8 }}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (!d) return;
                      setSelectedDate(d);
                    }}
                  />
                </View>
                <View style={styles.modalActionsRow}>
                  <Pressable onPress={() => setShowDayPicker(false)} style={styles.modalTextBtn}>
                    <Text style={[styles.modalTextBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDayPicker(false)}
                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentDim }]}
                  >
                    <Text style={[styles.modalPrimaryBtnLabel, { color: colors.accent }]}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {showMonthYearPicker && (
          <Modal transparent animationType="fade" visible={showMonthYearPicker}>
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
                  <Pressable onPress={() => setShowMonthYearPicker(false)} style={styles.modalTextBtn}>
                    <Text style={[styles.modalTextBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowMonthYearPicker(false)}
                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentDim }]}
                  >
                    <Text style={[styles.modalPrimaryBtnLabel, { color: colors.accent }]}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}

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
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.summaryLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }]}>Total Spent</Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>{formatAmount(totalSpent)}</Text>
              </View>
              <View style={[styles.savingsCircle, { borderColor: colors.accentMint, backgroundColor: colors.accentMintDim }]}>
                <Text style={[styles.savingsValue, { color: colors.accentMint }]}>{savingsRate}%</Text>
                <Text style={[styles.savingsLabel, { color: colors.accentMint + 'AA' }]}>Saved</Text>
              </View>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />

            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentBlueDim }]}>
                  <Ionicons name="receipt-outline" size={16} color={colors.accentBlue} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{reportTxs.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Transactions</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="trending-down" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>
                  {reportTxs.length > 0 ? formatAmount(Math.round(totalSpent / Math.max(1, rangeDays))) : '0'}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Daily Avg</Text>
              </View>
              <View style={styles.summaryStat}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.accentMintDim }]}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.accentMint} />
                </View>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{breakdown.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textTertiary }]}>Categories</Text>
              </View>
            </View>
          </LinearGradient>
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
  // --- Report filter UI ---
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  modeChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  pickRow: {
    marginTop: 10,
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
