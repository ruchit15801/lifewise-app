import React from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import { requestSmsPermissionDetails } from '@/lib/sms-reader';

export default function SmsDetectionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token, completeOnboarding } = useAuth();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const saveAndContinue = async (enabled: boolean) => {
    try {
      let finalEnabled = enabled;
      let status = enabled ? 'granted' : 'skipped';
      if (enabled) {
        const permission = await requestSmsPermissionDetails();
        finalEnabled = permission.status === 'granted';
        status = permission.status;
      }
      await AsyncStorage.setItem('@lifewise_sms_detection_pref', finalEnabled ? 'true' : 'false');
      if (token) {
        await apiRequest('POST', '/api/user/sms-detection', { sms_detection_enabled: finalEnabled }, token);
      }
      await apiRequest('POST', '/api/onboarding/permission-log', {
        user_id: null,
        permission: 'sms',
        status,
      });
    } catch {
      // ignore
    } finally {
      completeOnboarding();
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset + 24 }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Secure Financial SMS Detection</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          LifeWise reads only transaction messages to detect bills and expenses automatically.
        </Text>
        <View style={styles.bullets}>
          {[
            'We never read OTP messages',
            'Your SMS data stays encrypted',
            'We never sell or share your data',
          ].map((item) => (
            <Text key={item} style={[styles.bulletText, { color: colors.textSecondary }]}>• {item}</Text>
          ))}
        </View>

        <Pressable onPress={() => saveAndContinue(true)} style={styles.primaryWrap}>
          <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Continue</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => saveAndContinue(false)} style={[styles.skipBtn, { borderColor: colors.border }]}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  desc: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  bullets: { gap: 8, marginTop: 4, marginBottom: 8 },
  bulletText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  primaryWrap: { borderRadius: 14, overflow: 'hidden' },
  primaryBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 14 },
  primaryText: { color: '#FFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
  skipBtn: { borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});

