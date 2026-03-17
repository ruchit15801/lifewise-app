import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

type ChatItem = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
};

export default function LifeMindTab() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatItem[]>([]);

  const loadChats = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', '/api/assistant/chats', undefined, token);
      const json = await res.json();
      setChats(Array.isArray(json) ? json : []);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const openNewChat = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiRequest('POST', '/api/assistant/chats', { title: 'New chat' }, token);
      const json = await res.json();
      if (json?.id) {
        router.push({ pathname: '/assistant', params: { chatId: json.id } });
        return;
      }
    } catch {
      // fallback below
    }
    router.push('/assistant');
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats]),
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: colors.text }]}>WiseAI</Text>
        <Pressable onPress={openNewChat} style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.btnText}>Open Chat</Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>Your previous chats are synced from backend.</Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : chats.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No chats yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Tap Open Chat to start your first WiseAI conversation.</Text>
        </View>
      ) : (
        chats.map((chat) => (
          <Pressable
            key={chat.id}
            onPress={() => router.push({ pathname: '/assistant', params: { chatId: chat.id } })}
            style={[styles.chatItem, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.chatIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
            </View>
            <View style={styles.chatContent}>
              <Text style={[styles.chatTitle, { color: colors.text }]} numberOfLines={1}>{chat.title || 'New chat'}</Text>
              <Text style={[styles.chatPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                {chat.preview || 'Tap to continue conversation'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10, paddingBottom: 110 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 6 },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnText: { color: '#FFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  loadingWrap: { paddingVertical: 26, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  chatItem: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chatContent: { flex: 1, gap: 2 },
  chatTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  chatPreview: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});

