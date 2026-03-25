import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
};

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay} days ago`;
}

export default function NotificationDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ notificationId: string }>();
  const notificationId = params.notificationId;

  const [item, setItem] = useState<NotificationItem | null>(null);
  const [loading, setLoading] = useState(true);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    if (!token || !notificationId) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await apiRequest('GET', '/api/notifications', undefined, token);
        const json = (await res.json()) as NotificationItem[];
        const found = json.find((n) => n.id === notificationId) ?? null;
        if (mounted) setItem(found);

        if (found && !found.read) {
          await apiRequest('POST', '/api/notifications/mark-read', { ids: [notificationId] }, token);
        }
      } catch {
        if (mounted) setItem(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token, notificationId]);

  const iconName = useMemo(() => {
    if (!item) return 'information-circle';
    return item.type === 'reminder' ? 'notifications' : 'information-circle';
  }, [item]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Notification</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : item ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accentDim }]}>
            <Ionicons name={iconName as any} size={18} color={colors.accent} />
          </View>
          <View style={styles.content}>
            <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
            <Text style={[styles.itemTime, { color: colors.textTertiary }]}>
              {formatTimeAgo(item.createdAt)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Notification not found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: 6 },
  itemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  itemBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  itemTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 8,
  },
  emptyText: {
    paddingHorizontal: 20,
    marginTop: 40,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
});

