import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { getApiUrl, apiRequest } from '@/lib/query-client';
import Animated, { FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useExpenses } from '@/lib/expense-context';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import {
  CATEGORIES,
  getTodaySpending,
  getMonthlySpending,
  getGreeting,
  formatTime,
  CategoryType,
} from '@/lib/data';

function SpendingScoreRing({ score, colors, isDark, onPress }: { score: number; colors: any; isDark: boolean; onPress?: () => void }) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const scoreColor = clampedScore >= 70 ? colors.accentMint : clampedScore >= 40 ? colors.warning : colors.danger;

  return (
    <Pressable onPress={onPress} style={ringStyles.container}>
      <View style={[ringStyles.outerRing, { borderColor: scoreColor + '25' }]}>
        <View style={[ringStyles.innerRing, { borderColor: scoreColor + '60' }]}>
          <Text style={[ringStyles.scoreValue, { color: colors.text }]}>{clampedScore}</Text>
          <Text style={[ringStyles.scoreLabel, { color: colors.textTertiary }]}>SCORE</Text>
        </View>
      </View>
    </Pressable>
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

function CategoryPill({ category, total, index, colors, formatAmount }: { category: CategoryType; total: number; index: number; colors: any; formatAmount: (n: number) => string }) {
  const cat = CATEGORIES[category];
  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInRight.delay(index * 80).springify() : undefined}>
      <View style={[styles.categoryPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.catIconWrap, { backgroundColor: cat.color + '15' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <View style={styles.catTextWrap}>
          <Text style={[styles.categoryPillLabel, { color: colors.textSecondary }]}>{cat.label}</Text>
          <Text style={[styles.categoryPillAmount, { color: colors.text }]}>{formatAmount(total)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function TransactionRow({ merchant, amount, category, date, colors, formatAmount }: { merchant: string; amount: number; category: CategoryType; date: string; colors: any; formatAmount: (n: number) => string }) {
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
      <Text style={[styles.txAmount, { color: colors.danger }]}>- {formatAmount(amount)}</Text>
    </View>
  );
}

function SyncingSmsOverlay({ colors }: { colors: any }) {
  const rotation = useSharedValue(0);
  React.useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1500 }), -1, true);
  }, [rotation]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return (
    <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={[colors.accentDim, colors.bgSecondary || colors.card]}
        style={styles.syncOverlayCard}
      >
        <Animated.View style={[styles.syncIconWrap, { backgroundColor: colors.accentDim }, animatedStyle]}>
          <Ionicons name="sync" size={40} color={colors.accent} />
        </Animated.View>
        <Text style={[styles.syncTitle, { color: colors.text }]}>Syncing SMS</Text>
        <Text style={[styles.syncSubtitle, { color: colors.textSecondary }]}>Fetching your transactions…</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
      </LinearGradient>
    </View>
  );
}

