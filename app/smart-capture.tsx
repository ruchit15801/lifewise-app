import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES = ['Reminder', 'Expense', 'Bill', 'Task', 'Document'] as const;

export default function SmartCaptureScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Reminder');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState<{ id: string; title: string; type: string; date: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [statusText, setStatusText] = useState('Capture reminders, bills and tasks quickly.');
  const [errorText, setErrorText] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await apiRequest('GET', '/api/capture/history', undefined, token);
      const json = await res.json();
      setHistory(Array.isArray(json) ? json : []);
    } catch (err) {
      setHistory([]);
      const message = err instanceof Error ? err.message : 'Failed to load history';
      setErrorText(message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const canSave = useMemo(() => Boolean(title.trim()) && !isSaving, [title, isSaving]);

  const submit = async () => {
    if (!token || !title.trim()) return;
    setErrorText('');
    setIsSaving(true);
    try {
      await apiRequest(
        'POST',
        '/api/events/create',
        {
          title: title.trim(),
          category,
          amount: amount ? Number(amount) : 0,
          date,
          notes,
        },
        token,
      );
      setTitle('');
      setAmount('');
      setNotes('');
      setStatusText('Captured successfully.');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create item';
      setErrorText(message);
    } finally {
      setIsSaving(false);
    }
  };

  const topPadding = Platform.OS === 'web' ? 16 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topPadding }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Quick Entry</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.heroIconWrap, { backgroundColor: colors.warningDim }]}>
          <Ionicons name="sparkles" size={24} color={colors.warning} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Quickly create life events</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{statusText}</Text>
      </View>

      {!!errorText && (
        <View style={[styles.errorCard, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      )}

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Create Item</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
          placeholder="Title"
          placeholderTextColor={colors.textTertiary}
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[
                styles.cat,
                {
                  backgroundColor: category === c ? colors.accentDim : colors.inputBg,
                  borderColor: category === c ? colors.accent : colors.inputBorder,
                },
              ]}
            >
              <Text style={[styles.catText, { color: category === c ? colors.accent : colors.textSecondary }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
          placeholder="Amount (optional)"
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
          placeholder="Date YYYY-MM-DD"
          placeholderTextColor={colors.textTertiary}
          value={date}
          onChangeText={setDate}
        />
        <TextInput
          style={[styles.input, styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
          placeholder="Notes"
          placeholderTextColor={colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Pressable
          onPress={submit}
          disabled={!canSave}
          style={[styles.saveBtn, { backgroundColor: colors.accent, opacity: canSave ? 1 : 0.6 }]}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Create</Text>}
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>History</Text>
      <FlatList
        data={history}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={
          isLoadingHistory ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No capture history yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.historyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.historySub, { color: colors.textSecondary }]}>
              {item.type}  •  {new Date(item.date).toLocaleString('en-IN')}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 14, alignItems: 'center', gap: 8 },
  heroIconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular' },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  catText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  saveBtn: { borderRadius: 10, alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  saveBtnText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  historyRow: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  historyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  historySub: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 10 },
  errorCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
});

