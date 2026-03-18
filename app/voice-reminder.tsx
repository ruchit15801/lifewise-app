import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import { type Bill, type RepeatType, type ReminderType } from '@/lib/data';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Voice = require('react-native-voice');

type VoiceState = 'idle' | 'listening' | 'review' | 'confirming';

interface ParsedReminder {
  title: string;
  date?: Date;
  timeLabel?: string;
  repeatType: RepeatType;
  reminderType: ReminderType;
}

function parseVoiceReminder(input: string): ParsedReminder {
  const text = input.toLowerCase();
  let title = input.trim();

  const prefixMatch = text.match(/remind me to (.+)/i);
  if (prefixMatch && prefixMatch[1]) {
    title = prefixMatch[1].trim();
  }

  let repeatType: RepeatType = 'none';
  if (text.includes('every day') || text.includes('daily')) repeatType = 'daily';
  else if (text.includes('every week') || text.includes('weekly')) repeatType = 'weekly';
  else if (text.includes('every month') || text.includes('monthly')) repeatType = 'monthly';
  else if (text.includes('every year') || text.includes('yearly')) repeatType = 'yearly';

  const now = new Date();
  let date: Date | undefined;
  if (text.includes('today')) {
    date = new Date(now);
  } else if (text.includes('tomorrow')) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);
  }

  let timeLabel: string | undefined;
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)?/i);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = (timeMatch[3] || '').toLowerCase();
    let hour24 = h;
    if (ampm === 'pm' && h < 12) hour24 = h + 12;
    if (ampm === 'am' && h === 12) hour24 = 0;
    const d = date ? new Date(date) : new Date(now);
    d.setHours(hour24, m, 0, 0);
    date = d;
    const mm = m.toString().padStart(2, '0');
    const hour12 = ((hour24 + 11) % 12) + 1;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    timeLabel = `${hour12}:${mm} ${suffix}`;
  } else if (text.includes('evening')) {
    timeLabel = '7:00 PM';
  } else if (text.includes('morning')) {
    timeLabel = '9:00 AM';
  }

  let reminderType: ReminderType = 'custom';
  if (text.includes('bill') || text.includes('pay')) reminderType = 'bill';
  if (text.includes('subscription')) reminderType = 'subscription';

  return {
    title: title || 'Reminder',
    date,
    timeLabel,
    repeatType,
    reminderType,
  };
}

