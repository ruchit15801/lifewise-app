import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useExpenses } from '@/lib/expense-context';
import { CATEGORIES, CategoryType } from '@/lib/data';
import CategoryIcon from '@/components/CategoryIcon';

interface MemoryCard {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  insight: string;
  tag: string;
  category?: CategoryType;
}

export default function LifeMemoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const { transactions, bills, leaks } = useExpenses();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const memories = useMemo((): MemoryCard[] => {
    const cards: MemoryCard[] = [];

    const dayTotals: Record<string, number> = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    transactions.forEach(tx => {
      if (tx.isDebit) {
        const day = dayNames[new Date(tx.date).getDay()];
        dayTotals[day] = (dayTotals[day] || 0) + tx.amount;
      }
    });
    const topDay = Object.entries(dayTotals).sort(([, a], [, b]) => b - a)[0];
    if (topDay) {
      cards.push({
        id: 'day_pattern',
        icon: 'calendar',
        iconColor: '#8B5CF6',
        title: 'Spending Pattern',
        insight: `You tend to spend the most on ${topDay[0]}s. Average: ${formatAmount(Math.round(topDay[1] / 4))} per ${topDay[0]}.`,
        tag: 'Pattern',
        category: 'habits',
      });
    }

    const catTotals: Partial<Record<CategoryType, number>> = {};
    transactions.forEach(tx => {
      if (tx.isDebit) {
        catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
      }
    });

    const topCat = Object.entries(catTotals).sort(([, a], [, b]) => (b as number) - (a as number))[0];
    if (topCat) {
      const catKey = topCat[0] as CategoryType;
      const cat = CATEGORIES[catKey] || CATEGORIES.others;
      cards.push({
        id: 'top_category',
        icon: cat.icon,
        iconColor: cat.color,
        title: 'Top Category',
        insight: `${cat.label} is your highest spending category at ${formatAmount(topCat[1] as number)} this month.`,
        tag: 'Spending',
        category: catKey,
      });
    }

    // New AI: Subscription Sentinel
    if (bills.length > 0) {
      const yearlySubscriptions = bills.reduce((s, b) => s + b.amount * 12, 0);
      cards.push({
        id: 'sub_sentinel',
        icon: 'refresh-circle',
        iconColor: '#3B82F6',
        title: 'Subscription Sentinel',
        insight: `You have ${bills.length} active subscriptions. Projected yearly cost: ${formatAmount(yearlySubscriptions)}.`,
        tag: 'Subscriptions',
        category: 'subscriptions',
      });
    }

    // New AI: Wealth Wisdom (Weekly Comparison)
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    const lastWeekSpend = transactions
      .filter(tx => tx.isDebit && new Date(tx.date) >= oneWeekAgo)
      .reduce((s, tx) => s + tx.amount, 0);
      
    const prevWeekSpend = transactions
      .filter(tx => tx.isDebit && new Date(tx.date) >= twoWeeksAgo && new Date(tx.date) < oneWeekAgo)
      .reduce((s, tx) => s + tx.amount, 0);

    if (lastWeekSpend > 0 && prevWeekSpend > 0) {
      const diff = ((lastWeekSpend - prevWeekSpend) / prevWeekSpend) * 100;
      cards.push({
        id: 'wealth_wisdom',
        icon: 'stats-chart',
        iconColor: diff > 0 ? '#EF4444' : '#10B981',
        title: 'Wealth Wisdom',
        insight: diff > 0 
          ? `Your spending is up ${Math.round(diff)}% compared to last week. Let's look for leaks!` 
          : `Great job! You spent ${Math.abs(Math.round(diff))}% less than last week.`,
        tag: 'Wealth',
      });
    }

    // New AI: Nocturnal Nibbles (Late night food)
    const lateNightFood = transactions.filter(tx => {
      const date = new Date(tx.date);
      const hour = date.getHours();
      // Using 'habits' as the category for food-related habits if 'food' is not available
      return (tx.category as string === 'food' || tx.category === 'habits') && (hour >= 22 || hour <= 4);
    });

    if (lateNightFood.length >= 3) {
      cards.push({
        id: 'nocturnal_nibbles',
        icon: 'moon',
        iconColor: '#1E293B',
        title: 'Nocturnal Nibbles',
        insight: `We noticed ${lateNightFood.length} late-night food orders this month. This habit costs you approx. ${formatAmount(lateNightFood.reduce((s, tx) => s + tx.amount, 0))} monthly.`,
        tag: 'Health',
        category: 'habits',
      });
    }

    const merchantCounts: Record<string, number> = {};
    transactions.forEach(tx => {
      merchantCounts[tx.merchant] = (merchantCounts[tx.merchant] || 0) + 1;
    });
    const favMerchant = Object.entries(merchantCounts).sort(([, a], [, b]) => b - a)[0];
    if (favMerchant) {
      cards.push({
        id: 'fav_merchant',
        icon: 'heart',
        iconColor: '#EC4899',
        title: 'Favourite Place',
        insight: `You visit ${favMerchant[0]} the most - ${favMerchant[1]} times this month.`,
        tag: 'Habit',
        category: 'others',
      });
    }

    const foodTxByDay: Record<number, number> = {};
    // Casting to string to allow comparison with potential legacy data
    transactions.filter(tx => (tx.category as string === 'food' || tx.category === 'habits') && tx.isDebit).forEach(tx => {
      const day = new Date(tx.date).getDay();
      foodTxByDay[day] = (foodTxByDay[day] || 0) + 1;
    });
    const topFoodDay = Object.entries(foodTxByDay).sort(([, a], [, b]) => b - a)[0];
    if (topFoodDay) {
      cards.push({
        id: 'food_pattern',
        icon: 'fast-food',
        iconColor: '#F97316',
        title: 'Food Ordering',
        insight: `You order food the most on ${dayNames[Number(topFoodDay[0])]}s. Consider meal prepping!`,
        tag: 'Food',
        category: 'habits',
      });
    }

    if (leaks.length > 0) {
      const totalLeaks = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);
      cards.push({
        id: 'leak_insight',
        icon: 'water',
        iconColor: '#EF4444',
        title: 'Savings Opportunity',
        insight: `We detected ${leaks.length} potential money leaks. You could save up to ${formatAmount(totalLeaks * 12)} yearly.`,
        tag: 'Savings',
        category: 'finance',
      });
    }

    const healthTxs = transactions.filter(tx => (tx.category === 'health' || tx.category as string === 'healthcare' || tx.category as string === 'medicine') && tx.isDebit);
    if (healthTxs.length > 0) {
      const topHealthMerchant = Object.entries(
        healthTxs.reduce((acc, tx) => { acc[tx.merchant] = (acc[tx.merchant] || 0) + 1; return acc; }, {} as Record<string, number>)
      ).sort(([, a], [, b]) => b - a)[0];
      if (topHealthMerchant) {
        cards.push({
          id: 'health_pref',
          icon: 'medkit',
          iconColor: '#10B981',
          title: 'Healthcare Preference',
          insight: `${topHealthMerchant[0]} is your go-to for healthcare needs.`,
          tag: 'Health',
          category: 'health',
        });
      }
    }

    return cards;
  }, [transactions, bills, leaks, formatAmount]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16, paddingBottom: bottomInset + 20 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: colors.text }]}>Life Memory</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Things we remember for you</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="sparkles" size={24} color={colors.accent} />
          </View>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {`We\u2019ve analyzed your spending patterns and remembered ${memories.length} insights about your lifestyle.`}
          </Text>
        </View>

        {memories.map((memory, idx) => (
          <Animated.View
            key={memory.id}
            entering={Platform.OS !== 'web' ? FadeInDown.delay(idx * 60).duration(400) : undefined}
          >
            <View style={[styles.memoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.memoryTop}>
                <View style={[styles.memoryIconWrap, { backgroundColor: memory.iconColor + '15' }]}>
                  {memory.category ? (
                    <CategoryIcon category={memory.category} size={20} />
                  ) : (
                    <Ionicons name={memory.icon as any} size={20} color={memory.iconColor} />
                  )}
                </View>
                <View style={[styles.tagBadge, { backgroundColor: memory.iconColor + '12' }]}>
                  <Text style={[styles.tagText, { color: memory.iconColor }]}>{memory.tag}</Text>
                </View>
              </View>
              <Text style={[styles.memoryTitle, { color: colors.text }]}>{memory.title}</Text>
              <Text style={[styles.memoryInsight, { color: colors.textSecondary }]}>{memory.insight}</Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerCenter: { alignItems: 'center', gap: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  summaryCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  memoryCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 12, gap: 10 },
  memoryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memoryIconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tagBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  memoryTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  memoryInsight: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
});
