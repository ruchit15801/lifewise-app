import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in subject and message');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(
        'POST',
        '/api/support',
        { subject: subject.trim(), message: message.trim() },
        token,
      );
      setSuccess('We received your request. Our team will get back to you soon.');
      setSubject('');
      setMessage('');
    } catch (e) {
      setError('Failed to send. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.screenTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Tell us what went wrong or what you need help with.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Subject</Text>
        <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={subject}
            onChangeText={setSubject}
            placeholder="Short summary"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Message</Text>
        <View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, height: 140, alignItems: 'flex-start' }]}>
          <TextInput
            style={[styles.input, { color: colors.text, textAlignVertical: 'top' }]}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe the issue or question"
            placeholderTextColor={colors.textTertiary}
            multiline
          />
        </View>

        {!!error && <Text style={[styles.feedbackText, { color: colors.danger }]}>{error}</Text>}
        {!!success && <Text style={[styles.feedbackText, { color: colors.accent }]}>{success}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, { backgroundColor: colors.accent }]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>Submit Ticket</Text>
          )}
        </Pressable>
      </View>
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
  helperText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  feedbackText: {
    marginTop: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