export default function VoiceReminderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { addReminder, reminderSettings } = useExpenses();
  const [state, setState] = useState<VoiceState>('idle');
  const [spokenText, setSpokenText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ringPulse = useSharedValue(1);
  const micScale = useSharedValue(1);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringPulse.value }],
    opacity: state === 'listening' ? 0.9 : 0.4,
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const parsed = useMemo(() => {
    if (!spokenText.trim()) return null;
    return parseVoiceReminder(spokenText.trim());
  }, [spokenText]);

  const headerTop = Platform.OS === 'web' ? 40 : insets.top + 8;

  useEffect(() => {
    if (!Voice || Platform.OS === 'web') return;

    Voice.onSpeechResults = (e: any) => {
      const value: string[] = e.value || [];
      if (value.length) {
        setSpokenText(value[0]);
        setError(null);
      }
    };
    Voice.onSpeechError = () => {
      setError('Could not hear clearly. Please try again.');
      setState('idle');
    };

    return () => {
      try {
        Voice.destroy();
      } catch {
        // ignore
      }
    };
  }, []);

  function handleStartListening() {
    setError(null);
    setState('listening');
    ringPulse.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true,
    );
    micScale.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      true,
    );

    if (Voice && Platform.OS !== 'web') {
      try {
        Voice.start('en-IN');
      } catch {
        setError('Microphone not available right now.');
        setState('idle');
      }
    }
  }

  function handleStopListening() {
    if (Voice && Platform.OS !== 'web') {
      try {
        Voice.stop();
      } catch {
        // ignore
      }
    }
    if (!spokenText.trim()) {
      setError('I could not hear anything. Please try again.');
    }
    setState('review');
  }

  async function handleConfirm() {
    if (!parsed) {
      setError('Could not understand this reminder. Please edit the text.');
      return;
    }
    setState('confirming');
    try {
      const now = new Date();
      const baseDate = parsed.date ?? now;
      const dueDateIso = baseDate.toISOString();

      const newBill: Omit<Bill, 'id'> = {
        name: parsed.title,
        amount: 0,
        dueDate: dueDateIso,
        category: parsed.reminderType === 'bill' ? 'bills' : 'others',
        isPaid: false,
        icon: parsed.reminderType === 'bill' ? 'receipt' : 'create',
        reminderType: parsed.reminderType,
        repeatType: parsed.repeatType,
        status: 'active',
        reminderDaysBefore: reminderSettings.defaultReminderDays ?? [1, 0],
      };
      addReminder(newBill);
      router.back();
    } catch {
      setError('Could not create this reminder. Please try again.');
      setState('review');
    }
  }

  const titleLine =
    state === 'listening'
      ? 'Listening...'
      : state === 'review'
        ? 'Here’s what I heard'
        : 'What should I remind you about?';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: headerTop, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.headerCancel, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Voice Reminder</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.centerBlock}>
          <Pressable
            onPress={state === 'listening' ? handleStopListening : handleStartListening}
            hitSlop={20}
          >
            <Animated.View
              style={[
                styles.micOuter,
                ringStyle,
                { backgroundColor: colors.accentDim, shadowColor: colors.accent },
              ]}
            >
              <Animated.View style={[styles.micInner, micStyle, { backgroundColor: colors.accent }]}>
                <Ionicons name="mic" size={32} color="#FFFFFF" />
              </Animated.View>
            </Animated.View>
          </Pressable>

          <Text style={[styles.promptTitle, { color: colors.text }]}>{titleLine}</Text>
          <Text style={[styles.promptSubtitle, { color: colors.textSecondary }]}>
            Speak naturally, like you’re talking to a person.
          </Text>

          <View style={[styles.textBox, { borderColor: colors.inputBorder, backgroundColor: colors.card }]}>
            <Text style={[styles.transcriptText, { color: spokenText ? colors.text : colors.textTertiary }]}>
              {spokenText || 'Your voice sentence will appear here.'}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              // Simple inline editor via prompt-like UX for now.
              // On native this will just focus text input in future iterations.
              const sample = 'Remind me to take medicine at 8 PM';
              setSpokenText(spokenText || sample);
              setState('review');
              setError(null);
            }}
            style={styles.editLinkWrap}
          >
            <Text style={[styles.editLink, { color: colors.accent }]}>
              Edit text
            </Text>
          </Pressable>

          {error && (
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          )}

          <View style={styles.examples}>
            <Text style={[styles.examplesLabel, { color: colors.textTertiary }]}>Examples</Text>
            <Text style={[styles.exampleLine, { color: colors.textSecondary }]}>
              "Remind me to take medicine at 8 PM"
            </Text>
            <Text style={[styles.exampleLine, { color: colors.textSecondary }]}>
              "Pay electricity bill tomorrow"
            </Text>
            <Text style={[styles.exampleLine, { color: colors.textSecondary }]}>
              "Call doctor on Friday morning"
            </Text>
          </View>
        </View>

        {parsed && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {parsed.title}
            </Text>
            <View style={styles.cardRow}>
              <Ionicons name="calendar" size={16} color={colors.textSecondary} />
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                {parsed.date ? parsed.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Date: Not set'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Ionicons name="time" size={16} color={colors.textSecondary} />
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                {parsed.timeLabel ? `Time: ${parsed.timeLabel}` : 'Time: Not set'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Ionicons name="repeat" size={16} color={colors.textSecondary} />
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                {parsed.repeatType === 'none' ? 'One-time' : parsed.repeatType.charAt(0).toUpperCase() + parsed.repeatType.slice(1)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomButtons}>
          <Pressable
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={state === 'listening' ? handleStopListening : handleStartListening}
          >
            <Ionicons
              name={state === 'listening' ? 'square' : 'mic'}
              size={18}
              color={colors.text}
            />
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              {state === 'listening' ? 'Stop Listening' : 'Tap to Speak'}
            </Text>
          </Pressable>
          <Pressable
            disabled={!parsed || state === 'confirming'}
            onPress={handleConfirm}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: !parsed || state === 'confirming' ? colors.accentDim : colors.accent,
              },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>
              {state === 'confirming' ? 'Saving...' : 'Confirm Reminder'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  centerBlock: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  micOuter: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  micInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTitle: {
    marginTop: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
  },
  promptSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  textBox: {
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  transcriptText: {
    minHeight: 60,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  editLinkWrap: {
    marginTop: 6,
  },
  editLink: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textAlign: 'center',
  },
  examples: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
  examplesLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginBottom: 4,
  },
  exampleLine: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    marginTop: 24,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginBottom: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  bottomButtons: {
    marginTop: 28,
    gap: 10,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});

