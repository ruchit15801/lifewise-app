import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Colors, { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import {
  formatCurrency,
  Bill,
  ReminderType,
  RepeatType,
  REMINDER_TYPE_CONFIG,
  REPEAT_OPTIONS,
  ICON_OPTIONS,
  CATEGORIES,
  CategoryType,
  getDaysUntil,
} from '@/lib/data';

type FilterType = 'all' | 'bill' | 'subscription' | 'custom';

const FILTER_TABS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'bill', label: 'Bills', icon: 'receipt' },
  { key: 'subscription', label: 'Subs', icon: 'refresh' },
  { key: 'custom', label: 'Custom', icon: 'create' },
];

const CATEGORY_OPTIONS: { key: CategoryType; label: string }[] = [
  { key: 'bills', label: 'Bills & Utilities' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'food', label: 'Food & Dining' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'education', label: 'Education' },
  { key: 'others', label: 'Others' },
];

function getUrgencyColor(days: number, colors: ThemeColors): string {
  if (days <= 1) return colors.danger;
  if (days <= 5) return colors.warning;
  return colors.accent;
}

function ReminderCard({
  bill,
  onMarkPaid,
  onSnooze,
  onEdit,
  onDelete,
  index,
}: {
  bill: Bill;
  onMarkPaid: () => void;
  onSnooze: () => void;
  onEdit: () => void;
  onDelete: () => void;
  index: number;
}) {
  const { colors } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const effectiveDate = (bill.status === 'snoozed' && bill.snoozedUntil) ? bill.snoozedUntil : bill.dueDate;
  const daysLeft = getDaysUntil(effectiveDate);
  const urgencyColor = bill.status === 'paid' ? colors.accent : bill.status === 'snoozed' ? colors.accentBlue : getUrgencyColor(daysLeft, colors);
  const dueDate = new Date(bill.dueDate);
  const typeConfig = REMINDER_TYPE_CONFIG[bill.reminderType];
  const isPaid = bill.status === 'paid' || bill.isPaid;
  const isSnoozed = bill.status === 'snoozed';

  const repeatLabel = REPEAT_OPTIONS.find(r => r.key === bill.repeatType)?.label || '';

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(150 + index * 60).duration(400) : undefined}>
      <View style={[styles.reminderCard, { backgroundColor: colors.card, borderColor: colors.border }, isPaid && styles.reminderCardPaid]}>
        <View style={styles.reminderTop}>
          <View style={[styles.reminderIcon, { backgroundColor: urgencyColor + '18' }]}>
            <Ionicons name={bill.icon as any} size={20} color={urgencyColor} />
          </View>
          <View style={styles.reminderInfo}>
            <View style={styles.reminderNameRow}>
              <Text style={[styles.reminderName, { color: colors.text }, isPaid && { textDecorationLine: 'line-through' as const, color: colors.textTertiary }]} numberOfLines={1}>
                {bill.name}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
                <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
              </View>
            </View>
            <View style={styles.reminderMetaRow}>
              <Text style={[styles.reminderDue, { color: colors.textSecondary }]}>
                {isPaid ? 'Paid' : isSnoozed ? 'Snoozed' : daysLeft <= 0 ? 'Overdue' : daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`}
              </Text>
              {repeatLabel !== 'One-time' && (
                <View style={styles.repeatBadge}>
                  <Ionicons name="refresh" size={10} color={colors.textTertiary} />
                  <Text style={[styles.repeatText, { color: colors.textTertiary }]}>{repeatLabel}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.reminderDate, { color: colors.textTertiary }]}>
              {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.reminderRight}>
            <Text style={[styles.reminderAmount, { color: colors.text }, isPaid && { color: colors.textTertiary, textDecorationLine: 'line-through' as const }]}>
              {formatCurrency(bill.amount)}
            </Text>
            <Pressable
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setShowActions(!showActions);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`reminder-menu-${bill.id}`}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {showActions && (
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.accent + '18' }]}
              onPress={() => { onMarkPaid(); setShowActions(false); }}
              testID={`mark-paid-${bill.id}`}
            >
              <Ionicons name={isPaid ? 'close' : 'checkmark'} size={16} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.accent }]}>
                {isPaid ? 'Unpay' : 'Paid'}
              </Text>
            </Pressable>
            {!isPaid && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.accentBlue + '18' }]}
                onPress={() => { onSnooze(); setShowActions(false); }}
              >
                <Ionicons name="time" size={16} color={colors.accentBlue} />
                <Text style={[styles.actionText, { color: colors.accentBlue }]}>Snooze</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.warning + '18' }]}
              onPress={() => { onEdit(); setShowActions(false); }}
            >
              <Ionicons name="pencil" size={16} color={colors.warning} />
              <Text style={[styles.actionText, { color: colors.warning }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.danger + '18' }]}
              onPress={() => { onDelete(); setShowActions(false); }}
              testID={`delete-${bill.id}`}
            >
              <Ionicons name="trash" size={16} color={colors.danger} />
              <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}

        {isSnoozed && bill.snoozedUntil && (
          <View style={[styles.snoozeInfo, { borderTopColor: colors.border }]}>
            <Ionicons name="time" size={12} color={colors.accentBlue} />
            <Text style={[styles.snoozeInfoText, { color: colors.accentBlue }]}>
              Snoozed until {new Date(bill.snoozedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function AddEditModal({
  visible,
  onClose,
  onSave,
  editBill,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: Omit<Bill, 'id'> | Bill) => void;
  editBill: Bill | null;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [reminderType, setReminderType] = useState<ReminderType>('bill');
  const [repeatType, setRepeatType] = useState<RepeatType>('monthly');
  const [category, setCategory] = useState<CategoryType>('bills');
  const [selectedIcon, setSelectedIcon] = useState('flash');
  const [daysOffset, setDaysOffset] = useState('7');
  const [showIconPicker, setShowIconPicker] = useState(false);

  React.useEffect(() => {
    if (editBill) {
      setName(editBill.name);
      setAmount(editBill.amount.toString());
      setReminderType(editBill.reminderType);
      setRepeatType(editBill.repeatType);
      setCategory(editBill.category);
      setSelectedIcon(editBill.icon);
      const days = getDaysUntil(editBill.dueDate);
      setDaysOffset(Math.max(1, days).toString());
    } else {
      setName('');
      setAmount('');
      setReminderType('custom');
      setRepeatType('monthly');
      setCategory('bills');
      setSelectedIcon('flash');
      setDaysOffset('7');
    }
  }, [editBill, visible]);

  const handleSave = () => {
    if (!name.trim() || !amount.trim()) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const parsedDays = parseInt(daysOffset || '7', 10);
    const safeDays = isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : 7;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + safeDays);

    if (editBill) {
      onSave({
        ...editBill,
        name: name.trim(),
        amount: parsedAmount,
        dueDate: dueDate.toISOString(),
        category,
        icon: selectedIcon,
        reminderType,
        repeatType,
      });
    } else {
      onSave({
        name: name.trim(),
        amount: parsedAmount,
        dueDate: dueDate.toISOString(),
        category,
        isPaid: false,
        icon: selectedIcon,
        reminderType,
        repeatType,
        status: 'active' as const,
        reminderDaysBefore: [3, 1, 0],
      });
    }

    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bgSecondary, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20) }]}>
          <View style={[styles.modalGrabber, { backgroundColor: colors.textTertiary }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editBill ? 'Edit Reminder' : 'Add Reminder'}</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Type</Text>
            <View style={styles.typeRow}>
              {(['bill', 'subscription', 'custom'] as ReminderType[]).map(type => {
                const config = REMINDER_TYPE_CONFIG[type];
                const isActive = reminderType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setReminderType(type)}
                    style={[styles.typeChip, { backgroundColor: colors.card, borderColor: colors.border }, isActive && { backgroundColor: config.color + '20', borderColor: config.color + '50' }]}
                  >
                    <Ionicons name={config.icon as any} size={16} color={isActive ? config.color : colors.textTertiary} />
                    <Text style={[styles.typeChipText, { color: colors.textTertiary }, isActive && { color: config.color }]}>{config.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Electricity Bill"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Amount</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Due in (days)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  value={daysOffset}
                  onChangeText={setDaysOffset}
                  placeholder="7"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Repeat</Text>
            <View style={styles.repeatRow}>
              {REPEAT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setRepeatType(opt.key)}
                  style={[styles.repeatChip, { backgroundColor: colors.card, borderColor: colors.border }, repeatType === opt.key && { backgroundColor: colors.accentDim, borderColor: colors.accent + '50' }]}
                >
                  <Text style={[styles.repeatChipText, { color: colors.textTertiary }, repeatType === opt.key && { color: colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <View style={styles.repeatRow}>
              {CATEGORY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setCategory(opt.key)}
                  style={[styles.repeatChip, { backgroundColor: colors.card, borderColor: colors.border }, category === opt.key && { backgroundColor: CATEGORIES[opt.key].color + '20', borderColor: CATEGORIES[opt.key].color + '50' }]}
                >
                  <Text style={[styles.repeatChipText, { color: colors.textTertiary }, category === opt.key && { color: CATEGORIES[opt.key].color }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Icon</Text>
            <Pressable onPress={() => setShowIconPicker(!showIconPicker)} style={[styles.iconPickerToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.selectedIconWrap, { backgroundColor: colors.accent + '18' }]}>
                <Ionicons name={selectedIcon as any} size={20} color={colors.accent} />
              </View>
              <Text style={[styles.iconPickerText, { color: colors.textSecondary }]}>Tap to change icon</Text>
              <Ionicons name={showIconPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
            </Pressable>

            {showIconPicker && (
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map(icon => (
                  <Pressable
                    key={icon}
                    onPress={() => { setSelectedIcon(icon); setShowIconPicker(false); }}
                    style={[styles.iconOption, { backgroundColor: colors.card, borderColor: colors.border }, selectedIcon === icon && { backgroundColor: colors.accentDim, borderColor: colors.accent + '50' }]}
                  >
                    <Ionicons name={icon as any} size={22} color={selectedIcon === icon ? colors.accent : colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable
            onPress={handleSave}
            style={[styles.saveBtn, (!name.trim() || !amount.trim()) && styles.saveBtnDisabled]}
            disabled={!name.trim() || !amount.trim()}
            testID="save-reminder-btn"
          >
            <LinearGradient
              colors={name.trim() && amount.trim() ? (isDark ? [colors.accent, '#00B87A'] : [colors.accent, '#00A86B']) : [colors.cardElevated, colors.cardElevated]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name={editBill ? 'checkmark' : 'add'} size={20} color={name.trim() && amount.trim() ? colors.bg : colors.textTertiary} />
              <Text style={[styles.saveBtnText, { color: colors.bg }, (!name.trim() || !amount.trim()) && { color: colors.textTertiary }]}>
                {editBill ? 'Save Changes' : 'Add Reminder'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SnoozeModal({ visible, onClose, onSnooze }: { visible: boolean; onClose: () => void; onSnooze: (days: number) => void }) {
  const { colors } = useTheme();
  const SNOOZE_OPTIONS = [
    { days: 1, label: '1 Day' },
    { days: 2, label: '2 Days' },
    { days: 3, label: '3 Days' },
    { days: 7, label: '1 Week' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <Pressable style={styles.snoozeOverlay} onPress={onClose}>
        <View style={[styles.snoozeSheet, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.snoozeTitle, { color: colors.text }]}>Snooze Reminder</Text>
          <Text style={[styles.snoozeSubtitle, { color: colors.textSecondary }]}>Remind me again in...</Text>
          {SNOOZE_OPTIONS.map(opt => (
            <Pressable
              key={opt.days}
              onPress={() => { onSnooze(opt.days); onClose(); }}
              style={[styles.snoozeOption, { borderTopColor: colors.border }]}
            >
              <Ionicons name="time" size={18} color={colors.accentBlue} />
              <Text style={[styles.snoozeOptionText, { color: colors.text }]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function SettingsModal({
  visible,
  onClose,
  settings,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  settings: { soundEnabled: boolean; vibrationEnabled: boolean; defaultReminderDays: number[] };
  onSave: (s: { soundEnabled: boolean; vibrationEnabled: boolean; defaultReminderDays: number[] }) => void;
}) {
  const { colors } = useTheme();
  const [sound, setSound] = useState(settings.soundEnabled);
  const [vibration, setVibration] = useState(settings.vibrationEnabled);
  const [days, setDays] = useState<number[]>(settings.defaultReminderDays);

  React.useEffect(() => {
    setSound(settings.soundEnabled);
    setVibration(settings.vibrationEnabled);
    setDays(settings.defaultReminderDays);
  }, [settings, visible]);

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => b - a));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.settingsContainer, { backgroundColor: colors.bgSecondary }]}>
          <View style={[styles.modalGrabber, { backgroundColor: colors.textTertiary }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reminder Settings</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.settingsContent}>
            <Text style={[styles.settingsSectionTitle, { color: colors.textSecondary }]}>Notify me before due date</Text>
            <View style={styles.dayChipsRow}>
              {[7, 3, 2, 1, 0].map(d => (
                <Pressable
                  key={d}
                  onPress={() => toggleDay(d)}
                  style={[styles.dayChip, { backgroundColor: colors.card, borderColor: colors.border }, days.includes(d) && { backgroundColor: colors.accentDim, borderColor: colors.accent + '50' }]}
                >
                  <Text style={[styles.dayChipText, { color: colors.textTertiary }, days.includes(d) && { color: colors.accent }]}>
                    {d === 0 ? 'Due day' : `${d}d before`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high" size={20} color={colors.textSecondary} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>Sound</Text>
              </View>
              <Switch
                value={sound}
                onValueChange={setSound}
                trackColor={{ false: '#333', true: colors.accent + '50' }}
                thumbColor={sound ? colors.accent : '#666'}
              />
            </View>

            <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait" size={20} color={colors.textSecondary} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>Vibration</Text>
              </View>
              <Switch
                value={vibration}
                onValueChange={setVibration}
                trackColor={{ false: '#333', true: colors.accent + '50' }}
                thumbColor={vibration ? colors.accent : '#666'}
              />
            </View>
          </View>

          <Pressable
            onPress={() => { onSave({ soundEnabled: sound, vibrationEnabled: vibration, defaultReminderDays: days }); onClose(); }}
            style={[styles.settingsSaveBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.settingsSaveBtnText, { color: colors.bg }]}>Save Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function BillsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    bills, isLoading, toggleBillPaid, addReminder, editReminder, deleteReminder,
    snoozeReminder, reminderSettings, updateReminderSettings,
  } = useExpenses();

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [snoozeBillId, setSnoozeBillId] = useState<string | null>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const filteredBills = useMemo(() => {
    if (activeFilter === 'all') return bills;
    return bills.filter(b => b.reminderType === activeFilter);
  }, [bills, activeFilter]);

  const activeBills = filteredBills
    .filter(b => b.status !== 'paid' && !b.isPaid)
    .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));
  const paidBills = filteredBills.filter(b => b.status === 'paid' || b.isPaid);

  const totalPending = activeBills.reduce((s, b) => s + b.amount, 0);
  const urgentCount = activeBills.filter(b => getDaysUntil(b.dueDate) <= 3).length;
  const subscriptionTotal = bills
    .filter(b => b.reminderType === 'subscription' && b.status !== 'paid' && !b.isPaid)
    .reduce((s, b) => s + b.amount, 0);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (billId: string) => {
    if (Platform.OS === 'web') {
      setDeleteConfirmId(billId);
    } else {
      Alert.alert('Delete Reminder', 'Are you sure you want to delete this reminder?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteReminder(billId) },
      ]);
    }
  };

  const handleSave = (billData: Omit<Bill, 'id'> | Bill) => {
    if ('id' in billData) {
      editReminder(billData as Bill);
    } else {
      addReminder(billData);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 100 : 100 },
        ]}
      >
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.screenTitle, { color: colors.text }]}>Reminders</Text>
              <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>Bills, subscriptions & payments</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setShowSettingsModal(true)}
                style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="settings-btn"
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => { setEditBill(null); setShowAddModal(true); }}
                style={[styles.addBtn, { backgroundColor: colors.accent }]}
                testID="add-reminder-btn"
                accessibilityLabel="Add reminder"
              >
                <Ionicons name="add" size={22} color={colors.bg} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(80).duration(500) : undefined}>
          <LinearGradient
            colors={isDark ? ['#1A1A0F', '#17140D', '#1A100D'] : ['#FFF8E1', '#FFF3E0', '#FFEBEE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.overviewCard, { borderColor: colors.warning + '20' }]}
          >
            <View style={styles.overviewRow}>
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Pending</Text>
                <Text style={[styles.overviewAmount, { color: colors.text }]}>{formatCurrency(totalPending)}</Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Urgent</Text>
                <Text style={[styles.overviewAmount, { color: colors.text }, urgentCount > 0 && { color: colors.danger }]}>
                  {urgentCount}
                </Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Subs</Text>
                <Text style={[styles.overviewAmount, { color: colors.text }]}>{formatCurrency(subscriptionTotal)}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(120).duration(500) : undefined}>
          <View style={styles.filterRow}>
            {FILTER_TABS.map(tab => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveFilter(tab.key)}
                style={[styles.filterTab, { backgroundColor: colors.card, borderColor: colors.border }, activeFilter === tab.key && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={16}
                  color={activeFilter === tab.key ? colors.accent : colors.textTertiary}
                />
                <Text style={[styles.filterTabText, { color: colors.textTertiary }, activeFilter === tab.key && { color: colors.accent }]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {activeBills.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Upcoming ({activeBills.length})
            </Text>
            {activeBills.map((bill, idx) => (
              <ReminderCard
                key={bill.id}
                bill={bill}
                onMarkPaid={() => toggleBillPaid(bill.id)}
                onSnooze={() => { setSnoozeBillId(bill.id); setShowSnoozeModal(true); }}
                onEdit={() => { setEditBill(bill); setShowAddModal(true); }}
                onDelete={() => handleDelete(bill.id)}
                index={idx}
              />
            ))}
          </>
        )}

        {paidBills.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
              Completed ({paidBills.length})
            </Text>
            {paidBills.map((bill, idx) => (
              <ReminderCard
                key={bill.id}
                bill={bill}
                onMarkPaid={() => toggleBillPaid(bill.id)}
                onSnooze={() => {}}
                onEdit={() => { setEditBill(bill); setShowAddModal(true); }}
                onDelete={() => handleDelete(bill.id)}
                index={idx}
              />
            ))}
          </>
        )}

        {filteredBills.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeFilter === 'all' ? 'No reminders yet' : `No ${activeFilter} reminders`}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Tap + to add a new reminder</Text>
          </View>
        )}
      </ScrollView>

      <AddEditModal
        visible={showAddModal}
        onClose={() => { setShowAddModal(false); setEditBill(null); }}
        onSave={handleSave}
        editBill={editBill}
      />

      <SnoozeModal
        visible={showSnoozeModal}
        onClose={() => setShowSnoozeModal(false)}
        onSnooze={(days) => {
          if (snoozeBillId) snoozeReminder(snoozeBillId, days);
        }}
      />

      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={reminderSettings}
        onSave={updateReminderSettings}
      />

      <Modal visible={!!deleteConfirmId} animationType="fade" transparent>
        <Pressable style={styles.snoozeOverlay} onPress={() => setDeleteConfirmId(null)}>
          <View style={[styles.snoozeSheet, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.snoozeTitle, { color: colors.text }]}>Delete Reminder</Text>
            <Text style={[styles.snoozeSubtitle, { color: colors.textSecondary }]}>Are you sure you want to delete this reminder?</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable
                onPress={() => setDeleteConfirmId(null)}
                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.card, paddingVertical: 14 }]}
              >
                <Text style={[styles.actionText, { color: colors.textSecondary, fontSize: 14 }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (deleteConfirmId) deleteReminder(deleteConfirmId); setDeleteConfirmId(null); }}
                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.danger + '18', paddingVertical: 14 }]}
                testID="confirm-delete-btn"
              >
                <Ionicons name="trash" size={16} color={colors.danger} />
                <Text style={[styles.actionText, { color: colors.danger, fontSize: 14 }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewStat: {
    flex: 1,
    alignItems: 'center',
  },
  overviewDivider: {
    width: 1,
    height: 36,
  },
  overviewLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  overviewAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterTabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  reminderCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  reminderCardPaid: {
    opacity: 0.55,
  },
  reminderTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reminderName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  reminderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  reminderDue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  repeatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  reminderDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  reminderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  reminderAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  snoozeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  snoozeInfoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    borderWidth: 1,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  repeatRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  repeatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  repeatChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  iconPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  selectedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    flex: 1,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  saveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  snoozeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  snoozeSheet: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  snoozeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  snoozeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginBottom: 20,
  },
  snoozeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  snoozeOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  settingsContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  settingsContent: {
    paddingHorizontal: 20,
  },
  settingsSectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  dayChipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dayChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  settingsSaveBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  settingsSaveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
});
