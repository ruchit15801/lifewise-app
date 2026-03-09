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
import Colors from '@/constants/colors';
import { useExpenses } from '@/lib/expense-context';
import {
  CATEGORIES,
  formatCurrency,
  getTodaySpending,
  getMonthlySpending,
  getGreeting,
  formatTime,
  CategoryType,
} from '@/lib/data';

function CategoryPill({ category, total, index }: { category: CategoryType; total: number; index: number }) {
  const cat = CATEGORIES[category];
  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInRight.delay(index * 80).springify() : undefined}>
      <View style={[styles.categoryPill, { borderColor: cat.color + '30' }]}>
        <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
        <Text style={styles.categoryPillLabel}>{cat.label}</Text>
        <Text style={[styles.categoryPillAmount, { color: cat.color }]}>
          {formatCurrency(total)}
        </Text>
      </View>
    </Animated.View>
  );
}

function TransactionRow({ merchant, amount, category, date }: { merchant: string; amount: number; category: CategoryType; date: string }) {
  const cat = CATEGORIES[category];
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: cat.color + '18' }]}>
        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txMerchant}>{merchant}</Text>
        <Text style={styles.txTime}>{formatTime(date)}</Text>
      </View>
      <Text style={styles.txAmount}>- {formatCurrency(amount)}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, bills, leaks, isLoading, monthlyBudget } = useExpenses();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
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
  const unpaidBills = bills.filter(b => !b.isPaid).length;
  const totalLeakAmount = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);

  return (
    <View style={styles.container}>
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
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.subtitle}>Here's your spending today</Text>
            </View>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color={Colors.dark.accent} />
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(600) : undefined}>
          <LinearGradient
            colors={['#0F2027', '#132A13', '#0D3320']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>This Month's Spending</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.balanceAmount}>{formatCurrency(monthlySpend)}</Text>
            <View style={styles.budgetBar}>
              <View style={styles.budgetTrack}>
                <LinearGradient
                  colors={[Colors.dark.accent, '#00B87A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.budgetFill, { width: `${budgetBarWidth}%` as any }]}
                />
              </View>
              <Text style={styles.budgetText}>
                {Math.round(budgetUsed)}% of {formatCurrency(monthlyBudget)} budget
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <View style={styles.balanceStat}>
                <Text style={styles.statLabel}>Today</Text>
                <Text style={styles.statValue}>{formatCurrency(todaySpend)}</Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceStat}>
                <Text style={styles.statLabel}>Daily Avg</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(Math.round(monthlySpend / new Date().getDate()))}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceStat}>
                <Text style={styles.statLabel}>Remaining</Text>
                <Text style={[styles.statValue, monthlyBudget - monthlySpend < 0 ? { color: Colors.dark.danger } : {}]}>
                  {formatCurrency(Math.max(0, monthlyBudget - monthlySpend))}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(600) : undefined}>
          <View style={styles.insightsRow}>
            <View style={[styles.insightCard, { borderLeftColor: Colors.dark.danger }]}>
              <Ionicons name="water" size={20} color={Colors.dark.danger} />
              <Text style={styles.insightValue}>{formatCurrency(totalLeakAmount)}</Text>
              <Text style={styles.insightLabel}>Money Leaks</Text>
            </View>
            <View style={[styles.insightCard, { borderLeftColor: Colors.dark.warning }]}>
              <Ionicons name="calendar" size={20} color={Colors.dark.warning} />
              <Text style={styles.insightValue}>{unpaidBills}</Text>
              <Text style={styles.insightLabel}>Pending Bills</Text>
            </View>
            <View style={[styles.insightCard, { borderLeftColor: Colors.dark.accentBlue }]}>
              <Ionicons name="trending-down" size={20} color={Colors.dark.accentBlue} />
              <Text style={styles.insightValue}>{transactions.length}</Text>
              <Text style={styles.insightLabel}>Transactions</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(600) : undefined}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {sortedCategories.map(([cat, total], idx) => (
              <CategoryPill key={cat} category={cat as CategoryType} total={total as number} index={idx} />
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(600) : undefined}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <View style={styles.txCard}>
            {recentTxs.map((tx, idx) => (
              <React.Fragment key={tx.id}>
                <TransactionRow
                  merchant={tx.merchant}
                  amount={tx.amount}
                  category={tx.category}
                  date={tx.date}
                />
                {idx < recentTxs.length - 1 && <View style={styles.txDivider} />}
              </React.Fragment>
            ))}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.dark.text,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.accent + '40',
  },
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.dark.accent + '20',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.accent + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    marginRight: 6,
  },
  liveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.dark.accent,
    letterSpacing: 1,
  },
  balanceAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 42,
    color: Colors.dark.text,
    marginBottom: 16,
  },
  budgetBar: {
    marginBottom: 20,
  },
  budgetTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceStat: {
    flex: 1,
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  insightsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  insightCard: {
    flex: 1,
    backgroundColor: Colors.dark.card,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    gap: 6,
  },
  insightValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.dark.text,
  },
  insightLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: Colors.dark.text,
    marginBottom: 14,
  },
  categoryScroll: {
    paddingBottom: 20,
    gap: 10,
  },
  categoryPill: {
    backgroundColor: Colors.dark.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    minWidth: 130,
    gap: 6,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryPillLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  categoryPillAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.dark.text,
  },
  txCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txMerchant: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.dark.text,
  },
  txTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.danger,
  },
  txDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: 14,
  },
});
