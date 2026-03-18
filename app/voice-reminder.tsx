import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, TextInput, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import { type Bill, type RepeatType, type ReminderType } from '@/lib/data';
import { Audio } from 'expo-av';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { scheduleLocalNotification } from '@/lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

type VoiceState = 'idle' | 'recording' | 'review' | 'transcribing' | 'confirming';

interface ParsedReminder {
  title: string;
  date?: Date;
  timeLabel?: string;
  repeatType: RepeatType;
  reminderType: ReminderType;
}

function timeLabelFromDate(d: Date) {
  const hour24 = d.getHours();
  const minute = d.getMinutes();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const mm = String(minute).padStart(2, '0');
  return `${hour12}:${mm} ${suffix}`;
}

const TIME_OPTIONS: { id: string; label: string; hour?: number; minute?: number }[] = [
  { id: '6am', label: '6:00 AM', hour: 6, minute: 0 },
  { id: '9am', label: '9:00 AM', hour: 9, minute: 0 },
  { id: '12pm', label: '12:00 PM', hour: 12, minute: 0 },
  { id: '3pm', label: '3:00 PM', hour: 15, minute: 0 },
  { id: '6pm', label: '6:00 PM', hour: 18, minute: 0 },
  { id: '9pm', label: '9:00 PM', hour: 21, minute: 0 },
  { id: 'custom', label: 'Custom…' },
];

