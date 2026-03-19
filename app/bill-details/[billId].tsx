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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import { useCurrency } from '@/lib/currency-context';
import { REPEAT_OPTIONS, ReminderType, RepeatType, REMINDER_TYPE_CONFIG, type Bill } from '@/lib/data';
import { scheduleLocalNotification } from '@/lib/notifications';
import { getIntentPolicy, getReminderIntentFromBill } from '@/lib/reminder-intent';

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
  } = useExpenses();

  const bill = useMemo(() => bills.find((b) => b.id === billId), [bills, billId]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showBillImageModal, setShowBillImageModal] = useState(false);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [showRepeatPickerModal, setShowRepeatPickerModal] = useState(false);
  const [draftTime, setDraftTime] = useState<Date>(() => (bill ? new Date(bill.dueDate) : new Date()));
  const [draftRepeat, setDraftRepeat] = useState<RepeatType>(() => (bill ? bill.repeatType : 'none'));
  const [tempTime, setTempTime] = useState<Date>(() => (bill ? new Date(bill.dueDate) : new Date()));
  const [tempRepeat, setTempRepeat] = useState<RepeatType>(() => (bill ? bill.repeatType : 'none'));

  // Keep temp values synced when the selected bill changes.
  React.useEffect(() => {
    if (!bill) return;
    setTempTime(new Date(bill.dueDate));
    setTempRepeat(bill.repeatType);
    setDraftTime(new Date(bill.dueDate));
    setDraftRepeat(bill.repeatType);
  }, [bill]);

  const isPaid = bill ? bill.status === 'paid' || bill.isPaid : false;

  const dueDate = bill ? new Date(bill.dueDate) : null;
  const repeatLabel = bill ? formatRepeat(bill.repeatType) : '';
  const typeConfig = bill ? REMINDER_TYPE_CONFIG[bill.reminderType as ReminderType] : null;
  const intent = getReminderIntentFromBill(bill);
  const policy = getIntentPolicy(intent);
  const intentMeta = (() => {
    switch (intent) {
      case 'bills':
        return { label: 'Bills', color: '#F59E0B' };
      case 'subscriptions':
        return { label: 'Subscriptions', color: '#3B82F6' };
      case 'health':
        return { label: 'Health', color: '#10B981' };
      case 'habits':
        return { label: 'Habits', color: '#22C55E' };
      case 'family':
        return { label: 'Family', color: '#EC4899' };
      case 'work':
        return { label: 'Work', color: '#3B82F6' };
      case 'tasks':
        return { label: 'Tasks', color: '#F59E0B' };
      case 'finance':
        return { label: 'Finance', color: '#8B5CF6' };
      case 'travel':
        return { label: 'Travel', color: '#60A5FA' };
      case 'events':
        return { label: 'Events', color: '#A855F7' };
      case 'custom':
      default:
        return { label: 'Custom', color: '#4F46E5' };
    }
  })();
  const showAmount = !!bill && policy.shouldHaveAmount && bill.amount > 0;
  const hasBillImage = !!bill.imageUrl;

  const headerTop = Platform.OS === 'web' ? 36 : insets.top + 8;
  const contentPadBottom = Math.max(insets.bottom, 16);

  async function onSaveEdit() {
    if (!bill) return;
    const nextDue = new Date(bill.dueDate);
    if (policy.showDue) {
      nextDue.setHours(tempTime.getHours(), tempTime.getMinutes(), 0, 0);
    }

    let nextRepeat: RepeatType = bill.repeatType;
    if (!policy.showRepeat) {
      nextRepeat = 'none';
    } else if (policy.repeatMode === 'fixed') {
      nextRepeat = policy.forcedRepeatType ?? tempRepeat;
    } else {
      nextRepeat = tempRepeat;
    }

    const updated: Bill = {
      ...bill,
      dueDate: nextDue.toISOString(),
      repeatType: nextRepeat,
      status: 'active',
      snoozedUntil: undefined,
    };

    editReminder(updated);

    // Best-effort reschedule (non Expo Go: schedules, Expo Go: no-op).
    scheduleLocalNotification({
      title: 'Reminder',
      body: bill.name,
      data: { type: 'reminder', billId: bill.id },
      triggerAt: nextDue,
    }).catch(() => {});

    setShowEditModal(false);
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
          : 'Active';

  const snoozedUntilLabel =
    bill.status === 'snoozed' && bill.snoozedUntil
      ? `Until ${new Date(bill.snoozedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      : null;

  return (
    <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop, paddingBottom: 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reminder</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Body */}
      <View style={[styles.content, { paddingBottom: contentPadBottom }]}>
        <View style={[styles.card, { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }]}>
          <View style={styles.cardTop}>
            <View style={[styles.iconWrap, { backgroundColor: intentMeta.color + '15' }]}>
              <Ionicons
                name={bill.icon as any}
                size={20}
                color={intentMeta.color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {bill.name}
              </Text>
              <View style={styles.metaRow}>
                <View style={[styles.badge, { backgroundColor: intentMeta.color + '15' }]}>
                  <Text style={[styles.badgeText, { color: intentMeta.color }]}>
                    {intentMeta.label}
                  </Text>
                </View>
                {policy.showRepeat && (
                  <View style={[styles.badge, { backgroundColor: colors.accentDim }]}>
                    <Ionicons name="repeat" size={12} color={colors.accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.badgeText, { color: colors.accent }]}>{repeatLabel}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.detailRows}>
            {policy.showDue ? (
              <View style={styles.detailRow}>
                <Ionicons name="time" size={16} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Due</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {dueDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                    {dueDate?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                  {snoozedUntilLabel ? (
                    <Text style={[styles.subtle, { color: colors.textTertiary }]}>{snoozedUntilLabel}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {showAmount ? (
              <View style={styles.detailRow}>
                <Ionicons name="wallet" size={16} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formatAmount(bill.amount)}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <Ionicons name={bill.status === 'paid' ? 'checkmark-circle' : 'sparkles'} size={16} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{statusLabel}</Text>
              </View>
            </View>

            {hasBillImage && (
              <Pressable
                onPress={() => setShowBillImageModal(true)}
                style={styles.billImagePreviewWrap}
              >
                <Image
                  source={{ uri: bill.imageUrl }}
                  style={styles.billImagePreview}
                  resizeMode="cover"
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* Actions (Apple-like bottom buttons) */}
        <View style={{ flex: 1 }} />

        {isPaid ? (
          <View style={[styles.doneCard, { backgroundColor: colors.accentMintDim, borderColor: 'transparent' }]}>
            <Ionicons name="checkmark-circle" size={22} color={colors.accentMint} />
            <Text style={[styles.doneTitle, { color: colors.text }]}>Reminder completed</Text>
            <Text style={[styles.doneSub, { color: colors.textTertiary }]}>You can still view details.</Text>
          </View>
        ) : null}

        <View style={[styles.bottomActionsRow, { paddingBottom: insets.bottom ? 10 : 10 }]}>
          <Pressable
            style={[styles.bottomActionBtn, { backgroundColor: '#4F46E5' }]}
            onPress={() => setShowEditModal(true)}
          >
            <Ionicons name="pencil" size={16} color="#FFFFFF" />
            <Text style={styles.bottomActionBtnText}>Edit</Text>
          </Pressable>

          <Pressable
            style={[
              styles.bottomActionBtn,
              {
                backgroundColor: '#EA580C',
                opacity: isPaid ? (hasBillImage ? 1 : 0.6) : 1,
              },
            ]}
            disabled={isPaid ? !hasBillImage : false}
            onPress={() => {
              if (isPaid) {
                if (hasBillImage) setShowBillImageModal(true);
                return;
              }
              setShowSnoozeModal(true);
            }}
          >
            <Ionicons
              name={isPaid ? 'image' : 'time-outline'}
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.bottomActionBtnText}>{isPaid ? 'Photo' : 'Snooze'}</Text>
          </Pressable>

          {!isPaid ? (
            <Pressable
              style={[styles.bottomActionBtn, { backgroundColor: '#10B981' }]}
              onPress={onToggleDone}
            >
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.bottomActionBtnText}>Done</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.bottomActionBtn, { backgroundColor: '#F1F5F9' }]}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              <Text style={[styles.bottomActionBtnText, { color: colors.textSecondary }]}>Back</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Edit modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowEditModal(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit time & repeat</Text>

            <View style={styles.schedulePanel}>
              {policy.showDue && (
                <>
                  <Pressable
                    style={styles.scheduleRow}
                    onPress={() => {
                      setDraftTime(tempTime);
                      setShowTimePickerModal(true);
                    }}
                  >
                    <View style={styles.scheduleLeft}>
                      <Ionicons name="time" size={16} color="#4F46E5" />
                      <Text style={styles.scheduleLabel}>Time</Text>
                    </View>
                    <View style={styles.scheduleRight}>
                      <Text style={styles.scheduleValue}>{timeLabelFromDate(tempTime)}</Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </View>
                  </Pressable>
                  {policy.showRepeat && <View style={styles.scheduleDivider} />}
                </>
              )}

              {policy.showRepeat && (
                <Pressable
                  style={styles.scheduleRow}
                  onPress={() => {
                    if (policy.repeatMode === 'fixed') return;
                    setDraftRepeat(tempRepeat);
                    setShowRepeatPickerModal(true);
                  }}
                  disabled={policy.repeatMode === 'fixed'}
                >
                  <View style={styles.scheduleLeft}>
                    <Ionicons name="repeat" size={16} color="#4F46E5" />
                    <Text style={styles.scheduleLabel}>Repeat</Text>
                  </View>
                  <View style={styles.scheduleRight}>
                    <Text style={styles.scheduleValue}>
                      {formatRepeat(
                        policy.repeatMode === 'fixed' ? (policy.forcedRepeatType ?? tempRepeat) : tempRepeat,
                      )}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={policy.repeatMode === 'fixed' ? '#D1D5DB' : '#9CA3AF'}
                    />
                  </View>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.sheetSaveBtn} onPress={onSaveEdit}>
              <LinearGradient
                colors={['#A855F7', '#60A5FA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sheetSaveGradient}
              >
                <Text style={styles.sheetSaveText}>Save changes</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Time picker modal */}
      <Modal transparent visible={showTimePickerModal} animationType="fade">
        <View style={styles.modalBackdropCentered}>
          <View style={styles.modalCardCentered}>
            <Text style={styles.modalTitle}>Select time</Text>
            <View style={styles.timePickerWrap}>
              <DateTimePicker
                value={draftTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (!d) return;
                  setDraftTime(d);
                }}
              />
            </View>
            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowTimePickerModal(false)} style={styles.modalTextButton}>
                <Text style={styles.modalTextButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTempTime(draftTime);
                  setShowTimePickerModal(false);
                }}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryButtonLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSnoozeModal(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Snooze reminder</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>Remind me again in…</Text>

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

      {/* Bill image modal */}
      <Modal visible={showBillImageModal} transparent animationType="fade">
        <Pressable style={styles.imageModalBackdrop} onPress={() => setShowBillImageModal(false)}>
          <View style={[styles.imageModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {bill.imageUrl ? (
              <Image source={{ uri: bill.imageUrl }} style={styles.imageModalImage} resizeMode="contain" />
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  detailRows: { gap: 10 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  detailValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginTop: 2,
  },
  subtle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  doneBtn: {
    marginTop: 12,
    borderWidth: 0,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  doneText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
  },
  doneCard: {
    marginTop: 16,
    borderWidth: 0,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  doneTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
  },
  doneSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
  },
  sheet: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    marginBottom: 18,
  },
  sheetHandle: {
    width: 60,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginBottom: 14,
  },
  pickerWrap: {
    marginTop: 6,
    marginBottom: 10,
  },
  sheetSectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  repeatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  repeatItem: {
    borderWidth: 0,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  repeatItemText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  sheetSaveBtn: {
    marginTop: 16,
  },
  sheetSaveGradient: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSaveText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  snoozeGrid: {
    gap: 10,
    marginTop: 14,
  },
  snoozeOption: {
    borderWidth: 0,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  snoozeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeOptionText: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  bottomActionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomActionBtnText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  billImagePreviewWrap: {
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  billImagePreview: {
    width: '100%',
    height: 150,
  },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  imageModalCard: {
    width: '100%',
    borderRadius: 22,
    padding: 10,
    borderWidth: 1,
  },
  imageModalImage: {
    width: '100%',
    height: 420,
    borderRadius: 16,
  },
  // --- Voice-reminder style: time + repeat picker UI (used inside Edit modal) ---
  schedulePanel: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: '#F2F7FF',
    borderWidth: 0,
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

  // --- Center popups for Time/Repeat selection ---
  modalBackdropCentered: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCardCentered: {
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
});

