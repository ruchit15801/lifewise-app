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
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { useExpenses } from '@/lib/expense-context';
import PremiumLoader from '@/components/PremiumLoader';
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
    vendorName?: string;
    billDate?: string;
    billNumber?: string;
    accountNumber?: string;
    lateFee?: number;
    taxAmount?: number;
    phoneNumber?: string;
  };

  const [previewData, setPreviewData] = useState<BillPreview | null>(null);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
  const [showFailModal, setShowFailModal] = useState(false);
  const [failMessage, setFailMessage] = useState('Not a bill photo.');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [editingData, setEditingData] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

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
      const pic = await cameraRef.current?.takePictureAsync({ quality: 1.0 });
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
      quality: 1.0,
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
    setIsEditing(false); // Reset editing state
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

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        setFailMessage(json?.message ?? 'This does not look like a bill photo.');
        setShowFailModal(true);
        setStep('preview');
        return;
      }
      if (res.ok) {
        const resJson = await res.json();
        setPreviewData(resJson.preview);
        setEditingData(resJson.preview);
        setConfidence(resJson.metadata?.confidence || null);
        setShowSuccessModal(true);
      }
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
          preview: editingData,
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
    <View style={[styles.container, { backgroundColor: '#FFFFFF', paddingBottom: 40 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Scan Bill</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        {step === 'guide' && (
          <View style={styles.guideStepWrap}>
            {Platform.OS !== 'web' && cameraPermission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                flash={flashOn ? 'on' : 'off'}
              >
                <View style={styles.cameraOverlay}>
                  <View style={styles.cameraTopText}>
                    <Text style={styles.guideTitle}>
                      Place the bill inside the frame
                    </Text>
                    <Text style={styles.guideSubtitle}>
                      Make sure the bill text and due date are clearly visible.
                    </Text>
                  </View>

                  {/* <View style={styles.frameGuide} /> */}

                  <View style={styles.cameraBottom}>
                    <View style={styles.flashRow}>
                      <Text style={styles.flashLabel}>Flash</Text>
                      <Switch value={flashOn} onValueChange={setFlashOn} />
                    </View>

                    <View style={styles.cameraControlsRow}>
                      <Pressable
                        onPress={takePictureFromCamera}
                        style={styles.captureButton}
                        hitSlop={12}
                      >
                        <View style={styles.captureButtonInner}>
                          <Ionicons name="camera" size={24} color="#ffffff" />
                        </View>
                      </Pressable>

                      <Pressable
                        onPress={openGallery}
                        style={styles.uploadActionBtn}
                      >
                        <Text style={styles.uploadActionBtnText}>Upload from gallery</Text>
                      </Pressable>
                    </View>
                  </View>

                </View>
              </CameraView>
            ) : (
              <View style={styles.center}>
                <View style={styles.frameGuide} />
                <Text style={[styles.fallbackTitle, { color: colors.textSecondary }]}>
                  Place the bill inside the frame
                </Text>
                <Text style={[styles.fallbackSubtitle, { color: colors.textTertiary }]}>
                  Make sure the bill text and due date are clearly visible.
                </Text>

                <View style={styles.fallbackEnableWrap}>
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
            <PremiumLoader size={100} text={PROCESS_MESSAGES[processingMsgIdx]} />
            <Text style={[styles.processingTitle, { color: colors.textSecondary }]}>
              {PROCESS_MESSAGES[processingMsgIdx]}
            </Text>
            <Text style={[styles.processingSubtitle, { color: colors.textTertiary }]}>
              This should take a few seconds.
            </Text>
          </View>
        )}
      </View>

      <Modal visible={showFailModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24 }]}>
            <View style={[styles.iconBox, { backgroundColor: '#FEE2E2', alignSelf: 'center', marginBottom: 16 }]}>
              <Ionicons name="alert-circle" size={32} color="#EF4444" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text, textAlign: 'center' }]}>
              Invalid Scan
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>
              {failMessage}
            </Text>
            <View style={[styles.modalActions, { marginTop: 24, borderTopWidth: 0 }]}>
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
                <Text style={styles.modalBtnLabel}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isEditing ? 'Editing Details' : 'Bill Summary'}
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                {isEditing 
                  ? "Correct any details we missed." 
                  : "We've accurately extracted these details."}
              </Text>
            </View>

            {!isEditing ? (
              <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: colors.inputBg }]}>
                  <View style={styles.summaryHeader}>
                    <View style={[styles.iconBox, { backgroundColor: '#4F46E5' }]}>
                      <Ionicons 
                        name={(editingData?.icon as any) || 'receipt'} 
                        size={24} 
                        color="#ffffff" 
                      />
                    </View>
                    <View style={styles.summaryMeta}>
                      <Text style={[styles.summaryVendor, { color: colors.text }]}>
                        {editingData?.name || 'Unknown Vendor'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.summaryCategory, { color: colors.textTertiary }]}>
                          {(editingData?.category || 'bills').toUpperCase()}
                        </Text>
                        {confidence !== null && (
                          <View style={[styles.confidenceBadge, { backgroundColor: confidence >= 90 ? '#DEF7ED' : '#FEF3C7' }]}>
                            <Text style={[styles.confidenceText, { color: confidence >= 90 ? '#065F46' : '#92400E' }]}>
                              {confidence}% Match
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryRow}>
                    <View>
                      <Text style={styles.summaryLabel}>Amount Due</Text>
                      <Text style={[styles.summaryValue, { color: colors.accent }]}>
                        {formatAmount(editingData?.amount || 0)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.summaryLabel}>Due Date</Text>
                      <Text style={[styles.summaryValue, { color: colors.textSecondary }]}>
                        {editingData?.dueDate ? new Date(editingData.dueDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        }) : 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable 
                  style={styles.editToggleBtn}
                  onPress={() => setIsEditing(true)}
                >
                  <Ionicons name="create-outline" size={18} color="#4F46E5" />
                  <Text style={styles.editToggleText}>Edit details</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={styles.editScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.editGrid}>
                {/* General Info */}
                <View style={styles.editCard}>
                  <Text style={styles.editCardTitle}>General</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bill Name</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      value={editingData?.name}
                      onChangeText={(t) => setEditingData((prev: any) => ({ ...prev, name: t }))}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount (₹)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      value={editingData?.amount?.toString()}
                      keyboardType="numeric"
                      onChangeText={(t) => setEditingData((prev: any) => ({ ...prev, amount: parseFloat(t) || 0 }))}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Due Date</Text>
                    <Pressable
                      style={[styles.input, { borderColor: colors.border, justifyContent: 'center' }]}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={{ color: colors.text }}>
                        {editingData?.dueDate ? new Date(editingData.dueDate).toLocaleDateString('en-IN') : 'Select Date'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Metadata */}
                <View style={styles.editCard}>
                  <Text style={styles.editCardTitle}>Scanned Metadata</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Vendor / Merchant</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      value={editingData?.vendorName}
                      placeholder="e.g. Jio Fiber"
                      onChangeText={(t) => setEditingData((prev: any) => ({ ...prev, vendorName: t }))}
                    />
                  </View>
                </View>
              </View>
              
              <Pressable 
                style={[styles.editToggleBtn, { marginTop: 16 }]}
                onPress={() => setIsEditing(false)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
                <Text style={[styles.editToggleText, { color: '#10B981' }]}>Finish editing</Text>
              </Pressable>
            </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setShowSuccessModal(false);
                  setStep('guide');
                  setPhoto(null);
                  setPreviewData(null);
                  setEditingData(null);
                }}
              >
                <Text style={[styles.modalBtnLabel, { color: colors.textSecondary }]}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={commitReminder}
                style={({ pressed }) => [
                  styles.saveBtnFull,
                  { opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <LinearGradient
                  colors={['#4F46E5', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveGradient}
                >
                  <Text style={styles.saveBtnText}>Save Bill</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={editingData?.dueDate ? new Date(editingData.dueDate) : new Date()}
            mode="date"
            display="default"
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setEditingData((prev: any) => ({ ...prev, dueDate: date.toISOString() }));
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: 10,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 20 },
  headerTitle: {
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
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
    height: '90%',
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
    textAlign: 'center',
    lineHeight: 18,
    includeFontPadding: false,
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
  guideStepWrap: {
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
  guideTitle: {
    color: '#C1C1C1',
    fontFamily: 'Inter_600SemiBold',
  },
  guideSubtitle: {
    marginTop: 3,
    color: '#8F8F8F',
    textAlign: 'center',
    fontSize: 11,
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
  flashLabel: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
  },
  cameraControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  captureButton: {
    backgroundColor: '#FFFFFF',
    width: 70,
    height: 70,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  uploadActionBtn: {
    backgroundColor: '#4F46E5',
    maxWidth: 200,
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadActionBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 18,
    includeFontPadding: false,
  },
  fallbackTitle: {
    marginTop: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  fallbackSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  fallbackEnableWrap: {
    marginTop: 18,
  },
  processingTitle: {
    marginTop: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  processingSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  successInfoWrap: {
    marginTop: 12,
    gap: 6,
  },
  successCancelBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  summaryContainer: {
    width: '100%',
    paddingBottom: 20,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryMeta: {
    flex: 1,
  },
  summaryVendor: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryCategory: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 10,
  },
  editToggleText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#4F46E5',
  },
  editScroll: {
    maxHeight: 400,
    flexGrow: 0,
    marginBottom: 10,
  },
  editGrid: {
    gap: 20,
  },
  editCard: {
    gap: 12,
  },
  editCardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    backgroundColor: '#F8FAFC',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  saveBtnFull: {
    flex: 1.5,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
});

