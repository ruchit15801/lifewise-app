import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type LeakCategory = {
  category: string;
  title: string;
  icon: string;
  monthly_spend: number;
  transaction_count: number;
  trend_percent: number;
  yearly_projection: number;
  merchant_breakdown: { merchant: string; amount: number; count: number }[];
};

type LeakPayload = {
  summary: {
    title: string;
    monthly_leak: number;
    subtitle: string;
    leak_level: 'low' | 'moderate' | 'high';
    growth_percent: number;
  };
  categories: LeakCategory[];
  prediction: {
    total_potential_leak: number;
    projected_with_trend: number;
    monthly_growth_percent: number;
  };
  smart_suggestions: { id: string; title: string; description: string; annual_saving: number; category: string }[];
  weekly_trends: { week: string; amount: number }[];
  action_center: {
    limits: { category: string; label: string; current_spend: number; monthly_limit: number | null }[];
  };
  notifications: {
    daily_insight: string;
    limit_alerts: { category: string; spent: number; limit: number; message: string }[];
  };
};

function toSafePayload(input: any): LeakPayload | null {
  if (!input) return null;
  if (Array.isArray(input)) {
    const categories: LeakCategory[] = input.map((it: any, idx: number) => ({
      category: String(it.category || `category_${idx}`),
      title: String(it.title || it.merchant || 'Leak'),
      icon: String(it.icon || 'wallet'),
      monthly_spend: Number(it.monthly_spend || it.monthly_amount || it.monthlyEstimate || 0),
      transaction_count: Number(it.transaction_count || it.transactionCount || 0),
      trend_percent: Number(it.trend_percent || 0),
      yearly_projection: Number(it.yearly_projection || (Number(it.monthly_spend || it.monthly_amount || it.monthlyEstimate || 0) * 12)),
      merchant_breakdown: Array.isArray(it.merchant_breakdown)
        ? it.merchant_breakdown
        : [{ merchant: String(it.merchant || 'Unknown'), amount: Number(it.monthly_spend || it.monthly_amount || it.monthlyEstimate || 0), count: Number(it.transaction_count || it.transactionCount || 0) }],
    }));
    const total = categories.reduce((s, c) => s + c.monthly_spend, 0);
    return {
      summary: {
        title: 'Your Money Leak This Month',
        monthly_leak: total,
        subtitle: 'This is money that could have been saved.',
        leak_level: total < 3000 ? 'low' : total < 7000 ? 'moderate' : 'high',
        growth_percent: 0,
      },
      categories,
      prediction: {
        total_potential_leak: total * 12,
        projected_with_trend: total * 12,
        monthly_growth_percent: 0,
      },
      smart_suggestions: [],
      weekly_trends: [
        { week: 'Week 1', amount: Math.round(total * 0.2) },
        { week: 'Week 2', amount: Math.round(total * 0.3) },
        { week: 'Week 3', amount: Math.round(total * 0.25) },
        { week: 'Week 4', amount: Math.round(total * 0.25) },
      ],
      action_center: { limits: categories.map((c) => ({ category: c.category, label: c.title, current_spend: c.monthly_spend, monthly_limit: null })) },
      notifications: { daily_insight: 'Money leak insights generated from your spending pattern.', limit_alerts: [] },
    };
  }
  if (!input.summary || !Array.isArray(input.categories)) return null;
  return input as LeakPayload;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function prettyTrend(p: number) {
  const v = Math.round(p * 10) / 10;
  return `${v >= 0 ? '+' : ''}${v}%`;
}

function AnimatedPressable({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        s.value = withSpring(0.96, { damping: 14, stiffness: 220 });
      }}
      onPressOut={() => {
        s.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={style}
    >
      <Animated.View style={a}>{children}</Animated.View>
    </Pressable>
  );
}

function WeekTrendRow({
  week,
  amount,
  maxWeekly,
  colors,
  formatAmount,
  index,
}: {
  week: string;
  amount: number;
  maxWeekly: number;
  colors: any;
  formatAmount: (n: number) => string;
  index: number;
}) {
  const bar = useSharedValue(0);
  const pct = maxWeekly > 0 ? amount / maxWeekly : 0;

  useEffect(() => {
    bar.value = 0;
    bar.value = withDelay(index * 70, withTiming(pct, { duration: 520 }));
  }, [pct, index, bar]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.round(bar.value * 100)}%`,
  }));

  return (
    <View style={styles.trendRow}>
      <Text style={[styles.trendWeek, { color: colors.textSecondary }]}>{week}</Text>
      <View style={[styles.trendTrack, { backgroundColor: colors.surfaceGlow }]}>
        <Animated.View style={[styles.trendFill, { backgroundColor: colors.warning }, barStyle]} />
      </View>
      <Text style={[styles.trendAmount, { color: colors.text }]}>{formatAmount(amount)}</Text>
    </View>
  );
}

export default function MoneyLeaksScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { formatAmount } = useCurrency();
  const { token } = useAuth();
  const [data, setData] = useState<LeakPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [animatedLeakTotal, setAnimatedLeakTotal] = useState(0);
  const [limitInput, setLimitInput] = useState('');
  const [limitCategory, setLimitCategory] = useState('');
  const [isSavingLimit, setIsSavingLimit] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const yearlyAnimated = useSharedValue(0);
  const trendAnimated = useSharedValue(0);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await apiRequest('GET', '/api/money-leaks', undefined, token);
        const json = await res.json();
        const normalized = toSafePayload(json);
        setData(normalized);
        const categories = Array.isArray(normalized?.categories) ? normalized.categories : [];
        if (categories.length > 0 && !expandedCategory) setExpandedCategory(categories[0].category);
        const limits = Array.isArray(normalized?.action_center?.limits) ? normalized.action_center.limits : [];
        if (limits.length > 0 && !limitCategory) setLimitCategory(limits[0].category);
      } catch {
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [token]);

  useEffect(() => {
    const target = Number(data?.summary?.monthly_leak || 0);
    if (!target) {
      setAnimatedLeakTotal(0);
      return;
    }
    let current = 0;
    const steps = 24;
    const diff = target / steps;
    const timer = setInterval(() => {
      current += diff;
      if (current >= target) {
        setAnimatedLeakTotal(target);
        clearInterval(timer);
      } else {
        setAnimatedLeakTotal(Math.round(current));
      }
    }, 26);
    return () => clearInterval(timer);
  }, [data?.summary?.monthly_leak]);

  useEffect(() => {
    const totalYear = Number(data?.prediction?.total_potential_leak || 0);
    const monthlyGrowth = Number(data?.prediction?.monthly_growth_percent || 0);
    yearlyAnimated.value = 0;
    trendAnimated.value = 0;
    if (totalYear > 0) {
      yearlyAnimated.value = withTiming(totalYear, { duration: 650 });
    }
    if (isFinite(monthlyGrowth)) {
      trendAnimated.value = withTiming(monthlyGrowth, { duration: 650 });
    }
  }, [data?.prediction?.total_potential_leak, data?.prediction?.monthly_growth_percent]);

  const maxWeekly = useMemo(() => {
    if (!data?.weekly_trends?.length) return 0;
    return Math.max(...data.weekly_trends.map((x) => x.amount));
  }, [data?.weekly_trends]);

  const leakLevelColor = useMemo(() => {
    const level = data?.summary?.leak_level;
    if (level === 'high') return colors.danger;
    if (level === 'moderate') return colors.warning;
    return colors.accentMint;
  }, [data?.summary?.leak_level, colors]);

  const leakMeterWidth = useMemo(() => {
    const amount = Number(data?.summary?.monthly_leak || 0);
    return `${Math.min(100, Math.max(8, amount / 100))}%`;
  }, [data?.summary?.monthly_leak]);

  const leakMeterPct = useMemo(() => {
    const amount = Number(data?.summary?.monthly_leak || 0);
    const pct = clamp(amount / 10000, 0, 1);
    return pct;
  }, [data?.summary?.monthly_leak]);

  const saveLimit = async () => {
    if (!token || !limitCategory || !Number(limitInput)) return;
    setIsSavingLimit(true);
    try {
      await apiRequest('POST', '/api/money-leaks/limit', { category: limitCategory, monthly_limit: Number(limitInput) }, token);
      await apiRequest('POST', '/api/money-leaks/analytics', { action: 'set_limit', category: limitCategory }, token);
      const res = await apiRequest('GET', '/api/money-leaks', undefined, token);
      const json = await res.json();
      setData(json || null);
      setLimitInput('');
      Alert.alert('Saved', 'Monthly limit updated successfully.');
    } catch {
      Alert.alert('Error', 'Unable to save limit right now.');
    } finally {
      setIsSavingLimit(false);
    }
  };

  const trackAction = async (action: string, category?: string) => {
    if (!token) return;
    try {
      await apiRequest('POST', '/api/money-leaks/analytics', { action, category: category || '' }, token);
    } catch {
      // no-op
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: topInset + 10 }]}>
        <Animated.View entering={FadeInDown.duration(450)}>
          <LinearGradient
            colors={
              data
                ? data.summary.leak_level === 'high'
                  ? ['#7F1D1D', '#B91C1C', '#F97316']
                  : data.summary.leak_level === 'moderate'
                  ? ['#7C2D12', '#C2410C', '#FACC15']
                  : ['#064E3B', '#047857', '#22C55E']
                : (colors.heroGradient as [string, string, ...string[]])
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View>
                <Text style={[styles.heroKicker, { color: 'rgba(255,255,255,0.75)' }]}>Money Leak</Text>
                <Text style={[styles.heroTitle, { color: '#FFFFFF' }]}>This Month</Text>
              </View>
              <View style={styles.heroIconWrap}>
                <Ionicons name="water" size={24} color="#F97316" />
              </View>
            </View>
            {isLoading ? (
              <ActivityIndicator color="#FFF" style={{ marginTop: 12 }} />
            ) : data ? (
              <>
                <Text style={[styles.heroAmount, { color: '#FFFFFF' }]}>{formatAmount(animatedLeakTotal)}</Text>
                <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.82)' }]}>
                  {data.summary.subtitle}
                </Text>
                <View style={styles.heroMeterRow}>
                  <View style={[styles.progressTrack, { backgroundColor: 'rgba(15,23,42,0.3)' }]}>
                    <View style={[styles.progressFill, { width: leakMeterWidth as any, backgroundColor: '#FFFFFF' }]} />
                  </View>
                  <Text style={[styles.leakLevelText, { color: '#FFE4E6' }]}>
                    {data.summary.leak_level.toUpperCase()} LEAK
                  </Text>
                </View>
                <View style={styles.heroChipsRow}>
                  <View style={[styles.heroChip, { backgroundColor: 'rgba(15,23,42,0.25)' }]}>
                    <Text style={styles.heroChipKicker}>Leak meter</Text>
                    <Text style={styles.heroChipValue}>{Math.round(leakMeterPct * 100)}%</Text>
                  </View>
                  <View style={[styles.heroChip, { backgroundColor: 'rgba(15,23,42,0.25)' }]}>
                    <Text style={styles.heroChipKicker}>Trend</Text>
                    <Text style={styles.heroChipValue}>{prettyTrend(data.summary.growth_percent || 0)}</Text>
                  </View>
                  <View style={[styles.heroChip, { backgroundColor: 'rgba(15,23,42,0.25)' }]}>
                    <Text style={styles.heroChipKicker}>Year</Text>
                    <Text style={styles.heroChipValue}>{formatAmount(data.prediction.total_potential_leak)}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.82)' }]}>
                We’ll highlight your silent leaks once you have enough transactions.
              </Text>
            )}
          </LinearGradient>
        </Animated.View>

        {!data ? (
          <Animated.View entering={FadeInDown.delay(60).duration(350)}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>No leak data available yet.</Text>
            </View>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(60).duration(450)}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.warningDim }]}>
                  <Ionicons name="grid" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Leak Categories</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Tap a card to reveal breakdown</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {data.categories.map((cat, idx) => {
                  const active = expandedCategory === cat.category;
                  const trendColor = cat.trend_percent >= 0 ? colors.warning : colors.accentMint;
                  return (
                    <AnimatedPressable
                      key={cat.category}
                      onPress={() => {
                        setExpandedCategory(cat.category);
                        trackAction('expanded_category', cat.category);
                      }}
                      style={{ marginRight: idx === data.categories.length - 1 ? 0 : 10 }}
                    >
                      <LinearGradient
                        colors={
                          active
                            ? ([colors.accent + '22', colors.card] as any)
                            : ([colors.cardElevated || colors.card, colors.card] as any)
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.categoryCardLux,
                          { borderColor: active ? colors.accent : colors.border, shadowColor: colors.shadow || '#000' },
                        ]}
                      >
                        <View style={styles.catTopRow}>
                          <View style={[styles.catIcon, { backgroundColor: colors.accentDim }]}>
                            <Ionicons name={cat.icon as any} size={16} color={colors.accent} />
                          </View>
                          <View style={[styles.trendPill, { backgroundColor: trendColor + '1A', borderColor: trendColor + '33' }]}>
                            <Text style={[styles.trendPillText, { color: trendColor }]}>{prettyTrend(cat.trend_percent)}</Text>
                          </View>
                        </View>
                        <Text style={[styles.catTitle, { color: colors.text }]} numberOfLines={1}>
                          {cat.title}
                        </Text>
                        <Text style={[styles.catAmount, { color: colors.text }]}>{formatAmount(cat.monthly_spend)}</Text>
                        <Text style={[styles.catMeta, { color: colors.textSecondary }]}>
                          {cat.transaction_count} spends • {formatAmount(cat.yearly_projection)}/yr
                        </Text>
                        {active ? (
                          <View style={[styles.activeGlow, { backgroundColor: colors.accent + '10' }]} />
                        ) : null}
                      </LinearGradient>
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>

              {expandedCategory && (
                <Animated.View
                  layout={Layout.springify()}
                  entering={FadeIn.duration(220)}
                  exiting={FadeOut.duration(180)}
                  style={[styles.detailCardLux, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow || '#000' }]}
                >
                  {(() => {
                    const selected = data.categories.find((x) => x.category === expandedCategory);
                    if (!selected) return null;
                    return (
                      <>
                        <View style={styles.detailHeader}>
                          <Text style={[styles.detailTitle, { color: colors.text }]}>{selected.title} Breakdown</Text>
                          <View style={[styles.detailBadge, { backgroundColor: colors.surfaceGlow }]}>
                            <Text style={[styles.detailBadgeText, { color: colors.accent }]}>{selected.transaction_count}x</Text>
                          </View>
                        </View>
                        {selected.merchant_breakdown.slice(0, 6).map((m) => (
                          <View key={m.merchant} style={[styles.merchantRow, { borderBottomColor: colors.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.merchantName, { color: colors.text }]} numberOfLines={1}>
                                {m.merchant}
                              </Text>
                              <Text style={[styles.merchantMeta, { color: colors.textTertiary }]}>{m.count} times</Text>
                            </View>
                            <Text style={[styles.merchantAmt, { color: colors.text }]}>{formatAmount(m.amount)}</Text>
                          </View>
                        ))}
                        <Text style={[styles.detailHint, { color: colors.textSecondary }]}>
                          “Small repeats” become “big leaks”. Track this weekly.
                        </Text>
                      </>
                    );
                  })()}
                </Animated.View>
              )}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(110).duration(450)}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.dangerDim }]}>
                  <Ionicons name="flash" size={16} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Prediction Engine</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>If habits continue…</Text>
                </View>
              </View>

              <LinearGradient
                colors={['#0B1220', '#111827', '#0B1220']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.predHero}
              >
                <Text style={styles.predKicker}>TOTAL POTENTIAL LEAK</Text>
                <Animated.Text
                  style={styles.predBig}
                >
                  {formatAmount(Math.round((yearlyAnimated.value as unknown as number) || data.prediction.total_potential_leak))}
                </Animated.Text>
                <Text style={styles.predKickerSmall}>per year</Text>
                <View style={styles.predRow}>
                  <View style={styles.predStat}>
                    <Text style={styles.predStatLabel}>Monthly leak</Text>
                    <Text style={styles.predStatValue}>{formatAmount(data.summary.monthly_leak)}</Text>
                  </View>
                  <View style={styles.predDivider} />
                  <View style={styles.predStat}>
                    <Text style={styles.predStatLabel}>Trend</Text>
                    <Text style={styles.predStatValue}>
                      {data.prediction.monthly_growth_percent >= 0 ? '+' : ''}
                      {Math.round((trendAnimated.value as unknown as number) * 10) / 10}%
                    </Text>
                  </View>
                </View>
                <Text style={styles.predSub}>
                  If your trend continues, you may spend {formatAmount(data.prediction.projected_with_trend)} next year.
                </Text>
              </LinearGradient>

              <View style={[styles.cardLux, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow || '#000' }]}>
                {data.categories.slice(0, 3).map((cat) => (
                  <View key={cat.category} style={[styles.predItem, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.predItemTitle, { color: colors.text }]} numberOfLines={1}>
                        {cat.title}
                      </Text>
                      <Text style={[styles.predItemMeta, { color: colors.textSecondary }]}>
                        {formatAmount(cat.monthly_spend)} / month
                      </Text>
                    </View>
                    <Text style={[styles.predItemAmt, { color: colors.danger }]}>{formatAmount(cat.yearly_projection)}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(400)}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="sparkles" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Smart Suggestions</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Quick wins with big savings</Text>
                </View>
              </View>
              {data.smart_suggestions.map((s) => (
                <Animated.View key={s.id} layout={Layout.springify()} style={[styles.suggestionCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow || '#000' }]}>
                  <View style={styles.suggestionTop}>
                    <View style={[styles.suggestionIcon, { backgroundColor: colors.accentDim }]}>
                      <Ionicons name="sparkles" size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestionTitle, { color: colors.text }]}>{s.title}</Text>
                      <Text style={[styles.suggestionSub, { color: colors.textSecondary }]}>{s.description}</Text>
                    </View>
                  </View>
                  <View style={styles.suggestionBottom}>
                    <View style={[styles.saveBadge, { backgroundColor: colors.accentMintDim }]}>
                      <Text style={[styles.saveBadgeText, { color: colors.accentMint }]}>
                        Save {formatAmount(s.annual_saving)}/yr
                      </Text>
                    </View>
                    <AnimatedPressable
                      onPress={() => trackAction('accepted_suggestion', s.category)}
                    >
                      <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.suggestionBtn}>
                        <Text style={styles.suggestionBtnText}>Apply</Text>
                      </LinearGradient>
                    </AnimatedPressable>
                  </View>
                </Animated.View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.accentBlueDim }]}>
                  <Ionicons name="stats-chart" size={16} color={colors.accentBlue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Weekly Trends</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>See if spending is accelerating</Text>
                </View>
              </View>
              <View style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow || '#000' }]}>
                {data.weekly_trends.map((wk, idx) => (
                  <WeekTrendRow
                    key={wk.week}
                    week={wk.week}
                    amount={wk.amount}
                    maxWeekly={maxWeekly}
                    colors={colors}
                    formatAmount={formatAmount}
                    index={idx}
                  />
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.accentMintDim }]}>
                  <Ionicons name="options" size={16} color={colors.accentMint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Action Center</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Turn insight into control</Text>
                </View>
              </View>

              <View style={[styles.actionCardLux, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow || '#000' }]}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>Set Monthly Limit</Text>
                <Text style={[styles.actionHint, { color: colors.textSecondary }]}>Pick a category and lock a cap.</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
                  {data.action_center.limits.slice(0, 6).map((l) => {
                    const active = limitCategory === l.category;
                    return (
                      <AnimatedPressable key={l.category} onPress={() => setLimitCategory(l.category)}>
                        <View style={[styles.segment, { backgroundColor: active ? colors.accentDim : colors.cardElevated, borderColor: active ? colors.accent : colors.border }]}>
                          <Text style={[styles.segmentText, { color: active ? colors.accent : colors.textSecondary }]}>{l.label}</Text>
                          <Text style={[styles.segmentMeta, { color: colors.textTertiary }]}>{formatAmount(l.current_spend)}</Text>
                        </View>
                      </AnimatedPressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.limitRow}>
                  <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                    <Ionicons name="cash-outline" size={16} color={colors.textTertiary} />
                    <TextInput
                      value={limitInput}
                      onChangeText={setLimitInput}
                      keyboardType="numeric"
                      placeholder="Monthly limit"
                      placeholderTextColor={colors.textTertiary}
                      style={[styles.inputLux, { color: colors.text }]}
                    />
                  </View>
                  <AnimatedPressable onPress={saveLimit}>
                    <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={[styles.saveLuxBtn, isSavingLimit && { opacity: 0.75 }]}>
                      <Text style={styles.saveLuxText}>{isSavingLimit ? 'Saving…' : 'Save'}</Text>
                    </LinearGradient>
                  </AnimatedPressable>
                </View>

                <View style={styles.actionGrid}>
                  {[
                    { key: 'track_category', label: 'Track Category', icon: 'eye' as const },
                    { key: 'set_alert', label: 'Set Spending Alert', icon: 'notifications' as const },
                    { key: 'disable_subscription', label: 'Disable Subscription', icon: 'close-circle' as const },
                    { key: 'set_monthly_limit', label: 'Set Monthly Limit', icon: 'speedometer' as const },
                  ].map((a) => (
                    <AnimatedPressable key={a.key} onPress={() => trackAction(a.key, limitCategory)}>
                      <View style={[styles.actionTile, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
                        <View style={[styles.actionTileIcon, { backgroundColor: colors.surfaceGlow }]}>
                          <Ionicons name={a.icon} size={16} color={colors.accent} />
                        </View>
                        <Text style={[styles.actionTileText, { color: colors.text }]}>{a.label}</Text>
                      </View>
                    </AnimatedPressable>
                  ))}
                </View>

                <View style={[styles.insightStrip, { backgroundColor: colors.surfaceGlow, borderColor: colors.border }]}>
                  <Ionicons name="sparkles" size={16} color={colors.warning} />
                  <Text style={[styles.insightStripText, { color: colors.textSecondary }]}>{data.notifications.daily_insight}</Text>
                </View>

                {data.notifications.limit_alerts.slice(0, 2).map((x) => (
                  <View key={`${x.category}-${x.limit}`} style={[styles.alertStrip, { backgroundColor: colors.warningDim, borderColor: colors.warning }]}>
                    <Ionicons name="alert-circle" size={16} color={colors.warning} />
                    <Text style={[styles.alertStripText, { color: colors.warning }]}>{x.message}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20, gap: 18, paddingBottom: 140 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginBottom: 4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 2 },
  sectionLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  hero: {
    borderRadius: 28,
    padding: 20,
    paddingBottom: 22,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#020617',
    shadowOpacity: 0.46,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 22 },
    elevation: 10,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroKicker: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 2 },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.30)',
  },
  heroAmount: { fontFamily: 'Inter_700Bold', fontSize: 38, marginTop: 14, letterSpacing: -0.7 },
  heroSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6, lineHeight: 19 },
  heroMeterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  heroChipsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.16)',
    backgroundColor: 'rgba(15,23,42,0.32)',
  },
  heroChipKicker: { color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  heroChipValue: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 4 },
  summaryCard: {
    borderWidth: 1.2,
    borderRadius: 22,
    padding: 18,
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.94)',
  },
  bigAmount: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -0.6 },
  progressTrack: { flex: 1, height: 9, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  leakLevelText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hRow: { paddingBottom: 2 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardLux: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
    backgroundColor: 'rgba(15,23,42,0.96)',
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  categoryCardLux: {
    width: 200,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
    backgroundColor: 'rgba(15,23,42,0.94)',
  },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trendPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  trendPillText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  catTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  catAmount: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 8, letterSpacing: -0.2 },
  catMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  activeGlow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  detailCardLux: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 7,
    backgroundColor: 'rgba(15,23,42,0.97)',
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detailTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  detailBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  detailBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  merchantName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  merchantMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  merchantAmt: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  detailHint: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10, lineHeight: 18 },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  subStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  delta: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  predictionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 2, borderBottomWidth: 1 },
  predAmount: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  shockTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 2 },
  actionBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  actionBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekTrack: { flex: 1, height: 8, borderRadius: 5, overflow: 'hidden' },
  weekFill: { height: '100%', borderRadius: 5 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 13 },
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  alertText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  predHero: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  predKicker: { color: 'rgba(255,255,255,0.62)', fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const },
  predBig: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -0.6, marginTop: 6 },
  predKickerSmall: { color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  predRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  predDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.10)' },
  predStat: { flex: 1 },
  predStatLabel: { color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_500Medium', fontSize: 11 },
  predStatValue: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 4 },
  predSub: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 12, lineHeight: 18 },
  predItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  predItemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  predItemMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  predItemAmt: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  suggestionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 7,
    backgroundColor: 'rgba(15,23,42,0.97)',
  },
  suggestionTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  suggestionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  suggestionSub: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4, lineHeight: 17 },
  suggestionBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  saveBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  saveBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  suggestionBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  suggestionBtnText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  trendCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  trendWeek: { width: 56, fontFamily: 'Inter_500Medium', fontSize: 12 },
  trendTrack: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  trendFill: { height: '100%', borderRadius: 999 },
  trendAmount: { width: 90, textAlign: 'right' as const, fontFamily: 'Inter_700Bold', fontSize: 12 },
  actionCardLux: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.97)',
  },
  actionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  actionHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  segmentRow: { gap: 10, paddingVertical: 6 },
  segment: {
    width: 158,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  segmentText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  segmentMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLux: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, paddingVertical: 0 },
  saveLuxBtn: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 12 },
  saveLuxText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  actionTile: {
    width: '48%' as any,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  actionTileIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTileText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  insightStrip: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  insightStripText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  alertStrip: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  alertStripText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
});

