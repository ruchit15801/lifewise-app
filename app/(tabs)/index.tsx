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

function SpendingScoreRing({ score, colors, isDark }: { score: number; colors: any; isDark: boolean }) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const scoreColor = clampedScore >= 70 ? colors.accentMint : clampedScore >= 40 ? colors.warning : colors.danger;

  return (
    <View style={ringStyles.container}>
      <View style={[ringStyles.outerRing, { borderColor: scoreColor + '25' }]}>
        <View style={[ringStyles.innerRing, { borderColor: scoreColor + '60' }]}>
          <Text style={[ringStyles.scoreValue, { color: colors.text }]}>{clampedScore}</Text>
          <Text style={[ringStyles.scoreLabel, { color: colors.textTertiary }]}>SCORE</Text>
        </View>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  outerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  scoreLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.5 },
});

function InsightCard({ icon, iconColor, bgColor, title, value, subtitle, colors }: {
  icon: string; iconColor: string; bgColor: string; title: string; value: string; subtitle: string; colors: any;
}) {
  return (
    <View style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.insightIconWrap, { backgroundColor: bgColor }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.insightTitle, { color: colors.textSecondary }]}>{title}</Text>
      <Text style={[styles.insightValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.insightSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
    </View>
  );
}

function CategoryPill({ category, total, index, colors }: { category: CategoryType; total: number; index: number; colors: any }) {
  const cat = CATEGORIES[category];
  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInRight.delay(index * 80).springify() : undefined}>
      <View style={[styles.categoryPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.catIconWrap, { backgroundColor: cat.color + '15' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <View style={styles.catTextWrap}>
          <Text style={[styles.categoryPillLabel, { color: colors.textSecondary }]}>{cat.label}</Text>
          <Text style={[styles.categoryPillAmount, { color: colors.text }]}>{formatCurrency(total)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function TransactionRow({ merchant, amount, category, date, colors }: { merchant: string; amount: number; category: CategoryType; date: string; colors: any }) {
  const cat = CATEGORIES[category];
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: cat.color + '12' }]}>
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

  const billsPaidRatio = bills.length > 0 ? bills.filter(b => b.isPaid).length / bills.length : 0;
  const budgetHealthScore = Math.round(
    Math.max(0, Math.min(100, 100 - budgetUsed)) * 0.5 +
    billsPaidRatio * 30 +
    (totalLeakAmount < 1000 ? 20 : totalLeakAmount < 3000 ? 10 : 0)
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 12, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.greeting, { color: colors.text }]}>{getGreeting()}</Text>
              <Text style={[styles.userName, { color: colors.textSecondary }]}>{userName}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              testID="home-settings-btn"
            >
              <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(80).duration(500) : undefined}>
          <LinearGradient
            colors={colors.heroGradient as unknown as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroLeft}>
                <Text style={[styles.heroLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.45)' }]}>This Month</Text>
                <Text style={[styles.heroAmount, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{formatCurrency(monthlySpend)}</Text>
                <View style={styles.budgetSection}>
                  <View style={[styles.budgetTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]}>
                    <LinearGradient
                      colors={colors.buttonGradient as unknown as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.budgetFill, { width: `${budgetBarWidth}%` as any }]}
                    />
                  </View>
                  <Text style={[styles.budgetText, { color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)' }]}>
                    {Math.round(budgetUsed)}% of {formatCurrency(monthlyBudget)}
                  </Text>
                </View>
              </View>
              <SpendingScoreRing score={budgetHealthScore} colors={colors} isDark={isDark} />
            </View>
            <View style={[styles.heroDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Today</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{formatCurrency(todaySpend)}</Text>
              </View>
              <View style={[styles.heroStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Daily Avg</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  {formatCurrency(Math.round(monthlySpend / Math.max(new Date().getDate(), 1)))}
                </Text>
              </View>
              <View style={[styles.heroStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Remaining</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }, monthlyBudget - monthlySpend < 0 ? { color: colors.danger } : {}]}>
                  {formatCurrency(Math.max(0, monthlyBudget - monthlySpend))}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(160).duration(500) : undefined}>
          <View style={styles.insightsRow}>
            <InsightCard
              icon="water"
              iconColor={colors.danger}
              bgColor={colors.dangerDim}
              title="Leaks"
              value={formatCurrency(totalLeakAmount)}
              subtitle="/month"
              colors={colors}
            />
            <InsightCard
              icon="notifications"
              iconColor={colors.warning}
              bgColor={colors.warningDim}
              title="Due"
              value={String(unpaidBills)}
              subtitle="reminders"
              colors={colors}
            />
            <InsightCard
              icon="swap-horizontal"
              iconColor={colors.accentBlue}
              bgColor={colors.accentBlueDim}
              title="Total"
              value={String(transactions.length)}
              subtitle="this month"
              colors={colors}
            />
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(240).duration(500) : undefined}>
          <View style={[styles.lifeInsightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.lifeInsightIconWrap, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
            </View>
            <View style={styles.lifeInsightContent}>
              <Text style={[styles.lifeInsightTitle, { color: colors.text }]}>Spending Insight</Text>
              <Text style={[styles.lifeInsightText, { color: colors.textSecondary }]}>
                {todaySpend > 500
                  ? `You've spent ${formatCurrency(todaySpend)} today. Consider slowing down to stay within your daily average.`
                  : `Great discipline today! You've only spent ${formatCurrency(todaySpend)} so far.`}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(320).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spending by Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {sortedCategories.map(([cat, total], idx) => (
              <CategoryPill key={cat} category={cat as CategoryType} total={total as number} index={idx} colors={colors} />
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
          <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {recentTxs.map((tx, idx) => (
              <React.Fragment key={tx.id}>
                <TransactionRow merchant={tx.merchant} amount={tx.amount} category={tx.category} date={tx.date} colors={colors} />
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
  scrollContent: { paddingHorizontal: 20, gap: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: { gap: 2 },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 14, opacity: 0.6 },
  userName: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroCard: { borderRadius: 24, padding: 24, marginBottom: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLeft: { flex: 1, marginRight: 16 },
  heroLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 6 },
  heroAmount: { fontFamily: 'Inter_700Bold', fontSize: 36, marginBottom: 12 },
  budgetSection: { gap: 6 },
  budgetTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 2 },
  budgetText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  heroDivider: { height: 1, marginVertical: 18 },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDivider: { width: 1, height: 28 },
  heroStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  heroStatValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  insightsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  insightCard: { flex: 1, borderRadius: 18, padding: 14, gap: 6, borderWidth: 1 },
  insightIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  insightValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  insightSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  lifeInsightCard: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 18,
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 24,
  },
  lifeInsightIconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  lifeInsightContent: { flex: 1, gap: 4 },
  lifeInsightTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  lifeInsightText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 14 },
  categoryScroll: { paddingBottom: 24, gap: 10 },
  categoryPill: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catTextWrap: { gap: 2 },
  categoryPillLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  categoryPillAmount: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  txCard: { borderRadius: 20, padding: 6, borderWidth: 1 },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txInfo: { flex: 1 },
  txMerchant: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  txTime: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  txAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  txDivider: { height: 1, marginHorizontal: 14 },
});
