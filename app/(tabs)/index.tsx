import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useExpenses } from '@/lib/expense-context';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import {
  CATEGORIES,
  formatCurrency,
  getTodaySpending,
  getMonthlySpending,
  getGreeting,
  formatTime,
  CategoryType,
} from '@/lib/data';

function CategoryPill({ category, total, index, colors }: { category: CategoryType; total: number; index: number; colors: any }) {
  const cat = CATEGORIES[category];
  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInRight.delay(index * 80).springify() : undefined}>
      <View style={[styles.categoryPill, { backgroundColor: colors.card, borderColor: cat.color + '30' }]}>
        <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
        <Text style={[styles.categoryPillLabel, { color: colors.textSecondary }]}>{cat.label}</Text>
        <Text style={[styles.categoryPillAmount, { color: cat.color }]}>
          {formatCurrency(total)}
        </Text>
      </View>
    </Animated.View>
  );
}

function TransactionRow({ merchant, amount, category, date, colors }: { merchant: string; amount: number; category: CategoryType; date: string; colors: any }) {
  const cat = CATEGORIES[category];
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: cat.color + '18' }]}>
        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={[styles.txMerchant, { color: colors.text }]}>{merchant}</Text>
        <Text style={[styles.txTime, { color: colors.textTertiary }]}>{formatTime(date)}</Text>
      </View>
      <Text style={[styles.txAmount, { color: colors.danger }]}>- {formatCurrency(amount)}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, bills, leaks, isLoading, monthlyBudget } = useExpenses();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const todaySpend = getTodaySpending(transactions);
  const monthlySpend = getMonthlySpending(transactions);
  const budgetUsed = monthlyBudget > 0 ? (monthlySpend / monthlyBudget) * 100 : 0;
  const budgetBarWidth = Math.min(budgetUsed, 100);

  const categoryTotals: Partial<Record<CategoryType, number>> = {};
  transactions.forEach(tx => {
    if (tx.isDebit) {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    }
  });
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 6);

  const recentTxs = transactions.slice(0, 5);
  const unpaidBills = bills.filter(b => b.status !== 'paid' && !b.isPaid).length;
  const totalLeakAmount = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);

  const userName = user?.name?.split(' ')[0] || 'User';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(600) : undefined}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.text }]}>{getGreeting()}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{userName}, here's your spending today</Text>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              style={[styles.avatarCircle, { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]}
              testID="home-settings-btn"
            >
              <Ionicons name="person" size={20} color={colors.accent} />
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(600) : undefined}>
          <LinearGradient
            colors={isDark ? ['#0F2027', '#132A13', '#0D3320'] : ['#E8F5E9', '#C8E6C9', '#A5D6A7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, { borderColor: colors.accent + '20' }]}
          >
            <View style={styles.balanceHeader}>
              <Text style={[styles.balanceLabel, { color: isDark ? colors.textSecondary : 'rgba(0,0,0,0.5)' }]}>This Month's Spending</Text>
              <View style={[styles.liveBadge, { backgroundColor: colors.accent + '15' }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.liveText, { color: colors.accent }]}>LIVE</Text>
              </View>
            </View>
            <Text style={[styles.balanceAmount, { color: isDark ? '#fff' : '#1A1A2E' }]}>{formatCurrency(monthlySpend)}</Text>
            <View style={styles.budgetBar}>
              <View style={[styles.budgetTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                <LinearGradient
                  colors={[colors.accent, '#00B87A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.budgetFill, { width: `${budgetBarWidth}%` as any }]}
                />
              </View>
              <Text style={[styles.budgetText, { color: isDark ? colors.textTertiary : 'rgba(0,0,0,0.4)' }]}>
                {Math.round(budgetUsed)}% of {formatCurrency(monthlyBudget)} budget
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <View style={styles.balanceStat}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textTertiary : 'rgba(0,0,0,0.4)' }]}>Today</Text>
                <Text style={[styles.statValue, { color: isDark ? '#fff' : '#1A1A2E' }]}>{formatCurrency(todaySpend)}</Text>
              </View>
              <View style={[styles.balanceDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.balanceStat}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textTertiary : 'rgba(0,0,0,0.4)' }]}>Daily Avg</Text>
                <Text style={[styles.statValue, { color: isDark ? '#fff' : '#1A1A2E' }]}>
                  {formatCurrency(Math.round(monthlySpend / Math.max(new Date().getDate(), 1)))}
                </Text>
              </View>
              <View style={[styles.balanceDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.balanceStat}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textTertiary : 'rgba(0,0,0,0.4)' }]}>Remaining</Text>
                <Text style={[styles.statValue, { color: isDark ? '#fff' : '#1A1A2E' }, monthlyBudget - monthlySpend < 0 ? { color: colors.danger } : {}]}>
                  {formatCurrency(Math.max(0, monthlyBudget - monthlySpend))}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(600) : undefined}>
          <View style={styles.insightsRow}>
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderLeftColor: colors.danger }]}>
              <Ionicons name="water" size={20} color={colors.danger} />
              <Text style={[styles.insightValue, { color: colors.text }]}>{formatCurrency(totalLeakAmount)}</Text>
              <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>Money Leaks</Text>
            </View>
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderLeftColor: colors.warning }]}>
              <Ionicons name="notifications" size={20} color={colors.warning} />
              <Text style={[styles.insightValue, { color: colors.text }]}>{unpaidBills}</Text>
              <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>Due Reminders</Text>
            </View>
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderLeftColor: colors.accentBlue }]}>
              <Ionicons name="trending-down" size={20} color={colors.accentBlue} />
              <Text style={[styles.insightValue, { color: colors.text }]}>{transactions.length}</Text>
              <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>Transactions</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(600) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spending by Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {sortedCategories.map(([cat, total], idx) => (
              <CategoryPill key={cat} category={cat as CategoryType} total={total as number} index={idx} colors={colors} />
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(600) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
          <View style={[styles.txCard, { backgroundColor: colors.card }]}>
            {recentTxs.map((tx, idx) => (
              <React.Fragment key={tx.id}>
                <TransactionRow
                  merchant={tx.merchant}
                  amount={tx.amount}
                  category={tx.category}
                  date={tx.date}
                  colors={colors}
                />
                {idx < recentTxs.length - 1 && <View style={[styles.txDivider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 4 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  balanceCard: { borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1 },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  balanceLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  balanceAmount: { fontFamily: 'Inter_700Bold', fontSize: 42, marginBottom: 16 },
  budgetBar: { marginBottom: 20 },
  budgetTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
  budgetFill: { height: '100%', borderRadius: 2 },
  budgetText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, height: 30 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  statValue: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  insightsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  insightCard: { flex: 1, borderRadius: 14, padding: 14, borderLeftWidth: 3, gap: 6 },
  insightValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  insightLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 14 },
  categoryScroll: { paddingBottom: 20, gap: 10 },
  categoryPill: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, minWidth: 130, gap: 6 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryPillLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  categoryPillAmount: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  txCard: { borderRadius: 16, padding: 4 },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txInfo: { flex: 1 },
  txMerchant: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  txTime: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  txAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  txDivider: { height: 1, marginHorizontal: 14 },
});
