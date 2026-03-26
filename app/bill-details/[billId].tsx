import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  Image,
  View,
  ScrollView,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  GestureHandlerRootView, 
  Gesture,
  GestureDetector
} from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import { useCurrency } from '@/lib/currency-context';
import { REPEAT_OPTIONS, ReminderType, RepeatType, REMINDER_TYPE_CONFIG, type Bill } from '@/lib/data';
import { scheduleLocalNotification } from '@/lib/notifications';
import { getIntentPolicy, getReminderIntentFromBill } from '@/lib/reminder-intent';
import CategoryIcon from '@/components/CategoryIcon';

function timeLabelFromDate(d: Date) {
  const hour24 = d.getHours();
  const minute = d.getMinutes();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const mm = String(minute).padStart(2, '0');
  return `${hour12}:${mm} ${suffix}`;
}

function formatRepeat(r: RepeatType) {
  const found = REPEAT_OPTIONS.find((x) => x.key === r);
  return found?.label ?? 'One-time';
}

export default function BillDetailsScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { formatAmount } = useCurrency();
  const {
    bills,
    toggleBillPaid,
    editReminder,
    snoozeReminder,
    cancelReminder,
    uncancelReminder,
  } = useExpenses();

  const bill = useMemo(() => bills.find((b) => b.id === billId), [bills, billId]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showBillImageModal, setShowBillImageModal] = useState(false);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [showRepeatPickerModal, setShowRepeatPickerModal] = useState(false);
  const [tempTime, setTempTime] = useState<Date>(() => (bill ? new Date(bill.dueDate) : new Date()));
  const [tempRepeat, setTempRepeat] = useState<RepeatType>(() => (bill ? bill.repeatType : 'none'));
  const [draftTime, setDraftTime] = useState<Date>(() => (bill ? new Date(bill.dueDate) : new Date()));
  const [draftRepeat, setDraftRepeat] = useState<RepeatType>(() => (bill ? bill.repeatType : 'none'));
  const [tempAmount, setTempAmount] = useState<string>(() => (bill ? bill.amount.toString() : '0'));
  const [tempName, setTempName] = useState<string>(() => (bill ? bill.name : ''));
  const [tempVendor, setTempVendor] = useState<string>(() => (bill?.vendorName || ''));
  const [tempBillNum, setTempBillNum] = useState<string>(() => (bill?.billNumber || ''));
  const [tempAccNum, setTempAccNum] = useState<string>(() => (bill?.accountNumber || ''));
  const [editError, setEditError] = useState<string>('');

  // Pinch to zoom shared values
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = event.scale;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onEnd(() => {
      scale.value = withSpring(1);
    });

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: focalX.value },
      { translateY: focalY.value },
      { scale: scale.value },
      { translateX: -focalX.value },
      { translateY: -focalY.value },
    ],
  }));

  React.useEffect(() => {
    if (!bill) return;
    setTempTime(new Date(bill.dueDate));
    setTempRepeat(bill.repeatType);
    setDraftTime(new Date(bill.dueDate));
    setDraftRepeat(bill.repeatType);
    setTempAmount(bill.amount.toString());
    setTempName(bill.name);
    setTempVendor(bill.vendorName || '');
    setTempBillNum(bill.billNumber || '');
    setTempAccNum(bill.accountNumber || '');
  }, [bill]);

  const isPaid = bill ? bill.status === 'paid' || bill.isPaid : false;
  const dueDate = bill ? new Date(bill.dueDate) : null;
  const repeatLabel = bill ? formatRepeat(bill.repeatType) : '';
  const intent = bill ? getReminderIntentFromBill(bill) : 'custom';
  const policy = getIntentPolicy(intent);

  const headerTop = Platform.OS === 'web' ? 36 : insets.top + 8;
  const contentPadBottom = Math.max(insets.bottom, 16);

  async function onSaveEdit() {
    if (!bill) return;
    if (!tempName.trim()) {
      setEditError('Name is required');
      return;
    }
    const amountNum = parseFloat(tempAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      setEditError('Please enter a valid amount');
      return;
    }
    setEditError('');
    const nextDue = new Date(tempTime);

    const updated: Bill = {
      ...bill,
      name: tempName || bill.name,
      amount: amountNum,
      dueDate: nextDue.toISOString(),
      repeatType: tempRepeat,
      vendorName: tempVendor,
      billNumber: tempBillNum,
      accountNumber: tempAccNum,
      status: 'active',
      snoozedUntil: undefined,
    };

    editReminder(updated);

    scheduleLocalNotification({
      title: `${updated.name} Due`,
      body: `₹${updated.amount} is due today.`,
      data: { type: 'reminder', billId: bill.id },
      triggerAt: nextDue,
    }).catch(() => {});

    setShowEditModal(false);
    setEditError('');
  }

  function onToggleDone() {
    if (!bill) return;
    toggleBillPaid(bill.id);
  }

  function onSnooze(days: number) {
    if (!bill) return;
    snoozeReminder(bill.id, days);

    // Best-effort schedule for snoozed time.
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);
    scheduleLocalNotification({
      title: 'Reminder',
      body: bill.name,
      data: { type: 'reminder', billId: bill.id },
      triggerAt: snoozedUntil,
    }).catch(() => {});

    setShowSnoozeModal(false);
  }

  if (!bill) {
    return (
      <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={{ paddingTop: headerTop, paddingHorizontal: 18 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading reminder...</Text>
        </View>
      </View>
    );
  }

  const statusLabel =
    bill.status === 'paid'
      ? 'Done'
      : bill.status === 'snoozed'
        ? 'Snoozed'
        : dueDate
            ? (dueDate.getTime() < Date.now() ? 'Overdue' : 'Upcoming')
          : bill.status === 'cancelled'
            ? 'Cancelled'
            : 'Active';

  const snoozedUntilLabel =
    bill.status === 'snoozed' && bill.snoozedUntil
      ? `Until ${new Date(bill.snoozedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* Premium Header */}
      <View style={styles.headerOuter}>
        <LinearGradient
          colors={['#4F46E5', '#7C3AED', '#C026D3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: headerTop }]}
        >
          {/* Abstract pattern decoration */}
          <View style={styles.headerDecoration1} />
          <View style={styles.headerDecoration2} />
          
          {/* Animated Category Icon Decoration */}
          <View style={styles.headerCatIconPos}>
            <CategoryIcon category={bill.category} size={120} color="rgba(255,255,255,0.12)" />
          </View>

          <View style={styles.headerTop}>
            <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitleMain}>Reminder Details</Text>
            <Pressable onPress={() => setShowEditModal(true)} style={styles.headerEditBtn}>
              <Ionicons name="pencil" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.headerHero}>
            <View style={styles.heroAmountBadge}>
              <Text style={styles.heroAmount}>{formatAmount(bill.amount)}</Text>
            </View>
            <Text style={styles.heroName}>{bill.name}</Text>
            <View style={[styles.heroStatusBadge, { backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }]}>
              <View style={[styles.statusDot, { backgroundColor: isPaid ? '#10B981' : '#EF4444' }]} />
              <Text style={[styles.heroStatusText, { color: '#FFFFFF' }]}>{statusLabel}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={{ paddingBottom: contentPadBottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Info Card */}
        <View style={styles.mainCard}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="calendar-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Due Date</Text>
              <Text style={styles.infoValue}>
                {dueDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="repeat-outline" size={20} color="#10B981" />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Frequency</Text>
              <Text style={styles.infoValue}>{repeatLabel}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#FFF7ED' }]}>
              <Ionicons name="stats-chart-outline" size={20} color="#F97316" />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: isPaid ? '#DCFCE7' : '#FEE2E2' }]}>
                <Text style={[styles.statusBadgeText, { color: isPaid ? '#166534' : '#991B1B' }]}>
                  {isPaid ? 'Paid' : 'Upcoming'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Metadata section if available */}
        {(bill.vendorName || bill.billNumber || bill.accountNumber) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bill Metadata</Text>
            <View style={styles.metaCard}>
              {bill.vendorName && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Vendor</Text>
                  <Text style={styles.metaValue}>{bill.vendorName}</Text>
                </View>
              )}
              {bill.billNumber && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Bill / Invoice #</Text>
                  <Text style={styles.metaValue}>{bill.billNumber}</Text>
                </View>
              )}
              {bill.accountNumber && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Account #</Text>
                  <Text style={styles.metaValue}>{bill.accountNumber}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Smart Insights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Smart Insights</Text>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={10} color="#7C3AED" />
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          </View>
          <View style={styles.insightCard}>
            <LinearGradient
              colors={['#F5F3FF', '#FFFFFF']}
              style={styles.insightGradient}
            >
              <View style={styles.insightIconWrap}>
                <Ionicons name="trending-up-outline" size={24} color="#7C3AED" />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Predicted Savings</Text>
                <Text style={styles.insightDesc}>
                  Paying this {repeatLabel.toLowerCase()} reduces late fees by approx. ₹150 yearly.
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Payment History Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          <View style={styles.historyCard}>
            {[
              { date: 'Feb 25, 2026', amount: bill.amount, status: 'Paid On Time', icon: 'checkmark-circle' },
              { date: 'Jan 25, 2026', amount: bill.amount, status: 'Paid On Time', icon: 'checkmark-circle' },
            ].map((item, idx) => (
              <View key={idx} style={[styles.historyRow, idx === 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.historyIconWrap}>
                  <Ionicons name={item.icon as any} size={20} color="#10B981" />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyDate}>{item.date}</Text>
                  <Text style={styles.historyStatus}>{item.status}</Text>
                </View>
                <Text style={styles.historyAmount}>{formatAmount(item.amount)}</Text>
              </View>
            ))}
            <Pressable style={styles.viewMoreBtn}>
              <Text style={styles.viewMoreText}>View Full History</Text>
              <Ionicons name="chevron-forward" size={14} color="#64748B" />
            </Pressable>
          </View>
        </View>

        {/* Bill Image / Official Document */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{bill.imageUrl ? 'Official Bill' : 'Smart Summary'}</Text>
          {bill.imageUrl ? (
            <Pressable onPress={() => setShowBillImageModal(true)} style={styles.billImageContainer}>
              <Image source={{ uri: bill.imageUrl }} style={styles.billImage} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={styles.billImageOverlay}
              >
                <Ionicons name="expand-outline" size={24} color="#FFFFFF" />
                <Text style={styles.billImageOverlayText}>View Full Bill</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.emptyBillCard}>
              <View style={styles.emptyBillIconWrap}>
                <Ionicons name="document-text-outline" size={32} color="#94A3B8" />
              </View>
              <Text style={styles.emptyBillTitle}>Digital Summary Available</Text>
              <Text style={styles.emptyBillDesc}>No physical scan attached. AI has summarized the intent as {intent}.</Text>
              <Pressable style={styles.addScanBtn}>
                <Ionicons name="camera" size={18} color="#4F46E5" />
                <Text style={styles.addScanBtnText}>Attach Scan</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Primary Action Row */}
        <Pressable
          style={[styles.bottomBtnMain, { backgroundColor: isPaid ? '#94A3B8' : '#10B981' }]}
          onPress={onToggleDone}
        >
          <Ionicons name={isPaid ? "refresh-outline" : "checkmark-circle-outline"} size={22} color="#FFFFFF" />
          <Text 
            style={styles.bottomBtnTextMain}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {isPaid ? 'Mark Unpaid' : 'Mark as Paid'}
          </Text>
        </Pressable>

        {/* Secondary Actions Row */}
        <View style={styles.secondaryActionsRow}>
          <Pressable
            style={[styles.bottomBtn, { backgroundColor: '#F1F5F9' }]}
            onPress={() => setShowSnoozeModal(true)}
          >
            <Ionicons name="notifications-off-outline" size={20} color="#475569" />
            <Text 
              style={[styles.bottomBtnText, { color: '#475569' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Snooze
            </Text>
          </Pressable>

          {bill.status === 'cancelled' ? (
            <Pressable
              style={[styles.bottomBtn, { backgroundColor: '#E0F2FE' }]}
              onPress={() => uncancelReminder(bill.id)}
            >
              <Ionicons name="arrow-undo-outline" size={20} color="#0369A1" />
              <Text style={[styles.bottomBtnText, { color: '#0369A1' }]}>Restore</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.bottomBtn, { backgroundColor: '#FEF2F2' }]}
              onPress={() => cancelReminder(bill.id)}
            >
              <Ionicons name="close-outline" size={20} color="#EF4444" />
              <Text 
                style={[styles.bottomBtnText, { color: '#EF4444' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalBackdropFull}>
          <View style={[styles.fullSheet, { backgroundColor: '#FFFFFF' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitleBig}>Edit Reminder</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <Ionicons name="close-circle" size={28} color="#94A3B8" />
              </Pressable>
            </View>

            {!!editError && (
              <View style={[styles.errorBox, { backgroundColor: '#FEE2E2', marginHorizontal: 20, marginBottom: 12 }]}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={[styles.errorText, { color: '#B91C1C' }]}>{editError}</Text>
              </View>
            )}

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.editGrid}>
                <View style={styles.editSection}>
                  <Text style={styles.editSectionTitle}>Basic Details</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempName}
                      onChangeText={setTempName}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount (₹)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempAmount}
                      keyboardType="numeric"
                      onChangeText={setTempAmount}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Due Date</Text>
                    <Pressable
                      style={styles.textInput}
                      onPress={() => setShowTimePickerModal(true)}
                    >
                      <Text style={{ color: '#1E293B' }}>
                        {tempTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.editSection}>
                  <Text style={styles.editSectionTitle}>Advanced Metadata</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Vendor Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempVendor}
                      placeholder="e.g. Netflix"
                      onChangeText={setTempVendor}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bill Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempBillNum}
                      placeholder="Invoice ID"
                      onChangeText={setTempBillNum}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Account Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempAccNum}
                      placeholder="Your A/C ID"
                      onChangeText={setTempAccNum}
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            <Pressable style={styles.saveBtnAction} onPress={onSaveEdit}>
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                style={styles.saveGradientAction}
              >
                <Text style={styles.saveBtnTextAction}>Save Changes</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        {showTimePickerModal && (
          <DateTimePicker
            value={tempTime}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => {
              if (Platform.OS === 'android') setShowTimePickerModal(false);
              if (date) setTempTime(date);
            }}
          />
        )}
      </Modal>

      {/* Repeat picker modal */}
      <Modal transparent visible={showRepeatPickerModal} animationType="fade">
        <View style={styles.modalBackdropCentered}>
          <View style={styles.modalCardCentered}>
            <Text style={styles.modalTitle}>Repeat</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {REPEAT_OPTIONS.map((opt) => {
                const active = opt.key === draftRepeat;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setDraftRepeat(opt.key)}
                    style={[styles.repeatRow, active && styles.repeatRowActive]}
                  >
                    <Text style={[styles.repeatLabel, active && styles.repeatLabelActive]}>
                      {opt.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowRepeatPickerModal(false)} style={styles.modalTextButton}>
                <Text style={styles.modalTextButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTempRepeat(draftRepeat);
                  setShowRepeatPickerModal(false);
                }}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryButtonLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Snooze modal */}
      <Modal visible={showSnoozeModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdropFull} onPress={() => setShowSnoozeModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Snooze reminder</Text>
            <Text style={styles.sheetSubtitle}>Remind me again in…</Text>

            <View style={styles.snoozeGrid}>
              {[
                { days: 1, label: '1 Day', icon: 'sunny' as const, accent: '#EA580C' },
                { days: 2, label: '2 Days', icon: 'partly-sunny' as const, accent: '#F59E0B' },
                { days: 3, label: '3 Days', icon: 'cloud' as const, accent: '#3B82F6' },
                { days: 7, label: '1 Week', icon: 'calendar' as const, accent: '#7C3AED' },
              ].map((opt) => (
                <Pressable
                  key={opt.days}
                  onPress={() => onSnooze(opt.days)}
                  style={[
                    styles.snoozeOption,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                  ]}
                >
                  <View style={[styles.snoozeIconWrap, { backgroundColor: opt.accent + '15' }]}>
                    <Ionicons name={opt.icon} size={18} color={opt.accent} />
                  </View>
                  <Text style={[styles.snoozeOptionText, { color: colors.text }]}>{opt.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Bill image modal with zoom */}
      <Modal visible={showBillImageModal} transparent animationType="fade">
        <View style={styles.imageModalBackdrop}>
          <Pressable style={styles.imageModalCloseBtn} onPress={() => {
            setShowBillImageModal(false);
            scale.value = 1; // Reset zoom
          }}>
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </Pressable>
          
          <View style={styles.imageModalContainer}>
            <GestureDetector gesture={pinchGesture}>
              <Animated.View style={[styles.imageModalImageWrapper, animatedImageStyle]}>
                {bill.imageUrl && (
                  <Image 
                    source={{ uri: bill.imageUrl }} 
                    style={styles.imageModalImageFull} 
                    resizeMode="contain" 
                  />
                )}
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      </Modal>

      </View>
    </GestureHandlerRootView>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#64748B',
  },
  headerOuter: {
    backgroundColor: '#4F46E5',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerDecoration1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDecoration2: {
    position: 'absolute',
    bottom: -80,
    left: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerCatIconPos: {
    position: 'absolute',
    top: 40,
    right: 20,
    opacity: 0.8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEditBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleMain: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  headerHero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  heroAmountBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroAmount: {
    fontFamily: 'Inter_900Black',
    fontSize: 48,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    marginTop: 12,
    textAlign: 'center',
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroStatusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    gap: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#1E293B',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    marginTop: 2,
  },
  statusBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 12,
    paddingLeft: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  aiBadgeText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    color: '#7C3AED',
  },
  insightCard: {
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 3,
    backgroundColor: '#FFFFFF',
  },
  insightGradient: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  insightIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 2,
  },
  insightDesc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 14,
  },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyDate: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#1E293B',
  },
  historyStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#10B981',
    marginTop: 1,
  },
  historyAmount: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
    color: '#1E293B',
  },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
  },
  viewMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  emptyBillCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  emptyBillIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyBillTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 6,
  },
  emptyBillDesc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  addScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  addScanBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#4F46E5',
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#64748B',
  },
  metaValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#1E293B',
  },
  billImageContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 200,
    elevation: 3,
    backgroundColor: '#000',
  },
  billImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  billImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  billImageOverlayText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  bottomBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bottomBtnMain: {
    width: '100%',
    height: 60,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  bottomBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    flexShrink: 1,
  },
  bottomBtnTextMain: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 18,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  modalBackdropFull: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  fullSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '85%',
    paddingTop: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  sheetTitleBig: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 24,
    color: '#1E293B',
  },
  sheetScroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  editGrid: {
    gap: 24,
    paddingBottom: 40,
  },
  editSection: {
    gap: 16,
  },
  editSectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#475569',
    paddingLeft: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#1E293B',
  },
  saveBtnAction: {
    margin: 24,
    marginTop: 0,
  },
  saveGradientAction: {
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  saveBtnTextAction: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 25,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalImageWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalImageFull: {
    width: '100%',
    height: '100%',
  },
  modalBackdropCentered: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCardCentered: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#1E293B',
    textAlign: 'center',
  },
  snoozeGrid: {
    gap: 12,
  },
  snoozeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  snoozeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
    color: '#1E293B',
  },
  sheetSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 20,
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
    paddingVertical: 10,
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
    borderWidth: 0,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  repeatRowActive: {
    backgroundColor: '#EEF2FF',
  },
  repeatLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#111827',
  },
  repeatLabelActive: {
    color: '#4F46E5',
    fontFamily: 'Inter_600SemiBold',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flex: 1,
  },
});

