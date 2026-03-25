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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register, loginWithGoogle } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordHints, setShowPasswordHints] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    if (!name.trim() || !trimmedEmail || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setError('Password must meet all the requirements');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const result = await register(name.trim(), email.trim(), password);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Registration failed');
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    const res = await loginWithGoogle();
    if (!res.success) {
      setError(res.error || 'Google sign-up failed');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 40, paddingBottom: bottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={styles.logoCircle}>
            <Image source={require('../../logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Start tracking your expenses smarter</Text>
        </View>

        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerDim }]}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="person-outline" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              testID="register-name"
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Email</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="mail-outline" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="register-email"
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Password</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Min 8 characters, strong"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              testID="register-password"
              onFocus={() => setShowPasswordHints(true)}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          {showPasswordHints && (
            <View style={styles.passwordHints}>
              <PasswordRule
                label="At least 8 characters"
                met={password.length >= 8}
                colors={colors}
              />
              <PasswordRule
                label="One uppercase letter (A-Z)"
                met={/[A-Z]/.test(password)}
                colors={colors}
              />
              <PasswordRule
                label="One lowercase letter (a-z)"
                met={/[a-z]/.test(password)}
                colors={colors}
              />
              <PasswordRule
                label="One number (0-9)"
                met={/[0-9]/.test(password)}
                colors={colors}
              />
              <PasswordRule
                label="One special character (!@#$...)"
                met={/[^A-Za-z0-9]/.test(password)}
                colors={colors}
              />
            </View>
          )}

          <Pressable
            onPress={handleRegister}
            disabled={isSubmitting}
            style={styles.submitBtnWrap}
            testID="register-submit"
          >
            <LinearGradient
              colors={[...colors.buttonGradient] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitBtn}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Create Account</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textTertiary }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <View style={styles.socialRow}>
          <Pressable
            onPress={handleGoogleSignup}
            style={[styles.googleBtn, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}
          >
            <Ionicons name="logo-google" size={24} color="#4285F4" />
            <Text style={[styles.googleBtnText, { color: colors.text }]}>Continue with Google</Text>
          </Pressable>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={[styles.footerLink, { color: colors.accent }]}>Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

function PasswordRule({
  label,
  met,
  colors,
}: {
  label: string;
  met: boolean;
  colors: { textSecondary: string; success?: string };
}) {
  const successColor = (colors as any).success || '#16a34a';
  const textColor = met ? successColor : colors.textSecondary;
  return (
    <View style={styles.passwordRuleRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={textColor}
      />
      <Text style={[styles.passwordRuleText, { color: textColor }]}>{label}</Text>
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
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flex: 1,
  },
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
    fontSize: 15,
    paddingVertical: 16,
  },
  submitBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 24,
  },
  submitBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  submitBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  passwordHints: {
    marginTop: 8,
    marginHorizontal: 4,
    gap: 4,
  },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  passwordRuleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  socialRow: {
    marginBottom: 32,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  googleBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  footerLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