function ActionButton({ icon, label, color, onPress, colors }: { icon: string; label: string; color: string; onPress: () => void; colors: any }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtnWrap}>
      <View style={[styles.actionBtnCircle, { backgroundColor: color + '15', borderColor: color + '25' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={[styles.actionBtnLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function QuickAccessCard({ icon, label, subtitle, color, onPress, colors }: { icon: string; label: string; subtitle: string; color: string; onPress: () => void; colors: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.quickCardIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.quickCardLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.quickCardSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    transactions,
    bills,
    leaks,
    isLoading,
    isSyncingSms,
    monthlyBudget,
    refreshData,
    syncSmsFromDevice,
    quickAddReminder,
  } = useExpenses();
  const { user, token } = useAuth();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const [seniorMode, setSeniorMode] = useState(false);
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await apiRequest('GET', '/api/notifications', undefined, token);
        const json = (await res.json()) as { id: string; read: boolean }[];
        const count = json.filter((n) => !n.read).length;
        setUnreadCount(count);
      } catch {
        // ignore
      }
    };
    if (token) {
      run();
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@lifewise_senior_mode').then(v => {
        setSeniorMode(v === 'true');
      }).catch(() => {});
    }, [])
  );

  if (isLoading || isSyncingSms) {
    return <SyncingSmsOverlay colors={colors} />;
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
  let budgetHealthScore = Math.round(
    Math.max(0, Math.min(100, 100 - budgetUsed)) * 0.5 +
    billsPaidRatio * 30 +
    (totalLeakAmount < 1000 ? 20 : totalLeakAmount < 3000 ? 10 : 0)
  );

  // If everything is effectively zero, keep score at 0 to avoid confusion.
  if (monthlySpend === 0 && bills.length === 0 && totalLeakAmount === 0) {
    budgetHealthScore = 0;
  }

  const upcomingBills = bills.filter(b => !b.isPaid && b.status !== 'paid').slice(0, 3);

  const showComingSoon = () => {
    if (Platform.OS === 'web') {
      alert('Coming soon!');
    } else {
      Alert.alert('Coming Soon', 'This feature will be available in a future update.');
    }
  };

  const handleScanBill = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to scan bills.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/bills/scan', baseUrl).toString();
      const form = new FormData();
      form.append('image', {
        uri: asset.uri,
        name: asset.fileName || 'bill.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        Alert.alert('Scan failed', 'Could not scan this bill. You can add it manually in Reminders.');
        return;
      }
      await refreshData();
      Alert.alert('Bill added', 'We scanned your bill and created a reminder.');
    } catch (e) {
      Alert.alert('Scan failed', 'Network error while scanning bill.');
    }
  }, [refreshData]);

  if (seniorMode) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 12, paddingBottom: Platform.OS === 'web' ? 100 : 100 }]}
        >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={[styles.greeting, { color: colors.text }]}>{getGreeting()}</Text>
                <Text style={[styles.userName, { color: colors.textSecondary }]}>{userName}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => router.push('/notifications')}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                  {unreadCount > 0 && (
                    <View style={styles.unreadDot} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings')}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  testID="home-settings-btn"
                >
                  <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

          <View style={[styles.seniorHeroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.seniorHeroLabel, { color: colors.textSecondary }]}>Balance Left</Text>
            <Text style={[styles.seniorHeroAmount, { color: colors.text }]}>{formatAmount(Math.max(0, monthlyBudget - monthlySpend))}</Text>
          </View>

          <View style={styles.seniorGrid}>
            <Pressable onPress={() => router.push('/(tabs)/transactions')} style={[styles.seniorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.seniorBtnIcon, { backgroundColor: colors.accentDim }]}>
                <Ionicons name="wallet" size={32} color={colors.accent} />
              </View>
              <Text style={[styles.seniorBtnLabel, { color: colors.text }]}>Money</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/family')} style={[styles.seniorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.seniorBtnIcon, { backgroundColor: '#10B981' + '12' }]}>
                <Ionicons name="medkit" size={32} color="#10B981" />
              </View>
              <Text style={[styles.seniorBtnLabel, { color: colors.text }]}>Health</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/family')} style={[styles.seniorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.seniorBtnIcon, { backgroundColor: '#EC4899' + '12' }]}>
                <Ionicons name="people" size={32} color="#EC4899" />
              </View>
              <Text style={[styles.seniorBtnLabel, { color: colors.text }]}>Family</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/bills')} style={[styles.seniorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.seniorBtnIcon, { backgroundColor: '#F59E0B' + '12' }]}>
                <Ionicons name="notifications" size={32} color="#F59E0B" />
              </View>
              <Text style={[styles.seniorBtnLabel, { color: colors.text }]}>Reminders</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
            title="Syncing SMS…"
          />
        }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => router.push('/notifications')}
                style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                {unreadCount > 0 && <View style={styles.unreadDot} />}
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings')}
                style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID="home-settings-btn"
              >
                <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
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
                <Text style={[styles.heroAmount, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{formatAmount(monthlySpend)}</Text>
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
                    {Math.round(budgetUsed)}% of {formatAmount(monthlyBudget)}
                  </Text>
                </View>
              </View>
              <SpendingScoreRing score={budgetHealthScore} colors={colors} isDark={isDark} onPress={() => setShowScoreDetail(true)} />
            </View>
            <View style={[styles.heroDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Today</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{formatAmount(todaySpend)}</Text>
              </View>
              <View style={[styles.heroStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Daily Avg</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  {formatAmount(Math.round(monthlySpend / Math.max(new Date().getDate(), 1)))}
                </Text>
              </View>
              <View style={[styles.heroStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)' }]}>Remaining</Text>
                <Text style={[styles.heroStatValue, { color: isDark ? '#F1F5F9' : '#0F172A' }, monthlyBudget - monthlySpend < 0 ? { color: colors.danger } : {}]}>
                  {formatAmount(Math.max(0, monthlyBudget - monthlySpend))}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {upcomingBills.length > 0 && (
          <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(120).duration(500) : undefined}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Reminders</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.remindersScroll}>
              {upcomingBills.map((bill) => {
                const dueDate = new Date(bill.dueDate);
                return (
                  <View key={bill.id} style={[styles.reminderPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.reminderPillIcon, { backgroundColor: colors.warningDim }]}>
                      <Ionicons name={bill.icon as any} size={18} color={colors.warning} />
                    </View>
                    <View style={styles.reminderPillInfo}>
                      <Text style={[styles.reminderPillName, { color: colors.text }]} numberOfLines={1}>{bill.name}</Text>
                      <Text style={[styles.reminderPillDue, { color: colors.textTertiary }]}>
                        {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                    <Text style={[styles.reminderPillAmount, { color: colors.accent }]}>{formatAmount(bill.amount)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(160).duration(500) : undefined}>
          <View style={styles.insightsRow}>
            <InsightCard
              icon="water"
              iconColor={colors.danger}
              bgColor={colors.dangerDim}
              title="Leaks"
              value={formatAmount(totalLeakAmount)}
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

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Access</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
            <QuickAccessCard icon="people" label="Family Hub" subtitle="Health & Meds" color="#EC4899" onPress={() => router.push('/family')} colors={colors} />
            <QuickAccessCard icon="sparkles" label="Life Memory" subtitle="AI Patterns" color="#8B5CF6" onPress={() => router.push('/life-memory')} colors={colors} />
            <QuickAccessCard icon="chatbubble-ellipses" label="Assistant" subtitle="Smart Advice" color="#3B82F6" onPress={() => router.push('/assistant')} colors={colors} />
          </ScrollView>
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
                  ? `You've spent ${formatAmount(todaySpend)} today. Consider slowing down to stay within your daily average.`
                  : `Great discipline today! You've only spent ${formatAmount(todaySpend)} so far.`}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(320).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spending by Category</Text>
          {sortedCategories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentDim }]}>
                <Ionicons name="pie-chart-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.emptyTextWrap}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No spending yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                  Add a few expenses and we’ll show a beautiful category breakdown here.
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              {sortedCategories.map(([cat, total], idx) => (
                <CategoryPill key={cat} category={cat as CategoryType} total={total as number} index={idx} colors={colors} formatAmount={formatAmount} />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(400).duration(500) : undefined}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
          {recentTxs.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentBlueDim || colors.accentDim }]}>
                <Ionicons name="receipt-outline" size={20} color={colors.accentBlue || colors.accent} />
              </View>
              <View style={styles.emptyTextWrap}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity recorded</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                  Tap Auto Track or add a transaction to see your latest spending here.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {recentTxs.map((tx, idx) => (
                <React.Fragment key={tx.id}>
                  <TransactionRow merchant={tx.merchant} amount={tx.amount} category={tx.category} date={tx.date} colors={colors} formatAmount={formatAmount} />
                  {idx < recentTxs.length - 1 && <View style={[styles.txDivider, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(480).duration(500) : undefined}>
          <View style={styles.actionButtonsRow}>
            <ActionButton icon="add-circle" label="Quick Add" color={colors.accent} onPress={() => setShowQuickAdd(true)} colors={colors} />
            <ActionButton icon="camera" label="Scan Bill" color="#3B82F6" onPress={handleScanBill} colors={colors} />
            <ActionButton icon="flash" label="Auto Track" color="#F59E0B" onPress={syncSmsFromDevice} colors={colors} />
          </View>
        </Animated.View>
      </ScrollView>

      <Modal visible={showScoreDetail} transparent animationType="fade">
        <Pressable style={styles.scoreOverlay} onPress={() => setShowScoreDetail(false)}>
          <View style={[styles.scoreDetailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.scoreDetailHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.scoreDetailTitle, { color: colors.text }]}>Life Score Breakdown</Text>
              <Pressable onPress={() => setShowScoreDetail(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <SpendingScoreRing score={budgetHealthScore} colors={colors} isDark={isDark} />
            </View>

            <View style={styles.scoreBreakdown}>
              <View style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
                <View style={styles.scoreRowLeft}>
                  <View style={[styles.scoreRowDot, { backgroundColor: colors.accentMint }]} />
                  <Text style={[styles.scoreRowLabel, { color: colors.text }]}>Budget Control</Text>
                </View>
                <Text style={[styles.scoreRowValue, { color: colors.accentMint }]}>
                  {Math.round(Math.max(0, Math.min(100, 100 - budgetUsed)) * 0.5)}/50
                </Text>
              </View>
              <View style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
                <View style={styles.scoreRowLeft}>
                  <View style={[styles.scoreRowDot, { backgroundColor: colors.accentBlue }]} />
                  <Text style={[styles.scoreRowLabel, { color: colors.text }]}>Bills Paid</Text>
                </View>
                <Text style={[styles.scoreRowValue, { color: colors.accentBlue }]}>
                  {Math.round(billsPaidRatio * 30)}/30
                </Text>
              </View>
              <View style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
                <View style={styles.scoreRowLeft}>
                  <View style={[styles.scoreRowDot, { backgroundColor: colors.warning }]} />
                  <Text style={[styles.scoreRowLabel, { color: colors.text }]}>Leak Detection</Text>
                </View>
                <Text style={[styles.scoreRowValue, { color: colors.warning }]}>
                  {totalLeakAmount < 1000 ? 20 : totalLeakAmount < 3000 ? 10 : 0}/20
                </Text>
              </View>
            </View>

            <Pressable onPress={() => { setShowScoreDetail(false); showComingSoon(); }} style={[styles.shareBtn, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="share-outline" size={18} color={colors.accent} />
              <Text style={[styles.shareBtnText, { color: colors.accent }]}>Share Score Card</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showQuickAdd} transparent animationType="fade">
        <Pressable
          style={styles.scoreOverlay}
          onPress={() => {
            if (!isQuickAdding) setShowQuickAdd(false);
          }}
        >
          <View style={[styles.scoreDetailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.scoreDetailHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.scoreDetailTitle, { color: colors.text }]}>Quick Add Reminder</Text>
              {!isQuickAdding && (
                <Pressable onPress={() => setShowQuickAdd(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
            <Text style={[styles.lifeInsightText, { color: colors.textSecondary, marginBottom: 12 }]}>
              Type something like "Pay electricity bill tomorrow at 8 pm".
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                  marginBottom: 16,
                },
              ]}
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder='e.g., "Pay electricity bill tomorrow at 8 pm"'
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
            />
            <Pressable
              disabled={!quickAddText.trim() || isQuickAdding}
              onPress={async () => {
                if (!quickAddText.trim()) return;
                setIsQuickAdding(true);
                await quickAddReminder(quickAddText.trim());
                setIsQuickAdding(false);
                setShowQuickAdd(false);
                setQuickAddText('');
              }}
              style={[
                styles.shareBtn,
                {
                  backgroundColor: !quickAddText.trim() || isQuickAdding ? colors.accentDim : colors.accent,
                  marginTop: 10,
                },
              ]}
            >
              {isQuickAdding ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={[styles.shareBtnText, { color: '#FFFFFF' }]}>Create Reminder</Text>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  syncOverlayCard: { padding: 32, borderRadius: 24, alignItems: 'center', minWidth: 260 },
  syncIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  syncTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, marginBottom: 8 },
  syncSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14 },
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
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
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 14 },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 12,
  },
  emptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextWrap: { flex: 1, gap: 2 },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  remindersScroll: { gap: 10, paddingBottom: 20 },
  reminderPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, gap: 10, minWidth: 200 },
  reminderPillIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reminderPillInfo: { flex: 1, gap: 2 },
  reminderPillName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  reminderPillDue: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  reminderPillAmount: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  insightsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  insightCard: { flex: 1, borderRadius: 18, padding: 14, gap: 6, borderWidth: 1 },
  insightIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  insightValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  insightSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  quickAccessScroll: { gap: 10, paddingBottom: 20 },
  quickCard: { borderRadius: 18, padding: 16, borderWidth: 1, width: 130, gap: 8 },
  quickCardIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickCardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  quickCardSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11 },
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
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20 },
  actionBtnWrap: { alignItems: 'center', gap: 8 },
  actionBtnCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  actionBtnLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  seniorHeroCard: { borderRadius: 24, padding: 28, borderWidth: 1, alignItems: 'center', marginBottom: 28, gap: 8 },
  seniorHeroLabel: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  seniorHeroAmount: { fontFamily: 'Inter_700Bold', fontSize: 42, letterSpacing: -1 },
  seniorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  seniorBtn: { width: '47%' as any, borderRadius: 24, padding: 28, borderWidth: 1, alignItems: 'center', gap: 14 },
  seniorBtnIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  seniorBtnLabel: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  scoreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  scoreDetailCard: { borderRadius: 24, padding: 24, borderWidth: 1, width: '100%', maxWidth: 360 },
  scoreDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, marginBottom: 4 },
  scoreDetailTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  scoreBreakdown: { gap: 4, marginBottom: 16 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  scoreRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreRowDot: { width: 10, height: 10, borderRadius: 5 },
  scoreRowLabel: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  scoreRowValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  shareBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
