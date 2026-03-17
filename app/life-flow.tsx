import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  date: string;
  source: string;
};

type DailyPlanItem = {
  time: string;
  title: string;
  type: string;
  source: string;
};

type Prediction = {
  type: string;
  title: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
};

export default function LifeFlowScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [familyGraph, setFamilyGraph] = useState<
    Array<{ id: string; member_name: string; relation: string; modules: string[] }>
  >([]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [timelineRes, planRes, predRes, graphRes] = await Promise.all([
        apiRequest('GET', '/api/life-flow/timeline?range=30days', undefined, token),
        apiRequest('GET', '/api/life-flow/daily-plan', undefined, token),
        apiRequest('GET', '/api/life-flow/predictions', undefined, token),
        apiRequest('GET', '/api/family/graph', undefined, token),
      ]);
      const timelineJson = (await timelineRes.json()) as TimelineEvent[];
      const planJson = (await planRes.json()) as { plan: DailyPlanItem[] };
      const predJson = (await predRes.json()) as { predictions: Prediction[] };
      const graphJson = (await graphRes.json()) as Array<{ id: string; member_name: string; relation: string; modules: string[] }>;
      setTimeline(Array.isArray(timelineJson) ? timelineJson : []);
      setDailyPlan(Array.isArray(planJson.plan) ? planJson.plan : []);
      setPredictions(Array.isArray(predJson.predictions) ? predJson.predictions : []);
      setFamilyGraph(Array.isArray(graphJson) ? graphJson : []);
    } catch {
      setTimeline([]);
      setDailyPlan([]);
      setPredictions([]);
      setFamilyGraph([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>LifeFlow Engine</Text>
          <Pressable onPress={loadData}>
            <Ionicons name="refresh" size={22} color={colors.accent} />
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Today LifeFlow Plan</Text>
          {dailyPlan.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No plan generated yet.</Text>
          ) : (
            dailyPlan.slice(0, 6).map((item, idx) => (
              <Text key={`${item.title}-${idx}`} style={[styles.line, { color: colors.textSecondary }]}>
                {item.time} - {item.title}
              </Text>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Risk Predictions</Text>
          {predictions.map((p, idx) => (
            <View key={`${p.title}-${idx}`} style={styles.predictionRow}>
              <Ionicons
                name={p.severity === 'high' ? 'warning' : p.severity === 'medium' ? 'alert-circle' : 'information-circle'}
                size={16}
                color={p.severity === 'high' ? colors.danger : p.severity === 'medium' ? colors.warning : colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.predictionTitle, { color: colors.text }]}>{p.title}</Text>
                <Text style={[styles.predictionSub, { color: colors.textSecondary }]}>{p.suggestion}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>LifeFlow Timeline</Text>
          {timeline.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No life events found.</Text>
          ) : (
            timeline.slice(0, 15).map((ev) => (
              <Text key={ev.id} style={[styles.line, { color: colors.textSecondary }]}>
                {new Date(ev.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {ev.title}
              </Text>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Family Graph</Text>
          {familyGraph.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No family nodes yet.</Text>
          ) : (
            familyGraph.map((node) => (
              <Text key={node.id} style={[styles.line, { color: colors.textSecondary }]}>
                {node.member_name} ({node.relation}) - {node.modules.join(', ')}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  line: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  predictionRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  predictionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  predictionSub: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});