const REPEAT_OPTIONS: { id: RepeatType; label: string }[] = [
  { id: 'none', label: 'One-time' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

function parsedFromServer(p: {
  title: string;
  isoDate: string;
  hour: number;
  minute: number;
  repeatType: RepeatType;
  reminderType: ReminderType;
}): ParsedReminder {
  const dt = new Date(`${p.isoDate}T00:00:00.000Z`);
  if (!Number.isNaN(dt.getTime())) {
    dt.setHours(p.hour ?? 9, p.minute ?? 0, 0, 0);
  }
  return {
    title: String(p.title || 'Reminder'),
    date: Number.isNaN(dt.getTime()) ? undefined : dt,
    timeLabel: Number.isNaN(dt.getTime()) ? undefined : timeLabelFromDate(dt),
    repeatType: p.repeatType || 'none',
    reminderType: p.reminderType || 'custom',
  };
}

export default function VoiceReminderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { token } = useAuth();
  const { addReminder, reminderSettings } = useExpenses();
  const [state, setState] = useState<VoiceState>('idle');
  const [spokenText, setSpokenText] = useState('');
  const [draftText, setDraftText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [serverParsed, setServerParsed] = useState<ParsedReminder | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [tempRepeat, setTempRepeat] = useState<RepeatType>('none');

  const ringPulse = useSharedValue(1);
  const micScale = useSharedValue(1);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringPulse.value }],
    opacity: state === 'recording' ? 0.9 : 0.35,
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const parsed = useMemo(() => {
    if (serverParsed) return serverParsed;
    return null;
  }, [serverParsed]);

  const headerTop = Platform.OS === 'web' ? 40 : insets.top + 8;

  useEffect(() => {
    return () => {
      // Cleanup recording if screen unmounts mid-record
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartRecording() {
    setError(null);
    setDetectedLanguage(null);
    setServerParsed(null);
    setIsEditing(false);
    setDraftText('');
    setSpokenText('');
    setState('recording');
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

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission is required.');
        setState('idle');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      // Enable metering so the pulse feels "live" while recording.
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...(Audio.RecordingOptionsPresets.HIGH_QUALITY.android as any),
          isMeteringEnabled: true,
        },
        ios: {
          ...(Audio.RecordingOptionsPresets.HIGH_QUALITY.ios as any),
          isMeteringEnabled: true,
        },
      } as any);
      await rec.startAsync();
      setRecording(rec);
    } catch {
      setError('Microphone not available right now.');
      setState('idle');
    }
  }

  async function handleStopRecording() {
    const rec = recording;
    setRecording(null);
    if (!rec) {
      setState('idle');
      return;
    }

    setState('transcribing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        setError('Could not read recorded audio. Please try again.');
        setState('idle');
        return;
      }

      if (!token) {
        setError('Please login to use voice reminders.');
        setState('idle');
        return;
      }

      const baseUrl = getApiUrl();
      const url = new URL('/api/reminders/voice/parse', baseUrl).toString();
      const form = new FormData();
      // RN/Expo multipart uploads are most reliable with { uri, name, type }
      // (Blob uploads often fail on Android with "Network request failed")
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.message || 'Voice processing failed. Please try again.';
        setError(msg);
        setState('idle');
        return;
      }

      const json = (await res.json()) as {
        text?: string;
        language?: string | null;
        parsed?: {
          title: string;
          isoDate: string;
          hour: number;
          minute: number;
          repeatType: RepeatType;
          reminderType: ReminderType;
        };
      };

      const text = (json.text || '').trim();
      if (!text) {
        setError("Sorry, I couldn't understand. Please try again.");
        setState('idle');
        return;
      }
      setSpokenText(text);
      setDraftText(text);
      setIsEditing(false);
      setDetectedLanguage(json.language || null);

      if (json.parsed?.isoDate) {
        setServerParsed(parsedFromServer(json.parsed));
      } else {
        setServerParsed(null);
      }

      setError(null);
      setState('review');
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/network request failed/i.test(msg)) {
        setError(
          'Backend not reachable. Start backend and set EXPO_PUBLIC_DOMAIN to your PC IP (e.g. 192.168.1.9:5001).',
        );
      } else {
        setError('Microphone or network error. Please try again.');
      }
      setState('idle');
    }
  }

  async function reparseDraftWithBackend(nextText: string) {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/reminders/parse', baseUrl).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: nextText }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        title: string;
        isoDate: string;
        hour: number;
        minute: number;
        repeatType: RepeatType;
        reminderType: ReminderType;
      };
      if (json?.isoDate) setServerParsed(parsedFromServer(json));
    } catch {
      // ignore, keep previous parse
    }
  }

  async function handleConfirm() {
    const effective =
      parsed ??
      (spokenText.trim()
        ? {
            title: spokenText.trim(),
            date: new Date(),
            timeLabel: timeLabelFromDate(new Date()),
            repeatType: 'none' as RepeatType,
            reminderType: 'custom' as ReminderType,
          }
        : null);

    if (!effective) {
      setError('Could not understand this reminder. Please edit the text.');
      return;
    }
    setState('confirming');
    try {
      const now = new Date();
      const baseDate = effective.date ?? now;
      const dueDateIso = baseDate.toISOString();

      const newBill: Omit<Bill, 'id'> = {
        name: effective.title,
        amount: 0,
        dueDate: dueDateIso,
        category: effective.reminderType === 'bill' ? 'bills' : 'others',
        isPaid: false,
        icon: effective.reminderType === 'bill' ? 'receipt' : 'create',
        reminderType: effective.reminderType,
        repeatType: effective.repeatType,
        status: 'active',
        reminderDaysBefore: reminderSettings.defaultReminderDays ?? [1, 0],
      };
      // Save to backend (best-effort). If offline, we still store locally.
      addReminder(newBill);

      // Local notification (best-effort)
      if (effective.date) {
        await scheduleLocalNotification({
          title: 'Reminder',
          body: effective.title,
          data: { type: 'reminder' },
          triggerAt: effective.date,
        }).catch(() => {});
      }

      // Offline fallback: persist the draft so it can be recreated later if network fails.
      // (We can't reliably detect offline here; this is a lightweight safety net.)
      await AsyncStorage.setItem(
        '@lifewise_last_voice_reminder_draft',
        JSON.stringify({ at: Date.now(), bill: newBill }),
      ).catch(() => {});
      setIsOfflineSaved(true);

      router.back();
    } catch {
      setError('Could not create this reminder. Please try again.');
      setState('review');
    }
  }

  const titleLine =
    state === 'recording'
      ? 'Recording...'
      : state === 'transcribing'
        ? 'Processing...'
      : state === 'review'
        ? 'Here’s what I heard'
        : 'What should I remind you about?';

  const showTranscript = state === 'review' && !!(isEditing ? draftText.trim() : spokenText.trim());
  const heroText = (isEditing ? draftText : spokenText).trim();
  const canInteract = state !== 'transcribing' && state !== 'confirming';
  const hasTranscript = !!spokenText.trim();

  const effectiveParsed = parsed ?? (spokenText.trim()
    ? {
        title: spokenText.trim(),
        date: new Date(),
        timeLabel: timeLabelFromDate(new Date()),
        repeatType: 'none' as RepeatType,
        reminderType: 'custom' as ReminderType,
      }
    : null);

  return (
    <LinearGradient
      colors={["#F5F3FF", "#E0F2FE", "#FDF2F8"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={!canInteract}>
          <Text style={[styles.headerCancel]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle]}>Voice Reminder</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.centerStage}>
          <Pressable
            onPress={state === 'recording' ? handleStopRecording : handleStartRecording}
            hitSlop={20}
            disabled={!canInteract}
          >
            <Animated.View style={[styles.micOuterShadow, ringStyle]}>
              <LinearGradient
                colors={["#A855F7", "#60A5FA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.micOuterGradient}
              >
                <Animated.View style={[styles.micInner, micStyle]}>
                  {state === 'transcribing' ? (
                    <ActivityIndicator color="#4F46E5" />
                  ) : (
                    <Ionicons
                      name={state === 'recording' ? 'stop' : 'mic'}
                      size={30}
                      color="#4F46E5"
                    />
                  )}
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <Text style={styles.stageTitle}>{titleLine}</Text>

          <View style={styles.transcriptWrap}>
            {isEditing ? (
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Type your reminder…"
                placeholderTextColor="rgba(15,23,42,0.35)"
                style={styles.transcriptInput}
                multiline
                autoFocus
              />
            ) : (
              <Text
                style={[styles.transcriptHero, !showTranscript && styles.transcriptHeroPlaceholder]}
                numberOfLines={5}
              >
                {state === 'recording'
                  ? 'Listening…'
                  : state === 'transcribing'
                    ? 'Transcribing…'
                    : showTranscript
                      ? heroText
                      : 'Tap the mic and speak.'}
              </Text>
            )}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {state === 'review' && detectedLanguage && (
            <Text style={styles.langPill}>Detected: {detectedLanguage.toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.bottomSheet}>
          {state === 'review' && effectiveParsed ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle} numberOfLines={1}>{effectiveParsed.title}</Text>
              {!isEditing && (
                <View style={styles.schedulePanel}>
                  <Pressable
                    style={styles.scheduleRow}
                    onPress={() => {
                      if (!canInteract) return;
                      setTempTime(effectiveParsed.date ?? new Date());
                      setShowTimePicker(true);
                    }}
                  >
                    <View style={styles.scheduleLeft}>
                      <Ionicons name="time" size={16} color="#4F46E5" />
                      <Text style={styles.scheduleLabel}>Time</Text>
                    </View>
                    <View style={styles.scheduleRight}>
                      <Text style={styles.scheduleValue}>
                        {effectiveParsed.timeLabel || 'Select time'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </View>
                  </Pressable>

                  <View style={styles.scheduleDivider} />

                  <Pressable
                    style={styles.scheduleRow}
                    onPress={() => {
                      if (!canInteract) return;
                      setTempRepeat(effectiveParsed.repeatType);
                      setShowRepeatPicker(true);
                    }}
                  >
                    <View style={styles.scheduleLeft}>
                      <Ionicons name="repeat" size={16} color="#4F46E5" />
                      <Text style={styles.scheduleLabel}>Repeat</Text>
                    </View>
                    <View style={styles.scheduleRight}>
                      <Text style={styles.scheduleValue}>
                        {effectiveParsed.repeatType === 'none'
                          ? 'One-time'
                          : effectiveParsed.repeatType.charAt(0).toUpperCase() +
                            effectiveParsed.repeatType.slice(1)}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </View>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}

          {state === 'review' && hasTranscript && (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={async () => {
                  if (!canInteract) return;
                  if (!isEditing) {
                    setDraftText(spokenText);
                    setIsEditing(true);
                    return;
                  }
                  setSpokenText(draftText);
                  setIsEditing(false);
                  await reparseDraftWithBackend(draftText);
                }}
                style={[styles.secondaryBtn, !showTranscript && { opacity: 0.45 }]}
                disabled={!showTranscript || !canInteract}
              >
                <Ionicons name={isEditing ? 'checkmark' : 'pencil'} size={16} color="#4F46E5" />
                <Text style={styles.secondaryBtnText}>{isEditing ? 'Done' : 'Edit'}</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!canInteract) return;
                  setSpokenText('');
                  setDraftText('');
                  setIsEditing(false);
                  setDetectedLanguage(null);
                  setServerParsed(null);
                  setError(null);
                  setState('idle');
                }}
                style={styles.ghostBtn}
                disabled={!canInteract}
              >
                <Ionicons name="refresh" size={16} color="#E11D48" />
                <Text style={styles.ghostBtnText}>Reset</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            disabled={!effectiveParsed || !canInteract || state !== 'review'}
            onPress={handleConfirm}
            style={[styles.primaryBtn, (!effectiveParsed || !canInteract) && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={["#A855F7", "#60A5FA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryBtnGradient}
            >
              <Text style={styles.primaryBtnText}>
                {state === 'confirming' ? 'Saving…' : 'Save reminder'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* Time picker dropdown */}
      <Modal transparent visible={showTimePicker} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select time</Text>
            <View style={styles.timePickerWrap}>
              <DateTimePicker
                value={tempTime ?? new Date()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selected) => {
                  if (selected) setTempTime(selected);
                }}
              />
            </View>
            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowTimePicker(false)} style={styles.modalTextButton}>
                <Text style={styles.modalTextButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!tempTime) {
                    setShowTimePicker(false);
                    return;
                  }
                  setServerParsed((prev) => {
                    const base = prev?.date ?? new Date();
                    const next = new Date(base);
                    next.setHours(tempTime.getHours(), tempTime.getMinutes(), 0, 0);
                    const baseParsed = prev ?? {
                      title: spokenText.trim() || 'Reminder',
                      repeatType: 'none' as RepeatType,
                      reminderType: 'custom' as ReminderType,
                    };
                    return {
                      ...baseParsed,
                      date: next,
                      timeLabel: timeLabelFromDate(next),
                    };
                  });
                  setShowTimePicker(false);
                }}
                style={[styles.modalPrimaryButton]}
              >
                <Text style={styles.modalPrimaryButtonLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Repeat picker dropdown */}
      <Modal transparent visible={showRepeatPicker} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Repeat</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {REPEAT_OPTIONS.map((opt) => {
                const isActive = tempRepeat === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setTempRepeat(opt.id)}
                    style={[styles.repeatRow, isActive && styles.repeatRowActive]}
                  >
                    <Text style={[styles.repeatLabel, isActive && styles.repeatLabelActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowRepeatPicker(false)} style={styles.modalTextButton}>
                <Text style={styles.modalTextButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setServerParsed((prev) => {
                    const baseParsed = prev ?? {
                      title: spokenText.trim() || 'Reminder',
                      date: new Date(),
                      timeLabel: timeLabelFromDate(new Date()),
                      reminderType: 'custom' as ReminderType,
                    };
                    return {
                      ...baseParsed,
                      repeatType: tempRepeat,
                    };
                  });
                  setShowRepeatPicker(false);
                }}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryButtonLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
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
  },
  headerCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#111827',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  micOuter: {
    width: 140,
    height: 140,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  micOuterShadow: {
    width: 140,
    height: 140,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  micOuterGradient: {
    width: 140,
    height: 140,
    borderRadius: 999,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // No shadows/elevation in this modern light UI
  },
  stageTitle: {
    marginTop: 18,
    marginBottom: 0,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#111827',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  stageSubtitle: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
  },
  transcriptWrap: {
    marginTop: 22,
    width: '100%',
    paddingHorizontal: 8,
  },
  transcriptHero: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  transcriptHeroPlaceholder: {
    color: '#9CA3AF',
    fontFamily: 'Inter_600SemiBold',
  },
  transcriptInput: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textAlign: 'center',
    color: '#DC2626',
  },
  langPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    color: '#4F46E5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    overflow: 'hidden',
  },
  bottomSheet: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  confirmCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  confirmTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#111827',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  confirmMetaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  schedulePanel: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: '#F2F7FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingVertical: 6,
  },
  scheduleRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#4F46E5',
  },
  scheduleValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#111827',
  },
  scheduleDivider: {
    height: 1,
    backgroundColor: '#DBEAFE',
    marginHorizontal: 12,
  },
  dropdownRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownAccent: {
    width: 6,
    backgroundColor: '#A855F7',
    alignSelf: 'stretch',
  },
  dropdownBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dropdownLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#6B7280',
  },
  dropdownValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValueText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#111827',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#111827',
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  ghostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#111827',
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  primaryBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  primaryBtnText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  modalTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  timePickerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  modalActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTextButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalTextButtonLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  modalPrimaryButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#4F46E5',
  },
  modalPrimaryButtonLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  repeatRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  repeatRowActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  repeatLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#111827',
  },
  repeatLabelActive: {
    fontFamily: 'Inter_600SemiBold',
    color: '#4F46E5',
  },
});

