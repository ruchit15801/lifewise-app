import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRawRequest, apiRequest } from '@/lib/query-client';

type ScreenMode = 'idle' | 'recording' | 'paused' | 'processing';

export default function VoiceReminderScreen() {
  const { colors, isDark } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [mode, setMode] = useState<ScreenMode>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [statusText, setStatusText] = useState('Tap Record Note and speak naturally.');
  const [errorText, setErrorText] = useState('');
  const [savedPopup, setSavedPopup] = useState<{ title: string; date: string; transcript: string } | null>(null);

  const orbPulse = useRef(new Animated.Value(1)).current;
  const orbGlow = useRef(new Animated.Value(0.35)).current;
  const w1 = useRef(new Animated.Value(0.2)).current;
  const w2 = useRef(new Animated.Value(0.7)).current;
  const w3 = useRef(new Animated.Value(0.35)).current;
  const w4 = useRef(new Animated.Value(0.85)).current;
  const w5 = useRef(new Animated.Value(0.3)).current;
  const w6 = useRef(new Animated.Value(0.65)).current;

  const isRecordingLike = mode === 'recording' || mode === 'paused';
  const timerText = useMemo(() => {
    const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const ss = (elapsedSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [elapsedSec]);

  React.useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1.05, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbGlow, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(orbGlow, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    glowLoop.start();
    return () => {
      pulseLoop.stop();
      glowLoop.stop();
    };
  }, [orbGlow, orbPulse]);

  React.useEffect(() => {
    if (mode !== 'recording') return;
    const tick = setInterval(() => setElapsedSec((v) => v + 1), 1000);
    return () => clearInterval(tick);
  }, [mode]);

  React.useEffect(() => {
    if (mode !== 'recording') return;
    const animateBar = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(val, { toValue: 0.2, duration: 280, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      );
    const loops = [
      animateBar(w1, 0),
      animateBar(w2, 80),
      animateBar(w3, 140),
      animateBar(w4, 200),
      animateBar(w5, 260),
      animateBar(w6, 320),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [mode, w1, w2, w3, w4, w5, w6]);

  const saveVoiceText = async (text: string) => {
    if (!token) return;
    const res = await apiRequest('POST', '/api/reminders/voice-create', { text }, token);
    const json = (await res.json()) as { title?: string; date?: string };
    setSavedPopup({
      title: json?.title || text.slice(0, 68),
      date: json?.date || new Date().toISOString(),
      transcript: text,
    });
  };

  const startRecording = async () => {
    try {
      setSavedPopup(null);
      setErrorText('');
      setStatusText('Checking microphone permission...');
      const p = await Audio.requestPermissionsAsync();
      if (!p.granted) {
        setErrorText('Microphone permission is required.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(created.recording);
      setElapsedSec(0);
      setMode('recording');
      setStatusText('Recording... language stays same as spoken.');
    } catch (err) {
      setMode('idle');
      setErrorText(err instanceof Error ? err.message : 'Unable to start recording');
      setStatusText('Could not start recording.');
    }
  };

  const togglePause = async () => {
    if (!recording) return;
    try {
      if (mode === 'recording') {
        await recording.pauseAsync();
        setMode('paused');
        setStatusText('Paused. Tap again to resume.');
      } else if (mode === 'paused') {
        await recording.startAsync();
        setMode('recording');
        setStatusText('Recording resumed...');
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Pause/Resume failed');
    }
  };

  const stopAndProcess = async () => {
    if (!recording || !token) return;
    setMode('processing');
    setStatusText('Transcribing...');
    setErrorText('');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error('Recording file missing.');

      const fileRes = await fetch(uri);
      const audioBlob = await fileRes.blob();
      const form = new FormData();
      form.append('audio', audioBlob, 'voice.m4a');

      const transcribeRes = await apiRawRequest('/api/voice-reminder/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!transcribeRes.ok) {
        const txt = await transcribeRes.text();
        throw new Error(txt || 'Transcription failed');
      }
      const transcribed = (await transcribeRes.json()) as { text?: string };
      const text = String(transcribed.text || '').trim();
      if (!text) throw new Error('Could not detect speech.');

      await saveVoiceText(text);
      setMode('idle');
      setElapsedSec(0);
      setStatusText('Reminder saved.');
    } catch (err) {
      setMode('idle');
      setStatusText('Try again.');
      setErrorText(err instanceof Error ? err.message : 'Voice processing failed');
    }
  };

  const resetState = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      }
    } catch {
      // ignore
    }
    setRecording(null);
    setMode('idle');
    setElapsedSec(0);
    setSavedPopup(null);
    setStatusText('Tap Record Note and speak naturally.');
    setErrorText('');
  };

  const topPadding = Platform.OS === 'web' ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === 'web' ? 18 : Math.max(insets.bottom, 12);
  const bg = isDark ? '#0A0D14' : '#F5F7FB';
  const cardBg = isDark ? '#121826' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: topPadding }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Voice Reminder</Text>
        <Pressable hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.centerBlock}>
        <View style={[styles.centerCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
          <Animated.View style={[styles.glowHalo, { opacity: orbGlow, backgroundColor: colors.accent + '2A' }]} />
          <Animated.View
            style={[
              styles.iconOrb,
              {
                backgroundColor: isRecordingLike ? colors.dangerDim : colors.accentDim,
                transform: [{ scale: orbPulse }],
              },
            ]}
          >
            <Ionicons name={isRecordingLike ? 'radio' : 'mic'} size={36} color={isRecordingLike ? colors.danger : colors.accent} />
          </Animated.View>
          <Text style={[styles.statusTitle, { color: colors.text }]}>
            {mode === 'recording' ? 'Recording...' : mode === 'paused' ? 'Paused' : mode === 'processing' ? 'Processing...' : 'Ready'}
          </Text>
          <Text style={[styles.statusSub, { color: colors.textSecondary }]}>{statusText}</Text>

          <View style={styles.waveRow}>
            {[w1, w2, w3, w4, w5, w6].map((wave, idx) => (
              <Animated.View
                key={idx}
                style={[
                  styles.waveBar,
                  {
                    backgroundColor: mode === 'recording' ? colors.danger : colors.accentBlue || colors.accent,
                    opacity: mode === 'recording' ? 1 : 0.45,
                    height: wave.interpolate({ inputRange: [0, 1], outputRange: [6, 34] }),
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.timer, { color: colors.text }]}>{timerText}</Text>
        </View>

        {!!savedPopup && (
          <View style={[styles.popupCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
            <View style={styles.popupHeader}>
              <Text style={[styles.popupTitle, { color: colors.text }]}>Your transcribed Voice Note</Text>
              <Pressable onPress={() => setSavedPopup(null)}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.popupMainText, { color: colors.text }]} numberOfLines={2}>{savedPopup.title}</Text>
            <Text style={[styles.popupMeta, { color: colors.textSecondary }]}>{new Date(savedPopup.date).toLocaleDateString('en-IN')}</Text>
            <Text style={[styles.popupBody, { color: colors.textSecondary }]} numberOfLines={2}>{savedPopup.transcript}</Text>
            <Pressable onPress={() => router.push('/(tabs)/bills')} style={[styles.popupBtn, { borderColor: colors.accent }]}>
              <Text style={[styles.popupBtnText, { color: colors.accent }]}>View in Reminders</Text>
            </Pressable>
          </View>
        )}
      </View>

      {!!errorText && (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      )}

      <View style={[styles.bottomDock, { paddingBottom: bottomPadding }]}>
        <View style={styles.bottomMeta}>
          <Text style={styles.bottomTimer}>{timerText}</Text>
          <Text style={styles.bottomState}>
            {mode === 'recording' ? 'Recording...' : mode === 'paused' ? 'Paused' : mode === 'processing' ? 'Processing...' : 'Ready'}
          </Text>
        </View>

        {isRecordingLike && (
          <View style={styles.bottomWaveRow}>
            {[w1, w2, w3, w4, w5, w6].map((wave, idx) => (
              <Animated.View
                key={`dock-${idx}`}
                style={[
                  styles.bottomWaveBar,
                  {
                    height: wave.interpolate({ inputRange: [0, 1], outputRange: [7, 20] }),
                  },
                ]}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomActions}>
          <Pressable onPress={resetState} style={[styles.dockBtnGhost, styles.dockBtnSmall]}>
            <Ionicons name="trash-outline" size={18} color="#E2E8F0" />
          </Pressable>

          <Pressable
            onPress={isRecordingLike ? togglePause : undefined}
            disabled={!isRecordingLike}
            style={[styles.dockBtnGhost, styles.dockBtnMiddle, { opacity: isRecordingLike ? 1 : 0.4 }]}
          >
            <Text style={styles.dockBtnGhostText}>{mode === 'paused' ? 'Resume' : 'Pause'}</Text>
          </Pressable>

          <Pressable
            onPress={isRecordingLike ? stopAndProcess : startRecording}
            disabled={mode === 'processing'}
            style={[styles.dockBtnPrimary, { opacity: mode === 'processing' ? 0.6 : 1 }]}
          >
            {mode === 'processing' ? <ActivityIndicator color="#fff" /> : <Text style={styles.dockBtnPrimaryText}>{mode === 'idle' ? 'Record Note' : 'Done'}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  centerBlock: { flex: 1, justifyContent: 'center', paddingTop: 10, paddingBottom: 6, gap: 10 },
  centerCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 340,
    gap: 10,
    overflow: 'hidden',
  },
  glowHalo: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
  iconOrb: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statusSub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 38, marginTop: 8 },
  waveBar: { width: 7, borderRadius: 3.5 },
  timer: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: 1.2, marginTop: 2 },
  popupCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  popupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  popupMainText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  popupMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  popupBody: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  popupBtn: { marginTop: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' },
  popupBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  bottomDock: {
    backgroundColor: '#0B0E15',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
    marginHorizontal: -16,
  },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomTimer: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: 0.8 },
  bottomState: { color: '#CBD5E1', fontFamily: 'Inter_500Medium', fontSize: 12 },
  bottomWaveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 8, marginBottom: 10 },
  bottomWaveBar: { width: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  bottomActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dockBtnSmall: { width: 42 },
  dockBtnMiddle: { flex: 1 },
  dockBtnGhost: {
    backgroundColor: '#202B3C',
    borderRadius: 20,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dockBtnGhostText: { color: '#E2E8F0', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  dockBtnPrimary: {
    backgroundColor: '#0B1220',
    borderRadius: 20,
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dockBtnPrimaryText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 13 },
});
/*
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRawRequest, apiRequest } from '@/lib/query-client';

type ScreenMode = 'idle' | 'recording' | 'paused' | 'processing';

export default function VoiceReminderScreen() {
  const { colors, isDark } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [mode, setMode] = useState<ScreenMode>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [statusText, setStatusText] = useState('Tap Record Note and speak naturally.');
  const [errorText, setErrorText] = useState('');
  const [savedPopup, setSavedPopup] = useState<{ title: string; date: string; transcript: string } | null>(null);

  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const wave1 = useRef(new Animated.Value(0.2)).current;
  const wave2 = useRef(new Animated.Value(0.65)).current;
  const wave3 = useRef(new Animated.Value(0.35)).current;
  const wave4 = useRef(new Animated.Value(0.8)).current;
  const wave5 = useRef(new Animated.Value(0.25)).current;
  const wave6 = useRef(new Animated.Value(0.7)).current;

  const isRecordingLike = mode === 'recording' || mode === 'paused';

  const timerText = useMemo(() => {
    const min = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const sec = (elapsedSec % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }, [elapsedSec]);

  React.useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ]),
    );
    pulseAnim.start();
    glowAnim.start();
    return () => {
      pulseAnim.stop();
      glowAnim.stop();
    };
  }, [glow, pulse]);

  React.useEffect(() => {
    const animateBar = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(val, { toValue: 0.2, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      );
    const a1 = animateBar(wave1, 0);
    const a2 = animateBar(wave2, 80);
    const a3 = animateBar(wave3, 160);
    const a4 = animateBar(wave4, 240);
    const a5 = animateBar(wave5, 320);
    const a6 = animateBar(wave6, 400);
    if (mode === 'recording') {
      a1.start();
      a2.start();
      a3.start();
      a4.start();
      a5.start();
      a6.start();
      return () => {
        a1.stop();
        a2.stop();
        a3.stop();
        a4.stop();
        a5.stop();
        a6.stop();
      };
    }
  }, [mode, wave1, wave2, wave3, wave4, wave5, wave6]);

  React.useEffect(() => {
    if (mode !== 'recording') return;
    const timer = setInterval(() => setElapsedSec((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [mode]);

  const saveVoiceText = async (text: string) => {
    if (!token) return;
    const res = await apiRequest('POST', '/api/reminders/voice-create', { text }, token);
    const created = (await res.json()) as { title?: string; date?: string };
    setSavedPopup({
      title: created?.title || text.slice(0, 68),
      date: created?.date || new Date().toISOString(),
      transcript: text,
    });
  };

  const startRecording = async () => {
    try {
      setSavedPopup(null);
      setErrorText('');
      setStatusText('Requesting microphone permission...');
      const p = await Audio.requestPermissionsAsync();
      if (!p.granted) {
        setErrorText('Microphone permission is required.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(created.recording);
      setElapsedSec(0);
      setMode('recording');
      setStatusText('Recording... speak in any language. It stays in same language.');
    } catch (err) {
      setMode('idle');
      setStatusText('Could not start recording.');
      setErrorText(err instanceof Error ? err.message : 'Unable to start recording');
    }
  };

  const togglePause = async () => {
    if (!recording) return;
    try {
      if (mode === 'recording') {
        await recording.pauseAsync();
        setMode('paused');
        setStatusText('Paused. Tap again to resume.');
      } else if (mode === 'paused') {
        await recording.startAsync();
        setMode('recording');
        setStatusText('Recording resumed...');
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Pause/Resume failed');
    }
  };

  const stopAndProcess = async () => {
    if (!recording || !token) return;
    setMode('processing');
    setErrorText('');
    setStatusText('Transcribing...');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error('Recording file missing.');

      const fileRes = await fetch(uri);
      const audioBlob = await fileRes.blob();
      const form = new FormData();
      form.append('audio', audioBlob, 'voice.m4a');

      const transcribeRes = await apiRawRequest('/api/voice-reminder/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!transcribeRes.ok) {
        const txt = await transcribeRes.text();
        throw new Error(txt || 'Transcription failed');
      }
      const transcribed = (await transcribeRes.json()) as { text?: string };
      const text = String(transcribed.text || '').trim();
      if (!text) throw new Error('Could not detect speech.');

      await saveVoiceText(text);
      setStatusText('Reminder saved.');
      setMode('idle');
      setElapsedSec(0);
    } catch (err) {
      setMode('idle');
      setStatusText('Try again.');
      setErrorText(err instanceof Error ? err.message : 'Voice processing failed');
    }
  };

  const resetRecordingState = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      }
    } catch {
      // no-op
    }
    setRecording(null);
    setMode('idle');
    setElapsedSec(0);
    setSavedPopup(null);
    setStatusText('Tap Record Note and speak naturally.');
    setErrorText('');
  };

  const topPadding = Platform.OS === 'web' ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === 'web' ? 18 : Math.max(insets.bottom, 12);
  const pageBg = isDark ? '#0A0D14' : '#F5F7FB';
  const cardBg = isDark ? '#121826' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: pageBg, paddingTop: topPadding }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Voice Reminder</Text>
        <Pressable hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.centerBlock}>
        <View style={[styles.centerCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
          <Animated.View style={[styles.glowHalo, { opacity: glow, backgroundColor: colors.accent + '2B' }]} />
          <Animated.View
            style={[
              styles.iconOrb,
              {
                backgroundColor: isRecordingLike ? colors.dangerDim : colors.accentDim,
                transform: [{ scale: pulse }],
              },
            ]}
          >
            <Ionicons name={isRecordingLike ? 'radio' : 'mic'} size={36} color={isRecordingLike ? colors.danger : colors.accent} />
          </Animated.View>

          <Text style={[styles.statusTitle, { color: colors.text }]}>
            {mode === 'recording' ? 'Recording...' : mode === 'paused' ? 'Paused' : mode === 'processing' ? 'Processing...' : 'Ready'}
          </Text>
          <Text style={[styles.statusSub, { color: colors.textSecondary }]}>{statusText}</Text>

          <View style={styles.waveRow}>
            {[wave1, wave2, wave3, wave4, wave5, wave6].map((wave, idx) => (
              <Animated.View
                key={idx}
                style={[
                  styles.waveBar,
                  {
                    backgroundColor: mode === 'recording' ? colors.danger : colors.accentBlue || colors.accent,
                    opacity: mode === 'recording' ? 1 : 0.45,
                    height: wave.interpolate({ inputRange: [0, 1], outputRange: [6, 34] }),
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.timer, { color: colors.text }]}>{timerText}</Text>
        </View>

        {!!savedPopup && (
          <View style={[styles.popupCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
            <View style={styles.popupHeader}>
              <Text style={[styles.popupTitle, { color: colors.text }]}>Your transcribed Voice Note</Text>
              <Pressable onPress={() => setSavedPopup(null)}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.popupMainText, { color: colors.text }]} numberOfLines={2}>{savedPopup.title}</Text>
            <Text style={[styles.popupMeta, { color: colors.textSecondary }]}>{new Date(savedPopup.date).toLocaleDateString('en-IN')}</Text>
            <Text style={[styles.popupBody, { color: colors.textSecondary }]} numberOfLines={2}>
              {savedPopup.transcript}
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/bills')} style={[styles.popupBtn, { borderColor: colors.accent }]}>
              <Text style={[styles.popupBtnText, { color: colors.accent }]}>View in Reminders</Text>
            </Pressable>
          </View>
        )}
      </View>

      {!!errorText && (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      )}

      <View style={[styles.bottomDock, { paddingBottom: bottomPadding }]}>
        <View style={styles.bottomMeta}>
          <Text style={styles.bottomTimer}>{timerText}</Text>
          <Text style={styles.bottomState}>
            {mode === 'recording' ? 'Recording...' : mode === 'paused' ? 'Paused' : mode === 'processing' ? 'Processing...' : 'Ready'}
          </Text>
        </View>

        {isRecordingLike && (
          <View style={styles.bottomWaveRow}>
            {[wave1, wave2, wave3, wave4, wave5, wave6].map((wave, idx) => (
              <Animated.View
                key={`dock-${idx}`}
                style={[
                  styles.bottomWaveBar,
                  {
                    height: wave.interpolate({ inputRange: [0, 1], outputRange: [7, 20] }),
                  },
                ]}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomActions}>
          <Pressable onPress={resetRecordingState} style={[styles.dockBtnGhost, styles.dockBtnSmall]}>
            <Ionicons name="trash-outline" size={18} color="#E2E8F0" />
          </Pressable>

          <Pressable
            onPress={isRecordingLike ? togglePause : undefined}
            disabled={!isRecordingLike}
            style={[styles.dockBtnGhost, styles.dockBtnMiddle, { opacity: isRecordingLike ? 1 : 0.4 }]}
          >
            <Text style={styles.dockBtnGhostText}>{mode === 'paused' ? 'Resume' : 'Pause'}</Text>
          </Pressable>

          <Pressable
            onPress={isRecordingLike ? stopAndProcess : startRecording}
            disabled={mode === 'processing'}
            style={[styles.dockBtnPrimary, { opacity: mode === 'processing' ? 0.6 : 1 }]}
          >
            {mode === 'processing' ? <ActivityIndicator color="#fff" /> : <Text style={styles.dockBtnPrimaryText}>{actionLabel}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  centerBlock: { flex: 1, justifyContent: 'center', paddingTop: 10, paddingBottom: 6, gap: 10 },
  centerCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 340,
    gap: 10,
    overflow: 'hidden',
  },
  glowHalo: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
  iconOrb: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statusSub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 38, marginTop: 8 },
  waveBar: { width: 7, borderRadius: 3.5 },
  timer: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: 1.2, marginTop: 2 },
  popupCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  popupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  popupMainText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  popupMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  popupBody: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  popupBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  popupBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  bottomDock: {
    backgroundColor: '#0B0E15',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
    marginHorizontal: -16,
  },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomTimer: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: 0.8 },
  bottomState: { color: '#CBD5E1', fontFamily: 'Inter_500Medium', fontSize: 12 },
  bottomWaveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 8, marginBottom: 10 },
  bottomWaveBar: { width: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  bottomActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dockBtnSmall: { width: 42 },
  dockBtnMiddle: { flex: 1 },
  dockBtnGhost: {
    backgroundColor: '#202B3C',
    borderRadius: 20,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dockBtnGhostText: { color: '#E2E8F0', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  dockBtnPrimary: {
    backgroundColor: '#0B1220',
    borderRadius: 20,
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dockBtnPrimaryText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 13 },
});
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRawRequest, apiRequest } from '@/lib/query-client';

type ScreenMode = 'idle' | 'recording' | 'paused' | 'processing' | 'editing';
type VoiceItem = { id: string; title: string; text?: string; date: string; type?: string };

const WAVE_KEYS = ['a', 'b', 'c', 'd', 'e'] as const;

export default function VoiceReminderScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ScreenMode>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [statusText, setStatusText] = useState('Tap Record Note to start.');
  const [errorText, setErrorText] = useState('');

  const [history, setHistory] = useState<VoiceItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const orbPulse = useRef(new Animated.Value(1)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const waves = useRef(
    WAVE_KEYS.reduce<Record<string, Animated.Value>>((acc, k) => {
      acc[k] = new Animated.Value(0.2);
      return acc;
    }, {}),
  ).current;

  const recordingActive = mode === 'recording' || mode === 'paused';
  const showEditor = mode === 'editing' || mode === 'processing';

  const timerText = useMemo(() => {
    const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const ss = (elapsedSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [elapsedSec]);

  const spin = useMemo(
    () => ringSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [ringSpin],
  );

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await apiRequest('GET', '/api/reminders/voice-history', undefined, token);
      const json = await res.json();
      setHistory(Array.isArray(json) ? json : []);
    } catch (err) {
      setHistory([]);
      setErrorText(err instanceof Error ? err.message : 'Failed to load voice notes');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [orbPulse]);

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(ringSpin, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true }),
    );
    spinLoop.start();
    return () => spinLoop.stop();
  }, [ringSpin]);

  useEffect(() => {
    if (mode !== 'recording') return;
    const t = setInterval(() => setElapsedSec((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'recording') return;
    const loops = WAVE_KEYS.map((k, idx) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(idx * 80),
          Animated.timing(waves[k], { toValue: 1, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(waves[k], { toValue: 0.2, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [mode, waves]);

  const upsertHistoryItem = (item: VoiceItem) => {
    setHistory((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
  };

  const createFromText = async (text: string) => {
    if (!token) return null;
    const res = await apiRequest('POST', '/api/reminders/voice-create', { text }, token);
    const json = (await res.json()) as { id?: string; title?: string; date?: string; type?: string };
    if (!json?.id) return null;
    const created: VoiceItem = {
      id: json.id,
      title: json.title || text.slice(0, 70),
      text,
      date: json.date || new Date().toISOString(),
      type: json.type || 'reminder',
    };
    upsertHistoryItem(created);
    return created;
  };

  const startRecording = async () => {
    try {
      setErrorText('');
      setStatusText('Checking microphone permission...');
      const p = await Audio.requestPermissionsAsync();
      if (!p.granted) {
        setErrorText('Microphone permission is required.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec.recording);
      setElapsedSec(0);
      setMode('recording');
      setStatusText('Recording in your spoken language...');
      setTranscript('');
      setNoteTitle('');
      setEditingId(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Unable to start recording');
    }
  };

  const togglePause = async () => {
    if (!recording) return;
    if (mode === 'recording') {
      await recording.pauseAsync();
      setMode('paused');
      setStatusText('Paused');
      return;
    }
    if (mode === 'paused') {
      await recording.startAsync();
      setMode('recording');
      setStatusText('Recording resumed');
    }
  };

  const stopAndTranscribe = async () => {
    if (!recording || !token) return;
    setMode('processing');
    setStatusText('Transcribing...');
    setErrorText('');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error('Recording file missing');
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();
      const form = new FormData();
      form.append('audio', blob, 'voice.m4a');
      const tr = await apiRawRequest('/api/voice-reminder/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!tr.ok) throw new Error((await tr.text()) || 'Transcription failed');
      const payload = (await tr.json()) as { text?: string };
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('Could not detect speech');
      setTranscript(text);
      setNoteTitle(text.slice(0, 72));
      const created = await createFromText(text);
      setEditingId(created?.id || null);
      setMode('editing');
      setStatusText('Voice note added instantly. You can edit now.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Voice processing failed');
      setMode('editing');
      setStatusText('Edit manually and save.');
    }
  };

  const saveEdited = async () => {
    if (!token || !transcript.trim()) return;
    setIsSaving(true);
    setErrorText('');
    try {
      if (editingId) {
        const res = await apiRequest('PATCH', `/api/reminders/voice-history/${editingId}`, {
          title: noteTitle.trim() || transcript.trim().slice(0, 80),
          text: transcript.trim(),
        }, token);
        const updated = (await res.json()) as VoiceItem;
        upsertHistoryItem(updated);
      } else {
        await createFromText(transcript.trim());
      }
      setMode('idle');
      setEditingId(null);
      setTranscript('');
      setNoteTitle('');
      setElapsedSec(0);
      setStatusText('Saved successfully.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditNote = (item: VoiceItem) => {
    setEditingId(item.id);
    setNoteTitle(item.title || '');
    setTranscript(item.text || '');
    setMode('editing');
    setStatusText('Edit selected note and save.');
    setErrorText('');
  };

  const deleteNote = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest('DELETE', `/api/reminders/voice-history/${id}`, undefined, token);
      setHistory((prev) => prev.filter((n) => n.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setTranscript('');
        setNoteTitle('');
        setMode('idle');
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const resetAll = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      }
    } catch {
      // ignore
    }
    setRecording(null);
    setMode('idle');
    setElapsedSec(0);
    setTranscript('');
    setNoteTitle('');
    setEditingId(null);
    setErrorText('');
    setStatusText('Tap Record Note to start.');
  };

  const topPadding = Platform.OS === 'web' ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);
  const doneDisabled = mode === 'processing' || isSaving || (mode === 'editing' && !transcript.trim()) || mode === 'idle';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topPadding }]}>
      <LinearGradient colors={['rgba(236,72,153,0.16)', 'rgba(59,130,246,0.08)', 'rgba(139,92,246,0.14)']} style={styles.bgGlow} />

      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Voice Reminder</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stageWrap}>
        <View style={[styles.stageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!showEditor && (
            <>
              <Animated.View style={[styles.spinRing, { borderColor: colors.accentDim, transform: [{ rotate: spin }] }]} />
              <Animated.View style={[styles.orb, { backgroundColor: recordingActive ? colors.dangerDim : colors.accentDim, transform: [{ scale: orbPulse }] }]}>
                <Ionicons name={recordingActive ? 'radio' : 'mic'} size={34} color={recordingActive ? colors.danger : colors.accent} />
              </Animated.View>
              <Text style={[styles.stageEyebrow, { color: colors.textSecondary }]}>Generate your note summary</Text>
              <Text style={[styles.stageTitle, { color: colors.text }]}>{recordingActive ? 'Recording' : 'Voice Note'}</Text>
              <Text style={[styles.stageSub, { color: colors.textSecondary }]}>{statusText}</Text>
            </>
          )}

          {recordingActive && (
            <View style={styles.recordMeta}>
              <View style={styles.waveRow}>
                {WAVE_KEYS.map((k) => (
                  <Animated.View
                    key={k}
                    style={[
                      styles.waveBar,
                      {
                        backgroundColor: colors.danger,
                        height: waves[k].interpolate({ inputRange: [0, 1], outputRange: [8, 36] }),
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.timer, { color: colors.text }]}>{timerText}</Text>
            </View>
          )}

          {showEditor && (
            <View style={styles.editorWrap}>
              <Text style={[styles.editorLabel, { color: colors.text }]}>Live Transcription</Text>
              <TextInput
                value={noteTitle}
                onChangeText={setNoteTitle}
                placeholder="Reminder title"
                placeholderTextColor={colors.textTertiary}
                style={[styles.titleInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              />
              <TextInput
                value={transcript}
                onChangeText={setTranscript}
                placeholder="Your spoken language transcript appears here..."
                placeholderTextColor={colors.textTertiary}
                multiline
                style={[styles.textArea, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                editable={mode !== 'processing'}
              />
              <Text style={[styles.langHint, { color: colors.textSecondary }]}>Shows same spoken language output.</Text>
            </View>
          )}
        </View>
      </View>

      {!!errorText && (
        <View style={[styles.errorCard, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      )}

      <View style={styles.listWrap}>
        <Text style={[styles.listTitle, { color: colors.textSecondary }]}>Recent Voice Notes</Text>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            isLoadingHistory ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No voice reminders yet.</Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.noteHead}>
                <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <View style={styles.noteActions}>
                  <Pressable onPress={() => openEditNote(item)} style={[styles.noteActionBtn, { backgroundColor: colors.accentDim }]}>
                    <Ionicons name="create-outline" size={14} color={colors.accent} />
                  </Pressable>
                  <Pressable onPress={() => deleteNote(item.id)} style={[styles.noteActionBtn, { backgroundColor: colors.dangerDim }]}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
              <Text style={[styles.noteText, { color: colors.textSecondary }]} numberOfLines={5}>{item.text || 'Voice reminder'}</Text>
              <Text style={[styles.noteDate, { color: colors.textTertiary }]}>{new Date(item.date).toLocaleString('en-IN')}</Text>
              <Pressable onPress={() => openEditNote(item)} style={[styles.viewBtn, { borderColor: colors.border }]}>
                <Text style={[styles.viewBtnText, { color: colors.text }]}>View Reminder</Text>
              </Pressable>
            </View>
          )}
          contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
        />
      </View>

      <View style={[styles.bottomDock, { paddingBottom: bottomPadding }]}>
        <View style={styles.bottomMeta}>
          <Text style={styles.bottomTimer}>{timerText}</Text>
          <Text style={styles.bottomState}>
            {mode === 'recording' ? 'Recording' : mode === 'paused' ? 'Paused' : mode === 'processing' ? 'Processing' : 'Ready'}
          </Text>
        </View>

        <View style={styles.bottomActions}>
          <Pressable onPress={resetAll} style={[styles.ctrlBtn, styles.ctrlGhost]}>
            <Ionicons name="close" size={20} color="#E2E8F0" />
          </Pressable>

          <Pressable
            onPress={
              mode === 'recording' || mode === 'paused'
                ? togglePause
                : mode === 'idle'
                  ? startRecording
                  : startRecording
            }
            disabled={mode === 'processing' || isSaving}
            style={[styles.ctrlBtn, styles.ctrlRecord, { opacity: mode === 'processing' || isSaving ? 0.6 : 1 }]}
          >
            <Ionicons
              name={mode === 'recording' ? 'pause' : mode === 'paused' ? 'play' : 'mic'}
              size={22}
              color="#fff"
            />
          </Pressable>

          <Pressable
            onPress={mode === 'recording' || mode === 'paused' ? stopAndTranscribe : mode === 'editing' ? saveEdited : undefined}
            disabled={doneDisabled}
            style={[styles.ctrlBtn, styles.ctrlDone, { opacity: doneDisabled ? 0.45 : 1 }]}
          >
            {mode === 'processing' || isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={22} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  bgGlow: {
    position: 'absolute',
    left: -60,
    right: -60,
    top: -120,
    height: 380,
    borderRadius: 240,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  stageWrap: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  stageCard: {
    borderWidth: 1,
    borderRadius: 24,
    minHeight: 320,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  spinRing: { position: 'absolute', width: 152, height: 152, borderRadius: 76, borderWidth: 2, opacity: 0.6 },
  orb: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  stageEyebrow: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.4 },
  stageTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  stageSub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  recordMeta: { alignItems: 'center', gap: 8 },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 38 },
  waveBar: { width: 6, borderRadius: 3 },
  timer: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: 1 },
  editorWrap: { width: '100%', gap: 8 },
  editorLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  titleInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 118,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  langHint: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  errorCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  listWrap: { flex: 1.15, paddingBottom: 8 },
  listTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 8 },
  noteCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, gap: 4 },
  noteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  noteActions: { flexDirection: 'row', gap: 6 },
  noteActionBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  noteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  noteText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  noteDate: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  viewBtn: { marginTop: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  viewBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 12 },
  bottomDock: {
    marginHorizontal: -16,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#0D1320',
  },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  bottomTimer: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: 1 },
  bottomState: { color: '#CBD5E1', fontFamily: 'Inter_500Medium', fontSize: 12 },
  bottomActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ctrlBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  ctrlGhost: { backgroundColor: '#1F2937' },
  ctrlRecord: { backgroundColor: '#F43F5E' },
  ctrlDone: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#334155' },
});
*/
