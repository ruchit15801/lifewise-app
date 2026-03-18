import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
      const audioBlob = await (await fetch(uri)).blob();
      const form = new FormData();
      form.append('audio', audioBlob as any, 'voice.m4a');

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
      // Save to backend (best-effort). If offline, we still store locally.
      addReminder(newBill);

      // Local notification (best-effort)
      if (parsed.date) {
        await scheduleLocalNotification({
          title: 'Reminder',
          body: parsed.title,
          data: { type: 'reminder' },
          triggerAt: parsed.date,
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

  return (
    <LinearGradient
      colors={['#0B1220', '#22114D', '#0B1220']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={!canInteract}>
          <Text style={[styles.headerCancel, { color: 'rgba(255,255,255,0.75)' }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>Voice Reminder • Premium</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.centerStage}>
          <Pressable
            onPress={state === 'recording' ? handleStopRecording : handleStartRecording}
            hitSlop={20}
            disabled={!canInteract}
          >
            <Animated.View style={[styles.micOuter, ringStyle]}>
              <Animated.View style={[styles.micInner, micStyle]}>
                {state === 'transcribing' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name={state === 'recording' ? 'stop' : 'mic'} size={30} color="#FFFFFF" />
                )}
              </Animated.View>
            </Animated.View>
          </Pressable>

          <Text style={styles.stageTitle}>{titleLine}</Text>

          <View style={styles.transcriptWrap}>
            {isEditing ? (
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Type your reminder…"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
          {state === 'review' && parsed ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle} numberOfLines={1}>{parsed.title}</Text>
              <View style={styles.confirmMetaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="time" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.metaText}>{parsed.timeLabel || 'Time not set'}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="repeat" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.metaText}>
                    {parsed.repeatType === 'none' ? 'One-time' : parsed.repeatType}
                  </Text>
                </View>
              </View>
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
                <Ionicons name={isEditing ? 'checkmark' : 'pencil'} size={16} color="#FFFFFF" />
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
                <Text style={styles.ghostBtnText}>Reset</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            disabled={!parsed || !canInteract || state !== 'review'}
            onPress={handleConfirm}
            style={[styles.primaryBtn, (!parsed || !canInteract) && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={['#A855F7', '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryBtnGradient}
            >
              <Text style={styles.primaryBtnText}>
                {state === 'confirming' ? 'Saving…' : 'Confirm'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
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
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
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
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  micInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.95)',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  stageTitle: {
    marginTop: 18,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  transcriptHeroPlaceholder: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'Inter_600SemiBold',
  },
  transcriptInput: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
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
    color: '#FB7185',
  },
  langPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.78)',
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
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 12,
  },
  confirmTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  confirmMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  metaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    textTransform: 'capitalize' as const,
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
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  ghostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: 'hidden',
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
});

