import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import { CATEGORIES, formatCurrency, MoneyLeak } from '@/lib/data';
import { ThemeColors } from '@/constants/colors';

function LeakCard({ leak, index, colors }: { leak: MoneyLeak; index: number; colors: ThemeColors }) {
  const cat = CATEGORIES[leak.category];

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200 + index * 100).duration(500) : undefined}>
      <View style={[styles.leakCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.leakHeader}>
          <View style={[styles.leakIcon, { backgroundColor: cat.color + '18' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={styles.leakInfo}>
            <Text style={[styles.leakMerchant, { color: colors.text }]}>{leak.merchant}</Text>
            <View style={styles.leakMeta}>
              <View style={[styles.freqBadge, { backgroundColor: colors.dangerDim }]}>
                <Text style={[styles.freqText, { color: colors.danger }]}>{leak.frequency}</Text>
              </View>
              <Text style={[styles.leakCount, { color: colors.textTertiary }]}>{leak.transactionCount} times this month</Text>
            </View>
          </View>
          <View style={styles.leakAmountBox}>
            <Text style={[styles.leakAmount, { color: colors.text }]}>{formatCurrency(leak.monthlyEstimate)}</Text>
            <Text style={[styles.leakAmountLabel, { color: colors.textTertiary }]}>/month</Text>
          </View>
        </View>

        <View style={[styles.suggestionBox, { borderTopColor: colors.border }]}>
          <Ionicons name="bulb" size={14} color={colors.warning} />
          <Text style={[styles.suggestionText, { color: colors.warning }]}>{leak.suggestion}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function LeaksScreen() {
  const insets = useSafeAreaInsets();
  const { leaks, isLoading } = useExpenses();
  const { colors, isDark } = useTheme();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const totalLeaks = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);
  const potentialYearlySavings = totalLeaks * 12;

  const gradientColors: [string, string, string] = isDark
    ? ['#2D1117', '#1A0A0F', '#110D1A']
    : ['#FFF0F0', '#FFF5F0', '#F8F0FF'];

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
          <Text style={[styles.screenTitle, { color: colors.text }]}>Money Leaks</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>Recurring expenses draining your wallet</Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.savingsCard, { borderColor: colors.danger + '25' }]}
          >
            <View style={[styles.savingsIconWrap, { backgroundColor: colors.dangerDim }]}>
              <Ionicons name="water" size={28} color={colors.danger} />
            </View>
            <View style={styles.savingsContent}>
              <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>Potential Monthly Savings</Text>
              <Text style={[styles.savingsAmount, { color: colors.danger }]}>{formatCurrency(totalLeaks)}</Text>
              <View style={styles.yearlyRow}>
                <Ionicons name="trending-up" size={14} color={colors.accent} />
                <Text style={[styles.yearlyText, { color: colors.accent }]}>
                  That's {formatCurrency(potentialYearlySavings)} per year
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {leaks.length} leak{leaks.length !== 1 ? 's' : ''} detected
        </Text>

        {leaks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark" size={48} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No leaks detected</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Your spending looks healthy</Text>
          </View>
        ) : (
          leaks.map((leak, idx) => (
            <LeakCard key={leak.id} leak={leak} index={idx} colors={colors} />
          ))
        )}
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
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  savingsCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  savingsIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsContent: {
    flex: 1,
  },
  savingsLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  savingsAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    marginVertical: 4,
  },
  yearlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearlyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginBottom: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  leakCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  leakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leakIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  leakInfo: {
    flex: 1,
  },
  leakMerchant: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginBottom: 6,
  },
  leakMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freqBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freqText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  leakCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  leakAmountBox: {
    alignItems: 'flex-end',
  },
  leakAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  leakAmountLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  suggestionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
});
