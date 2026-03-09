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
import Colors from '@/constants/colors';
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

function getUrgencyColor(days: number): string {
  if (days <= 1) return Colors.dark.danger;
  if (days <= 5) return Colors.dark.warning;
  return Colors.dark.accent;
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
  const [showActions, setShowActions] = useState(false);
  const effectiveDate = (bill.status === 'snoozed' && bill.snoozedUntil) ? bill.snoozedUntil : bill.dueDate;
  const daysLeft = getDaysUntil(effectiveDate);
  const urgencyColor = bill.status === 'paid' ? Colors.dark.accent : bill.status === 'snoozed' ? Colors.dark.accentBlue : getUrgencyColor(daysLeft);
  const dueDate = new Date(bill.dueDate);
  const typeConfig = REMINDER_TYPE_CONFIG[bill.reminderType];
  const isPaid = bill.status === 'paid' || bill.isPaid;
  const isSnoozed = bill.status === 'snoozed';

  const repeatLabel = REPEAT_OPTIONS.find(r => r.key === bill.repeatType)?.label || '';

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(150 + index * 60).duration(400) : undefined}>
      <View style={[styles.reminderCard, isPaid && styles.reminderCardPaid]}>
        <View style={styles.reminderTop}>
          <View style={[styles.reminderIcon, { backgroundColor: urgencyColor + '18' }]}>
            <Ionicons name={bill.icon as any} size={20} color={urgencyColor} />
          </View>
          <View style={styles.reminderInfo}>
            <View style={styles.reminderNameRow}>
              <Text style={[styles.reminderName, isPaid && styles.reminderNamePaid]} numberOfLines={1}>
                {bill.name}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
                <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
              </View>
            </View>
            <View style={styles.reminderMetaRow}>
              <Text style={styles.reminderDue}>
                {isPaid ? 'Paid' : isSnoozed ? 'Snoozed' : daysLeft <= 0 ? 'Overdue' : daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`}
              </Text>
              {repeatLabel !== 'One-time' && (
                <View style={styles.repeatBadge}>
                  <Ionicons name="refresh" size={10} color={Colors.dark.textTertiary} />
                  <Text style={styles.repeatText}>{repeatLabel}</Text>
                </View>
              )}
            </View>
            <Text style={styles.reminderDate}>
              {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.reminderRight}>
            <Text style={[styles.reminderAmount, isPaid && styles.reminderAmountPaid]}>
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
              <Ionicons name="ellipsis-vertical" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>
        </View>

        {showActions && (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.dark.accent + '18' }]}
              onPress={() => { onMarkPaid(); setShowActions(false); }}
              testID={`mark-paid-${bill.id}`}
            >
              <Ionicons name={isPaid ? 'close' : 'checkmark'} size={16} color={Colors.dark.accent} />
              <Text style={[styles.actionText, { color: Colors.dark.accent }]}>
                {isPaid ? 'Unpay' : 'Paid'}
              </Text>
            </Pressable>
            {!isPaid && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.dark.accentBlue + '18' }]}
                onPress={() => { onSnooze(); setShowActions(false); }}
              >
                <Ionicons name="time" size={16} color={Colors.dark.accentBlue} />
                <Text style={[styles.actionText, { color: Colors.dark.accentBlue }]}>Snooze</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.dark.warning + '18' }]}
              onPress={() => { onEdit(); setShowActions(false); }}
            >
              <Ionicons name="pencil" size={16} color={Colors.dark.warning} />
              <Text style={[styles.actionText, { color: Colors.dark.warning }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.dark.danger + '18' }]}
              onPress={() => { onDelete(); setShowActions(false); }}
              testID={`delete-${bill.id}`}
            >
              <Ionicons name="trash" size={16} color={Colors.dark.danger} />
              <Text style={[styles.actionText, { color: Colors.dark.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}

        {isSnoozed && bill.snoozedUntil && (
          <View style={styles.snoozeInfo}>
            <Ionicons name="time" size={12} color={Colors.dark.accentBlue} />
            <Text style={styles.snoozeInfoText}>
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
        <View style={[styles.modalContainer, { paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalGrabber} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editBill ? 'Edit Reminder' : 'Add Reminder'}</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['bill', 'subscription', 'custom'] as ReminderType[]).map(type => {
                const config = REMINDER_TYPE_CONFIG[type];
                const isActive = reminderType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setReminderType(type)}
                    style={[styles.typeChip, isActive && { backgroundColor: config.color + '20', borderColor: config.color + '50' }]}
                  >
                    <Ionicons name={config.icon as any} size={16} color={isActive ? config.color : Colors.dark.textTertiary} />
                    <Text style={[styles.typeChipText, isActive && { color: config.color }]}>{config.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Electricity Bill"
              placeholderTextColor={Colors.dark.textTertiary}
            />

            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={Colors.dark.textTertiary}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Due in (days)</Text>
                <TextInput
                  style={styles.input}
                  value={daysOffset}
                  onChangeText={setDaysOffset}
                  placeholder="7"
                  placeholderTextColor={Colors.dark.textTertiary}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Repeat</Text>
            <View style={styles.repeatRow}>
              {REPEAT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setRepeatType(opt.key)}
                  style={[styles.repeatChip, repeatType === opt.key && styles.repeatChipActive]}
                >
                  <Text style={[styles.repeatChipText, repeatType === opt.key && styles.repeatChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.repeatRow}>
              {CATEGORY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setCategory(opt.key)}
                  style={[styles.repeatChip, category === opt.key && { backgroundColor: CATEGORIES[opt.key].color + '20', borderColor: CATEGORIES[opt.key].color + '50' }]}
                >
                  <Text style={[styles.repeatChipText, category === opt.key && { color: CATEGORIES[opt.key].color }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Icon</Text>
            <Pressable onPress={() => setShowIconPicker(!showIconPicker)} style={styles.iconPickerToggle}>
              <View style={[styles.selectedIconWrap, { backgroundColor: Colors.dark.accent + '18' }]}>
                <Ionicons name={selectedIcon as any} size={20} color={Colors.dark.accent} />
              </View>
              <Text style={styles.iconPickerText}>Tap to change icon</Text>
              <Ionicons name={showIconPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.dark.textTertiary} />
            </Pressable>

            {showIconPicker && (
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map(icon => (
                  <Pressable
                    key={icon}
                    onPress={() => { setSelectedIcon(icon); setShowIconPicker(false); }}
                    style={[styles.iconOption, selectedIcon === icon && styles.iconOptionActive]}
                  >
                    <Ionicons name={icon as any} size={22} color={selectedIcon === icon ? Colors.dark.accent : Colors.dark.textSecondary} />
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
              colors={name.trim() && amount.trim() ? [Colors.dark.accent, '#00B87A'] : ['#333', '#333']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name={editBill ? 'checkmark' : 'add'} size={20} color={name.trim() && amount.trim() ? Colors.dark.bg : Colors.dark.textTertiary} />
              <Text style={[styles.saveBtnText, (!name.trim() || !amount.trim()) && { color: Colors.dark.textTertiary }]}>
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
  const SNOOZE_OPTIONS = [
    { days: 1, label: '1 Day' },
    { days: 2, label: '2 Days' },
    { days: 3, label: '3 Days' },
    { days: 7, label: '1 Week' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <Pressable style={styles.snoozeOverlay} onPress={onClose}>
        <View style={styles.snoozeSheet}>
          <Text style={styles.snoozeTitle}>Snooze Reminder</Text>
          <Text style={styles.snoozeSubtitle}>Remind me again in...</Text>
          {SNOOZE_OPTIONS.map(opt => (
            <Pressable
              key={opt.days}
              onPress={() => { onSnooze(opt.days); onClose(); }}
              style={styles.snoozeOption}
            >
              <Ionicons name="time" size={18} color={Colors.dark.accentBlue} />
              <Text style={styles.snoozeOptionText}>{opt.label}</Text>
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
        <View style={[styles.settingsContainer]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reminder Settings</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.settingsContent}>
            <Text style={styles.settingsSectionTitle}>Notify me before due date</Text>
            <View style={styles.dayChipsRow}>
              {[7, 3, 2, 1, 0].map(d => (
                <Pressable
                  key={d}
                  onPress={() => toggleDay(d)}
                  style={[styles.dayChip, days.includes(d) && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipText, days.includes(d) && styles.dayChipTextActive]}>
                    {d === 0 ? 'Due day' : `${d}d before`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high" size={20} color={Colors.dark.textSecondary} />
                <Text style={styles.settingLabel}>Sound</Text>
              </View>
              <Switch
                value={sound}
                onValueChange={setSound}
                trackColor={{ false: '#333', true: Colors.dark.accent + '50' }}
                thumbColor={sound ? Colors.dark.accent : '#666'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait" size={20} color={Colors.dark.textSecondary} />
                <Text style={styles.settingLabel}>Vibration</Text>
              </View>
              <Switch
                value={vibration}
                onValueChange={setVibration}
                trackColor={{ false: '#333', true: Colors.dark.accent + '50' }}
                thumbColor={vibration ? Colors.dark.accent : '#666'}
              />
            </View>
          </View>

          <Pressable
            onPress={() => { onSave({ soundEnabled: sound, vibrationEnabled: vibration, defaultReminderDays: days }); onClose(); }}
            style={styles.settingsSaveBtn}
          >
            <Text style={styles.settingsSaveBtnText}>Save Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function BillsScreen() {
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
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
              <Text style={styles.screenTitle}>Reminders</Text>
              <Text style={styles.screenSubtitle}>Bills, subscriptions & payments</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setShowSettingsModal(true)}
                style={styles.headerIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="settings-btn"
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={Colors.dark.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => { setEditBill(null); setShowAddModal(true); }}
                style={styles.addBtn}
                testID="add-reminder-btn"
                accessibilityLabel="Add reminder"
              >
                <Ionicons name="add" size={22} color={Colors.dark.bg} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(80).duration(500) : undefined}>
          <LinearGradient
            colors={['#1A1A0F', '#17140D', '#1A100D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.overviewCard}
          >
            <View style={styles.overviewRow}>
              <View style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Pending</Text>
                <Text style={styles.overviewAmount}>{formatCurrency(totalPending)}</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Urgent</Text>
                <Text style={[styles.overviewAmount, urgentCount > 0 && { color: Colors.dark.danger }]}>
                  {urgentCount}
                </Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Subs</Text>
                <Text style={styles.overviewAmount}>{formatCurrency(subscriptionTotal)}</Text>
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
                style={[styles.filterTab, activeFilter === tab.key && styles.filterTabActive]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={16}
                  color={activeFilter === tab.key ? Colors.dark.accent : Colors.dark.textTertiary}
                />
                <Text style={[styles.filterTabText, activeFilter === tab.key && styles.filterTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {activeBills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
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
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
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
            <Ionicons name="notifications-off" size={48} color={Colors.dark.textTertiary} />
            <Text style={styles.emptyTitle}>
              {activeFilter === 'all' ? 'No reminders yet' : `No ${activeFilter} reminders`}
            </Text>
            <Text style={styles.emptySubtitle}>Tap + to add a new reminder</Text>
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
          <View style={styles.snoozeSheet}>
            <Text style={styles.snoozeTitle}>Delete Reminder</Text>
            <Text style={styles.snoozeSubtitle}>Are you sure you want to delete this reminder?</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable
                onPress={() => setDeleteConfirmId(null)}
                style={[styles.actionBtn, { flex: 1, backgroundColor: Colors.dark.card, paddingVertical: 14 }]}
              >
                <Text style={[styles.actionText, { color: Colors.dark.textSecondary, fontSize: 14 }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (deleteConfirmId) deleteReminder(deleteConfirmId); setDeleteConfirmId(null); }}
                style={[styles.actionBtn, { flex: 1, backgroundColor: Colors.dark.danger + '18', paddingVertical: 14 }]}
                testID="confirm-delete-btn"
              >
                <Ionicons name="trash" size={16} color={Colors.dark.danger} />
                <Text style={[styles.actionText, { color: Colors.dark.danger, fontSize: 14 }]}>Delete</Text>
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
    backgroundColor: Colors.dark.bg,
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
    color: Colors.dark.text,
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
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
    backgroundColor: Colors.dark.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.dark.warning + '20',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  overviewLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  overviewAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent + '40',
  },
  filterTabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
  filterTabTextActive: {
    color: Colors.dark.accent,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  reminderCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    color: Colors.dark.text,
    flex: 1,
  },
  reminderNamePaid: {
    textDecorationLine: 'line-through' as const,
    color: Colors.dark.textTertiary,
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
    color: Colors.dark.textSecondary,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  repeatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.dark.textTertiary,
  },
  reminderDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
  },
  reminderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  reminderAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.dark.text,
  },
  reminderAmountPaid: {
    color: Colors.dark.textTertiary,
    textDecorationLine: 'line-through' as const,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
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
    borderTopColor: Colors.dark.border,
  },
  snoozeInfoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.accentBlue,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.dark.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textTertiary,
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
    color: Colors.dark.text,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.dark.textSecondary,
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
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.textTertiary,
  },
  input: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  repeatChipActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent + '50',
  },
  repeatChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
  repeatChipTextActive: {
    color: Colors.dark.accent,
  },
  iconPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    color: Colors.dark.textSecondary,
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
    backgroundColor: Colors.dark.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconOptionActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent + '50',
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
    color: Colors.dark.bg,
  },
  snoozeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  snoozeSheet: {
    backgroundColor: Colors.dark.bgSecondary,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  snoozeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  snoozeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 20,
  },
  snoozeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  snoozeOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.dark.text,
  },
  settingsContainer: {
    backgroundColor: Colors.dark.bgSecondary,
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
    color: Colors.dark.textSecondary,
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
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dayChipActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent + '50',
  },
  dayChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
  dayChipTextActive: {
    color: Colors.dark.accent,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.dark.text,
  },
  settingsSaveBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.dark.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  settingsSaveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.dark.bg,
  },
});
