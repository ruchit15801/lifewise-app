import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { useExpenses } from '@/lib/expense-context';
import { scheduleLocalNotification } from '@/lib/notifications';
import { useCurrency } from '@/lib/currency-context';

type ScanStep = 'guide' | 'preview' | 'processing';

export default function ScanBillScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  const { refreshData } = useExpenses();
  const { formatAmount } = useCurrency();

  const [step, setStep] = useState<ScanStep>('guide');
  const [flashOn, setFlashOn] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<{
    uri: string;
    fileName?: string;
    mimeType?: string;
  } | null>(null);

  type BillPreview = {
    name: string;
    amount: number;
    dueDate: string;
    imageKey: string;
    imageUrl: string;
  };

  const [previewData, setPreviewData] = useState<BillPreview | null>(null);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
  const [showFailModal, setShowFailModal] = useState(false);
  const [failMessage, setFailMessage] = useState('Not a bill photo.');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PROCESS_MESSAGES = useMemo(
    () => [
      'Scanning your bill...',
      'Extracting bill details...',
      'Detecting bill format...',
      'Reading bill text...',
      'Checking due date...',
    ],
    [],
  );

  useEffect(() => {
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, []);

  const takePictureFromCamera = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Camera capture is not supported on web in this flow.');
      return;
    }

    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to scan bills.');
        return;
      }
    }

    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      if (!pic?.uri) {
        Alert.alert('Scan failed', 'Could not capture the photo. Please try again.');
        return;
      }

      setPreviewData(null);
      setShowFailModal(false);
      setStep('preview');
      setPhoto({
        uri: pic.uri,
        fileName: 'bill.jpg',
        mimeType: 'image/jpeg',
      });
    } catch {
      Alert.alert('Scan failed', 'Unexpected error while taking photo.');
    }
  }, [cameraPermission, requestCameraPermission]);

  const openGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled || !result.assets || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.uri) return;

    setPreviewData(null);
    setShowFailModal(false);
    setStep('preview');
    setPhoto({
      uri: asset.uri,
      fileName: asset.fileName ?? 'bill.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }, []);

  const startRotation = useCallback(() => {
    setProcessingMsgIdx(0);
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = setInterval(() => {
      setProcessingMsgIdx((i) => (i + 1) % PROCESS_MESSAGES.length);
    }, 450);
  }, [PROCESS_MESSAGES.length]);

  const stopRotation = useCallback(() => {
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = null;
  }, []);

  const scanPreview = useCallback(async () => {
    if (!photo || !token) {
      Alert.alert('Not ready', 'Please login again and try scanning.');
      return;
    }

    setStep('processing');
    setPreviewData(null);
    setShowFailModal(false);
    setShowSuccessModal(false);

    const startedAt = Date.now();
    startRotation();
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/bills/scan/preview', baseUrl).toString();

      const form = new FormData();
      form.append('image', {
        uri: photo.uri,
        name: photo.fileName || 'bill.jpg',
        type: photo.mimeType || 'image/jpeg',
      } as any);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const elapsed = Date.now() - startedAt;
      await new Promise((r) => setTimeout(r, Math.max(0, 2200 - elapsed)));

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        setFailMessage(json?.message ?? 'This does not look like a bill photo.');
        setShowFailModal(true);
        setStep('preview');
        return;
      }

      const data = (await res.json()) as { preview: BillPreview };
      setPreviewData(data.preview);
      setShowSuccessModal(true);
    } catch {
      setFailMessage('Network error while scanning bill. Please try again.');
      setShowFailModal(true);
      setStep('preview');
    } finally {
      stopRotation();
    }
  }, [photo, token, startRotation, stopRotation]);

  const commitReminder = useCallback(
    async () => {
      if (!previewData || !token) return;

      const baseUrl = getApiUrl();
      const url = new URL('/api/bills/scan/commit', baseUrl).toString();

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preview: previewData,
        }),
      });

      if (!res.ok) {
        Alert.alert('Save failed', 'Could not save reminder. Please try again.');
        return;
      }

      const created = (await res.json()) as { id: string; dueDate?: string; name?: string; amount?: number };

      if (created?.dueDate) {
        await scheduleLocalNotification({
          title: `${created.name || 'Bill'} Due Soon`,
          body: `₹${created.amount ?? 0} due on ${new Date(created.dueDate).toLocaleDateString('en-IN')}`,
          data: { type: 'reminder', billId: created.id },
          triggerAt: new Date(created.dueDate),
        }).catch(() => {});
      }

      await refreshData();
      setShowSuccessModal(false);
      setStep('guide');
      setPhoto(null);

      router.replace(`/bill-details/${created.id}`);
    },
    [previewData, token, refreshData, router],
  );

  return (
    <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      <View style={[styles.header, { paddingTop: 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-left" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Scan Bill</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.body}>
        {step === 'guide' && (
          <View style={{ flex: 1 }}>
            {Platform.OS !== 'web' && cameraPermission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                flash={flashOn ? 'on' : 'off'}
              >
                <View style={styles.cameraOverlay}>
                  <View style={styles.cameraTopText}>
                    <Text style={{ color: '#4F46E5', fontFamily: 'Inter_600SemiBold' }}>
                      Place the bill inside the frame
                    </Text>
                    <Text style={{ marginTop: 6, color: colors.textTertiary, textAlign: 'center' }}>
                      Make sure the bill text and due date are clearly visible.
                    </Text>
                  </View>

                  <View style={styles.frameGuide} />

                  <View style={styles.cameraBottom}>
                    <View style={styles.flashRow}>
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' }}>Flash</Text>
                      <Switch value={flashOn} onValueChange={setFlashOn} />
                    </View>

                    <View style={styles.cameraControlsRow}>
                      <Pressable
                        onPress={takePictureFromCamera}
                        style={styles.captureBtn}
                        hitSlop={12}
                      >
                        <View style={styles.captureInner} />
                      </Pressable>

                      <Pressable
                        onPress={openGallery}
                        style={[styles.actionBtn, { backgroundColor: '#4F46E5', maxWidth: 140 }]}
                      >
                        <Text style={styles.actionBtnText}>Upload</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </CameraView>
            ) : (
              <View style={styles.center}>
                <View style={styles.frameGuide} />
                <Text style={{ marginTop: 14, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' }}>
                  Place the bill inside the frame
                </Text>
                <Text style={{ marginTop: 8, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 10 }}>
                  Make sure the bill text and due date are clearly visible.
                </Text>

                <View style={{ marginTop: 18 }}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.inputBg }]}
                    onPress={() => {
                      if (Platform.OS === 'web') return;
                      requestCameraPermission();
                    }}
                  >
                    <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
                      Enable Camera
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]} onPress={openGallery}>
                    <Text style={styles.actionBtnText}>Upload</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {step === 'preview' && photo && (
          <>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="contain" />

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setPhoto(null);
                  setStep('guide');
                }}
              >
                <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Retake</Text>
              </Pressable>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
                onPress={scanPreview}
              >
                <Text style={styles.actionBtnText}>Scan</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 'processing' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ marginTop: 10, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' }}>
              {PROCESS_MESSAGES[processingMsgIdx]}
            </Text>
            <Text style={{ marginTop: 8, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 10 }}>
              This should take a few seconds.
            </Text>
          </View>
        )}
      </View>

      <Modal visible={showFailModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>This does not look like a bill</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textTertiary, marginTop: 8 }]}>
              {failMessage}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setShowFailModal(false);
                  setStep('guide');
                  setPhoto(null);
                }}
              >
                <Text style={[styles.modalBtnLabel, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#4F46E5' }]}
                onPress={() => {
                  setShowFailModal(false);
                  setStep('guide');
                  setPhoto(null);
                }}
              >
                <Text style={styles.modalBtnLabelPrimary}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your bill was scanned successfully</Text>
            {previewData ? (
              <>
                <View style={{ marginTop: 12, gap: 6 }}>
                  <Text style={[styles.modalRowLabel, { color: colors.textTertiary }]}>Bill name</Text>
                  <Text style={[styles.modalRowValue, { color: colors.text }]}>{previewData.name}</Text>
                  <Text style={[styles.modalRowLabel, { color: colors.textTertiary }]}>Amount</Text>
                  <Text style={[styles.modalRowValue, { color: colors.text }]}>{formatAmount(previewData.amount)}</Text>
                  <Text style={[styles.modalRowLabel, { color: colors.textTertiary }]}>Due date</Text>
                  <Text style={[styles.modalRowValue, { color: colors.text }]}>
                    {new Date(previewData.dueDate).toLocaleDateString('en-IN')}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#4F46E5' }]}
                onPress={commitReminder}
              >
                <Text style={styles.modalBtnLabelPrimary}>Save Reminder</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.inputBg }]}
                onPress={commitReminder}
              >
                <Text style={[styles.modalBtnLabel, { color: colors.textSecondary }]}>Edit Details</Text>
              </Pressable>
            </View>
            <Pressable
              style={{ marginTop: 10, paddingVertical: 8, alignItems: 'center' }}
              onPress={() => {
                setShowSuccessModal(false);
                setStep('guide');
                setPhoto(null);
                setPreviewData(null);
              }}
            >
              <Text style={[styles.modalBtnLabel, { color: colors.textTertiary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  previewImage: {
    width: '100%',
    height: 360,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  frameGuide: {
    width: '100%',
    height: 320,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(79,70,229,0.45)',
    backgroundColor: 'rgba(79,70,229,0.05)',
  },
  guideWrap: {
    flex: 1,
  },
  camera: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cameraOverlay: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  cameraTopText: {
    alignItems: 'center',
  },
  cameraBottom: {
    gap: 12,
  },
  flashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  cameraControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#4F46E5',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  modalBtnLabel: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 13,
  },
  modalBtnLabelPrimary: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  modalRowLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 4,
  },
  modalRowValue: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    marginTop: 0,
    marginBottom: 4,
  },
});

