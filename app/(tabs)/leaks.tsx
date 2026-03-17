import React, { useEffect, useState } from 'react';
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
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

export default function LeaksScreen() {
  const insets = useSafeAreaInsets();
  const { isLoading } = useExpenses();
  const { token } = useAuth();
  const { colors } = useTheme();
  const [planetData, setPlanetData] = useState<{
    life_score: number;
    stage: number;
    stage_label: string;
    metrics: {
      reminders_completed: number;
      medicine_taken: number;
      bills_paid: number;
      tasks_completed: number;
      missed_reminders: number;
    };
  } | null>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      try {
        const res = await apiRequest('GET', '/api/life-planet/status', undefined, token);
        const json = await res.json();
        setPlanetData(json);
      } catch {
        setPlanetData(null);
      }
    };
    run();
  }, [token]);

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
          <Text style={[styles.screenTitle, { color: colors.text }]}>Life Planet</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
            Your ecosystem grows as your life score improves
          </Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <LinearGradient
            colors={colors.heroGradient as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.savingsCard, { borderColor: colors.border }]}
          >
            <View style={styles.savingsCardTop}>
              <View style={[styles.savingsIconWrap, { backgroundColor: colors.accentMintDim }]}>
                <Ionicons name="shield-checkmark" size={26} color={colors.accentMint} />
              </View>
              <View style={styles.savingsContent}>
                <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>Potential Savings</Text>
                <Text style={[styles.savingsAmount, { color: colors.accentMint }]}>{planetData?.life_score ?? 0}</Text>
                <Text style={[styles.savingsAmountSuffix, { color: colors.textTertiary }]}>
                  {planetData?.stage_label || 'Tiny planet'}
                </Text>
              </View>
            </View>

            <View style={[styles.yearlySavingsRow, { backgroundColor: colors.surfaceGlow }]}>
              <Ionicons name="trending-up" size={16} color={colors.accentMint} />
              <Text style={[styles.yearlyText, { color: colors.accentMint }]}>
                Stage {planetData?.stage ?? 1} / 5 • Keep completing reminders & tasks
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View
          entering={Platform.OS !== 'web' ? FadeInDown.delay(150).duration(500) : undefined}
          style={styles.sectionHeader}
        >
          <View style={[styles.sectionBadge, { backgroundColor: colors.warningDim }]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={[styles.sectionTitle, { color: colors.warning }]}>
              Life metrics feeding your planet
            </Text>
          </View>
        </Animated.View>

        {!planetData ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentMintDim }]}>
              <Ionicons name="shield-checkmark" size={40} color={colors.accentMint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Loading your planet...</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Complete reminders, medicines and tasks to evolve it.
            </Text>
          </View>
        ) : (
          <View style={[styles.leakCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.leakMerchant, { color: colors.text }]}>Planet Progress</Text>
            <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>
              Reminders completed: {planetData.metrics.reminders_completed}{'\n'}
              Medicines taken: {planetData.metrics.medicine_taken}{'\n'}
              Bills managed: {planetData.metrics.bills_paid}{'\n'}
              Tasks completed: {planetData.metrics.tasks_completed}{'\n'}
              Missed reminders: {planetData.metrics.missed_reminders}
            </Text>
          </View>
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
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  savingsCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  savingsCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  savingsIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
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
    letterSpacing: 1,
    marginBottom: 4,
  },
  savingsAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    letterSpacing: -1,
  },
  savingsAmountSuffix: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  yearlySavingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  yearlyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  leakCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
  },
  leakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leakIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  leakInfo: {
    flex: 1,
  },
  leakMerchant: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    marginBottom: 6,
  },
  leakMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freqBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
    fontSize: 20,
    letterSpacing: -0.3,
  },
  leakAmountLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 2,
  },
  savingsPotentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  savingsPotentialText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  suggestionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
