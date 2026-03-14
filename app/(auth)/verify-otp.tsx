import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { verifyOtp, resendOtp, user } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone || user?.phone || '';
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const handleVerify = async () => {
    if (!otp.trim() || otp.length !== 6) {
      setError('Enter the 6-digit code sent to your phone');
      return;
    }
    if (!phone) {
      setError('Phone number missing');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const result = await verifyOtp(phone, otp.trim());
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      setError(result.error || 'Invalid code');
    }
  };

  const handleResend = async () => {
    if (!phone) return;
    setResending(true);
    setError('');
    const result = await resendOtp(phone);
    setResending(false);
    if (result.success) {
      setOtp('');
    } else {
      setError(result.error || 'Failed to resend');
    }
  };

  if (!phone) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorText, { color: colors.danger }]}>Phone number missing. Please sign up again.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.accent }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 40, paddingBottom: bottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={[styles.logoCircle, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="phone-portrait" size={32} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Verify your phone</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a 6-digit code to {phone}. Enter it below.
          </Text>
        </View>

        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerDim }]}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Verification code</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="keypad-outline" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={otp}
              onChangeText={(t) => { setOtp(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="000000"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          <Pressable
            onPress={handleVerify}
            disabled={isSubmitting || otp.length !== 6}
            style={styles.submitBtnWrap}
          >
            <LinearGradient
              colors={[...colors.buttonGradient] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.submitBtn, (isSubmitting || otp.length !== 6) && styles.submitBtnDisabled]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Verify & continue</Text>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={handleResend} disabled={resending} style={styles.resendWrap}>
            <Text style={[styles.resendText, { color: colors.accent }]}>
              {resending ? 'Sending…' : "Didn't get the code? Resend"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24 },
  headerSection: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, marginBottom: 8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1 },
  formSection: { marginBottom: 28 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    paddingVertical: 16,
    letterSpacing: 4,
  },
  submitBtnWrap: { borderRadius: 14, overflow: 'hidden', marginTop: 24 },
  submitBtn: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFFFFF' },
  resendWrap: { alignItems: 'center', marginTop: 20 },
  resendText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
