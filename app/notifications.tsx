import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuth();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    const run = async () => {
      try {
        const res = await apiRequest('GET', '/api/notifications', undefined, token);
        const json = (await res.json()) as NotificationItem[];
        setItems(json);
        const unreadIds = json.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length) {
          await apiRequest('POST', '/api/notifications/mark-read', { ids: unreadIds }, token);
        }
      } catch {
        // ignore, keep empty list
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.screenTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading notifications…</Text>
      ) : items.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No notifications yet.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.item,
                {
                  backgroundColor: colors.card,
                  borderColor: item.read ? colors.border : colors.accentDim,
                },
              ]}
            >
              <View
                style={[
                  styles.itemIcon,
                  { backgroundColor: item.read ? colors.accentDim : colors.accent },
                ]}
              >
                <Ionicons
                  name={item.type === 'reminder' ? 'notifications' : 'information-circle'}
                  size={18}
                  color={item.read ? colors.accent : '#FFFFFF'}
                />
              </View>
              <View style={styles.itemContent}>
                <Text
                  style={[
                    styles.itemTitle,
                    { color: colors.text },
                    !item.read && { fontFamily: 'Inter_700Bold' },
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.itemBody, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.body}
                </Text>
                <Text style={[styles.itemTime, { color: colors.textTertiary }]}>
                  {formatTimeAgo(item.createdAt)}
                </Text>
              </View>
            </View>
          )}
        />
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
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  emptyText: {
    paddingHorizontal: 20,
    marginTop: 40,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  itemBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  itemTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 4,
  },
});

