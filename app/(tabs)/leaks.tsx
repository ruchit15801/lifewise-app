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
import Colors from '@/constants/colors';
import { useExpenses } from '@/lib/expense-context';
import { CATEGORIES, formatCurrency, MoneyLeak } from '@/lib/data';

function LeakCard({ leak, index }: { leak: MoneyLeak; index: number }) {
  const cat = CATEGORIES[leak.category];

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200 + index * 100).duration(500) : undefined}>
      <View style={styles.leakCard}>
        <View style={styles.leakHeader}>
          <View style={[styles.leakIcon, { backgroundColor: cat.color + '18' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={styles.leakInfo}>
            <Text style={styles.leakMerchant}>{leak.merchant}</Text>
            <View style={styles.leakMeta}>
              <View style={[styles.freqBadge, { backgroundColor: Colors.dark.dangerDim }]}>
                <Text style={styles.freqText}>{leak.frequency}</Text>
              </View>
              <Text style={styles.leakCount}>{leak.transactionCount} times this month</Text>
            </View>
          </View>
          <View style={styles.leakAmountBox}>
            <Text style={styles.leakAmount}>{formatCurrency(leak.monthlyEstimate)}</Text>
            <Text style={styles.leakAmountLabel}>/month</Text>
          </View>
        </View>

        <View style={styles.suggestionBox}>
          <Ionicons name="bulb" size={14} color={Colors.dark.warning} />
          <Text style={styles.suggestionText}>{leak.suggestion}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function LeaksScreen() {
  const insets = useSafeAreaInsets();
  const { leaks, isLoading } = useExpenses();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const totalLeaks = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);
  const potentialYearlySavings = totalLeaks * 12;

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
          <Text style={styles.screenTitle}>Money Leaks</Text>
          <Text style={styles.screenSubtitle}>Recurring expenses draining your wallet</Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <LinearGradient
            colors={['#2D1117', '#1A0A0F', '#110D1A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.savingsCard}
          >
            <View style={styles.savingsIconWrap}>
              <Ionicons name="water" size={28} color={Colors.dark.danger} />
            </View>
            <View style={styles.savingsContent}>
              <Text style={styles.savingsLabel}>Potential Monthly Savings</Text>
              <Text style={styles.savingsAmount}>{formatCurrency(totalLeaks)}</Text>
              <View style={styles.yearlyRow}>
                <Ionicons name="trending-up" size={14} color={Colors.dark.accent} />
                <Text style={styles.yearlyText}>
                  That's {formatCurrency(potentialYearlySavings)} per year
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={styles.sectionTitle}>
          {leaks.length} leak{leaks.length !== 1 ? 's' : ''} detected
        </Text>

        {leaks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark" size={48} color={Colors.dark.accent} />
            <Text style={styles.emptyTitle}>No leaks detected</Text>
            <Text style={styles.emptySubtitle}>Your spending looks healthy</Text>
          </View>
        ) : (
          leaks.map((leak, idx) => (
            <LeakCard key={leak.id} leak={leak} index={idx} />
          ))
        )}
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
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
    marginBottom: 24,
  },
  savingsCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.dark.danger + '25',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  savingsIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.dark.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsContent: {
    flex: 1,
  },
  savingsLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  savingsAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.dark.danger,
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
    color: Colors.dark.accent,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  leakCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    color: Colors.dark.text,
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
    color: Colors.dark.danger,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  leakCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
  },
  leakAmountBox: {
    alignItems: 'flex-end',
  },
  leakAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.dark.text,
  },
  leakAmountLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.dark.textTertiary,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  suggestionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.dark.warning,
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
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
});
