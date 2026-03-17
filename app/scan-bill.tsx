import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRawRequest, apiRequest } from '@/lib/query-client';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScanBillScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const launchedOnceRef = useRef(false);
  const [history, setHistory] = useState<{ id: string; name: string; amount: number; dueDate: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusText, setStatusText] = useState('Tap to scan a bill');
  const [errorText, setErrorText] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await apiRequest('GET', '/api/bills/scanned-history', undefined, token);
      const json = await res.json();
      setHistory(Array.isArray(json) ? json : []);
    } catch (err) {
      setHistory([]);
      const message = err instanceof Error ? err.message : 'Failed to load scanned bills';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const scan = useCallback(async () => {
    if (!token) return;
    setErrorText('');
    setIsScanning(true);
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (p.status !== 'granted') {
      setErrorText('Camera permission is required to scan bills.');
      setIsScanning(false);
      return;
    }
    try {
      setStatusText('Opening camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) {
        setStatusText('Scan cancelled.');
        return;
      }
      setStatusText('Uploading and reading bill...');
      const uri = result.assets[0].uri;
      const fileRes = await fetch(uri);
      const imageBlob = await fileRes.blob();
      const form = new FormData();
      form.append('image', imageBlob, 'bill.jpg');

      const uploadRes = await apiRawRequest('/api/bills/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(text || 'Failed to scan bill');
      }
      setStatusText('Bill scanned and reminder created.');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bill scan failed';
      setErrorText(message);
      setStatusText('Try scanning again.');
    } finally {
      setIsScanning(false);
    }
  }, [load, token]);

  useFocusEffect(
    useCallback(() => {
      if (!launchedOnceRef.current) {
        launchedOnceRef.current = true;
        void scan();
      }
    }, [scan]),
  );

  const topPadding = Platform.OS === 'web' ? 16 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topPadding }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Scan Bill</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.camIconWrap, { backgroundColor: colors.accentBlueDim || colors.accentDim }]}>
          <Ionicons name="camera" size={28} color={colors.accentBlue || colors.accent} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Point camera at bill</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{statusText}</Text>
        <Pressable
          onPress={scan}
          disabled={isScanning}
          style={[styles.scanBtn, { backgroundColor: colors.accentBlue || colors.accent, opacity: isScanning ? 0.7 : 1 }]}
        >
          {isScanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanBtnText}>Open Camera</Text>}
        </Pressable>
      </View>

      {!!errorText && (
        <View style={[styles.errorCard, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Scanned Bills</Text>
      <FlatList
        data={history}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No scanned bills yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.historyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.historySub, { color: colors.textSecondary }]}>
              ₹{Math.round(item.amount)}  •  Due {new Date(item.dueDate).toLocaleDateString('en-IN')}
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
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 16, alignItems: 'center', gap: 10 },
  camIconWrap: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  scanBtn: { width: '100%', borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 4 },
  scanBtnText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
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
  historyRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  historyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  historySub: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 10 },
});

