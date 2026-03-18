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
import { useRouter } from 'expo-router';
import Colors, { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useExpenses } from '@/lib/expense-context';
import { useTabBarContentInset } from '@/lib/tab-bar';
import { getIntentPolicy, getReminderIntentFromBill, type ReminderIntent } from '@/lib/reminder-intent';
import {
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

type FilterType = ReminderIntent;

const FILTER_TABS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'bills', label: 'Bills', icon: 'receipt' },
  { key: 'health', label: 'Health', icon: 'medkit' },
  { key: 'family', label: 'Family', icon: 'people' },
  { key: 'work', label: 'Work', icon: 'newspaper' },
  { key: 'tasks', label: 'Tasks', icon: 'shield-checkmark' },
  { key: 'subscriptions', label: 'Subs', icon: 'refresh' },
  { key: 'finance', label: 'Finance', icon: 'trending-up' },
  { key: 'habits', label: 'Habits', icon: 'water' },
  { key: 'travel', label: 'Travel', icon: 'globe' },
  { key: 'events', label: 'Events', icon: 'film' },
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
  return colors.accentMint;
}

function ReminderCard({
  bill,
  onMarkPaid,
  onSnooze,
  onEdit,
  onDelete,
  index,
  onPress,
}: {
  bill: Bill;
  onMarkPaid: () => void;
  onSnooze: () => void;
  onEdit: () => void;
  onDelete: () => void;
  index: number;
  onPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const [showActions, setShowActions] = useState(false);
  const effectiveDate = (bill.status === 'snoozed' && bill.snoozedUntil) ? bill.snoozedUntil : bill.dueDate;
  const daysLeft = getDaysUntil(effectiveDate);
  const urgencyColor = bill.status === 'paid' ? colors.accentMint : bill.status === 'snoozed' ? colors.accentBlue : getUrgencyColor(daysLeft, colors);
  const dueDate = new Date(bill.dueDate);
  const isPaid = bill.status === 'paid' || bill.isPaid;
  const isSnoozed = bill.status === 'snoozed';

  const repeatLabel = REPEAT_OPTIONS.find(r => r.key === bill.repeatType)?.label || '';
  const intent = getReminderIntentFromBill(bill);
  const policy = getIntentPolicy(intent);
  const showAmount = policy.shouldHaveAmount && bill.amount > 0;
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

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(150 + index * 60).duration(400) : undefined}>
      <Pressable onPress={onPress} disabled={!onPress}>
        <View style={[styles.reminderCard, { backgroundColor: colors.card, borderColor: colors.border }, isPaid && styles.reminderCardPaid]}>
          <View style={styles.reminderTop}>
          <View style={[styles.reminderIcon, { backgroundColor: urgencyColor + '15' }]}>
            <Ionicons name={bill.icon as any} size={22} color={urgencyColor} />
          </View>
          <View style={styles.reminderInfo}>
            <Text style={[styles.reminderName, { color: colors.text }, isPaid && { textDecorationLine: 'line-through' as const, color: colors.textTertiary }]} numberOfLines={1}>
              {bill.name}
            </Text>
            <View style={styles.reminderMetaRow}>
              <View style={[styles.typeBadge, { backgroundColor: intentMeta.color + '15' }]}>
                <Text style={[styles.typeBadgeText, { color: intentMeta.color }]}>{intentMeta.label}</Text>
              </View>
              {policy.showRepeat && (
                <View style={styles.repeatBadge}>
                  <Ionicons name="refresh" size={10} color={colors.textTertiary} />
                  <Text style={[styles.repeatText, { color: colors.textTertiary }]}>{repeatLabel}</Text>
                </View>
              )}
            </View>
            {policy.showDue ? (
              <Text style={[styles.reminderDue, { color: urgencyColor }]}>
                {isPaid ? 'Paid' : isSnoozed ? 'Snoozed' : daysLeft <= 0 ? 'Overdue' : daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`}
                <Text style={[styles.reminderDate, { color: colors.textTertiary }]}>
                  {'  '}
                  {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </Text>
            ) : null}
          </View>
          <View style={styles.reminderRight}>
            <Text
              style={[
                styles.reminderAmount,
                { color: colors.text, opacity: showAmount ? 1 : 0 },
                isPaid && { color: colors.textTertiary, textDecorationLine: 'line-through' as const },
              ]}
            >
              {formatAmount(bill.amount)}
            </Text>
          </View>
        </View>

        <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
              onMarkPaid();
            }}
            style={[styles.cardActionBtn, { backgroundColor: isPaid ? colors.warningDim : colors.accentMintDim }]}
            testID={`mark-paid-${bill.id}`}
          >
            <Ionicons name={isPaid ? 'close' : 'checkmark'} size={18} color={isPaid ? colors.warning : colors.accentMint} />
          </Pressable>
          {!isPaid && (
            <Pressable
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                onSnooze();
              }}
              style={[styles.cardActionBtn, { backgroundColor: colors.accentBlueDim }]}
            >
              <Ionicons name="time" size={18} color={colors.accentBlue} />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
              onEdit();
            }}
            style={[styles.cardActionBtn, { backgroundColor: colors.accentDim }]}
          >
            <Ionicons name="pencil" size={16} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
              onDelete();
            }}
            style={[styles.cardActionBtn, { backgroundColor: colors.dangerDim }]}
            testID={`delete-${bill.id}`}
          >
            <Ionicons name="trash" size={16} color={colors.danger} />
          </Pressable>
        </View>

        {isSnoozed && bill.snoozedUntil && (
          <View style={[styles.snoozeInfo, { backgroundColor: colors.accentBlueDim }]}>
            <Ionicons name="time" size={12} color={colors.accentBlue} />
            <Text style={[styles.snoozeInfoText, { color: colors.accentBlue }]}>
              Snoozed until {new Date(bill.snoozedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        )}
          </View>
        </Pressable>
    </Animated.View>
  );
}

function AddEditModal({
  visible,
  onClose,
  onSave,
  editBill,
  reminderSettings,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: Omit<Bill, 'id'> | Bill) => void;
  editBill: Bill | null;
  reminderSettings: { soundEnabled: boolean; vibrationEnabled: boolean; defaultReminderDays: number[] };
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
  }, [editBill, visible, reminderSettings]);

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
      const effectiveReminderDays =
        Array.isArray(reminderSettings.defaultReminderDays) &&
          reminderSettings.defaultReminderDays.length > 0
          ? reminderSettings.defaultReminderDays
          : [3, 1, 0];

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
        reminderDaysBefore: effectiveReminderDays,
      });
    }

    onClose();
  };

  const canSave = name.trim() && amount.trim();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20) }]}>
          <View style={[styles.modalGrabber, { backgroundColor: colors.textTertiary }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editBill ? 'Edit Reminder' : 'New Reminder'}</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
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
                    style={[styles.typeChip, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, isActive && { backgroundColor: config.color + '18', borderColor: config.color + '40' }]}
                  >
                    <Ionicons name={config.icon as any} size={16} color={isActive ? config.color : colors.textTertiary} />
                    <Text style={[styles.typeChipText, { color: colors.textTertiary }, isActive && { color: config.color }]}>{config.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Electricity Bill"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Amount</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
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
                  style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={daysOffset}
                  onChangeText={setDaysOffset}
                  placeholder="7"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Repeat</Text>
            <View style={styles.chipRow}>
              {REPEAT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setRepeatType(opt.key)}
                  style={[styles.chip, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, repeatType === opt.key && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]}
                >
                  <Text style={[styles.chipText, { color: colors.textTertiary }, repeatType === opt.key && { color: colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setCategory(opt.key)}
                  style={[styles.chip, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, category === opt.key && { backgroundColor: CATEGORIES[opt.key].color + '15', borderColor: CATEGORIES[opt.key].color + '40' }]}
                >
                  <Text style={[styles.chipText, { color: colors.textTertiary }, category === opt.key && { color: CATEGORIES[opt.key].color }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Icon</Text>
            <Pressable onPress={() => setShowIconPicker(!showIconPicker)} style={[styles.iconPickerToggle, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <View style={[styles.selectedIconWrap, { backgroundColor: colors.accent + '15' }]}>
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
                    style={[styles.iconOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, selectedIcon === icon && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]}
                  >
                    <Ionicons name={icon as any} size={22} color={selectedIcon === icon ? colors.accent : colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable
            onPress={handleSave}
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            disabled={!canSave}
            testID="save-reminder-btn"
          >
            <LinearGradient
              colors={canSave ? (colors.buttonGradient as unknown as [string, string]) : [colors.cardElevated, colors.cardElevated]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name={editBill ? 'checkmark' : 'add'} size={20} color={canSave ? '#FFFFFF' : colors.textTertiary} />
              <Text style={[styles.saveBtnText, { color: '#FFFFFF' }, !canSave && { color: colors.textTertiary }]}>
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
    { days: 1, label: '1 Day', icon: 'sunny' as const },
    { days: 2, label: '2 Days', icon: 'partly-sunny' as const },
    { days: 3, label: '3 Days', icon: 'cloud' as const },
    { days: 7, label: '1 Week', icon: 'calendar' as const },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <Pressable style={styles.snoozeOverlay} onPress={onClose}>
        <View style={[styles.snoozeSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.modalGrabberCentered, { backgroundColor: colors.textTertiary }]} />
          <Text style={[styles.snoozeTitle, { color: colors.text }]}>Snooze Reminder</Text>
          <Text style={[styles.snoozeSubtitle, { color: colors.textSecondary }]}>Remind me again in...</Text>
          {SNOOZE_OPTIONS.map(opt => (
            <Pressable
              key={opt.days}
              onPress={() => { onSnooze(opt.days); onClose(); }}
              style={[styles.snoozeOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
            >
              <View style={[styles.snoozeOptionIcon, { backgroundColor: colors.accentBlueDim }]}>
                <Ionicons name={opt.icon} size={18} color={colors.accentBlue} />
              </View>
              <Text style={[styles.snoozeOptionText, { color: colors.text }]}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
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
  const insets = useSafeAreaInsets();
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
        <View style={[styles.settingsContainer, { backgroundColor: colors.card, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20) }]}>
          <View style={[styles.modalGrabber, { backgroundColor: colors.textTertiary }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reminder Settings</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
            </Pressable>
          </View>

          <View style={styles.settingsContent}>
            <Text style={[styles.settingsSectionTitle, { color: colors.textSecondary }]}>Notify me before due date</Text>
            <View style={styles.dayChipsRow}>
              {[7, 3, 2, 1, 0].map(d => (
                <Pressable
                  key={d}
                  onPress={() => toggleDay(d)}
                  style={[styles.chip, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, days.includes(d) && { backgroundColor: colors.accentDim, borderColor: colors.accent + '40' }]}
                >
                  <Text style={[styles.chipText, { color: colors.textTertiary }, days.includes(d) && { color: colors.accent }]}>
                    {d === 0 ? 'Due day' : `${d}d before`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="volume-high" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Sound</Text>
              </View>
              <Switch
                value={sound}
                onValueChange={setSound}
                trackColor={{ false: colors.inputBg, true: colors.accent + '50' }}
                thumbColor={sound ? colors.accent : colors.textTertiary}
              />
            </View>

            <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.accentBlueDim }]}>
                  <Ionicons name="phone-portrait" size={18} color={colors.accentBlue} />
                </View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Vibration</Text>
              </View>
              <Switch
                value={vibration}
                onValueChange={setVibration}
                trackColor={{ false: colors.inputBg, true: colors.accent + '50' }}
                thumbColor={vibration ? colors.accent : colors.textTertiary}
              />
            </View>
          </View>

          <Pressable
            onPress={() => { onSave({ soundEnabled: sound, vibrationEnabled: vibration, defaultReminderDays: days }); onClose(); }}
            style={styles.saveBtn}
          >
            <LinearGradient
              colors={colors.buttonGradient as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={[styles.saveBtnText, { color: '#FFFFFF' }]}>Save Settings</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function BillsScreen() {
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarContentInset();
  const router = useRouter();
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
    return bills.filter(b => getReminderIntentFromBill(b) === activeFilter);
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

  const todayKey = new Date().toDateString();
  const todayBills = filteredBills.filter(
    (b) =>
      b.status !== 'paid' &&
      !b.isPaid &&
      new Date(b.dueDate).toDateString() === todayKey,
  );

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
          { paddingTop: topInset + 16, paddingBottom: tabBarInset.bottom },
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
                style={[styles.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="settings-btn"
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => { setEditBill(null); setShowAddModal(true); }}
                testID="add-reminder-btn"
                accessibilityLabel="Add reminder"
              >
                <LinearGradient
                  colors={colors.buttonGradient as unknown as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addBtnGradient}
                >
                  <Ionicons name="add" size={22} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(80).duration(500) : undefined}>
          <LinearGradient
            colors={colors.heroGradient as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.overviewCard, { borderColor: colors.border }]}
          >
            <View style={styles.overviewRow}>
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Pending</Text>
                <Text style={[styles.overviewAmount, { color: colors.text }]}>{formatAmount(totalPending)}</Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Urgent</Text>
                <View style={styles.urgentWrap}>
                  <Text style={[styles.overviewAmountLarge, { color: colors.text }, urgentCount > 0 && { color: colors.danger }]}>
                    {urgentCount}
                  </Text>
                  {urgentCount > 0 && (
                    <View style={[styles.urgentDot, { backgroundColor: colors.danger }]} />
                  )}
                </View>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewLabel, { color: colors.textTertiary }]}>Subs</Text>
                <Text style={[styles.overviewAmount, { color: colors.text }]}>{formatAmount(subscriptionTotal)}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(120).duration(500) : undefined}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTER_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveFilter(tab.key)}
                style={[
                  styles.filterTab,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  activeFilter === tab.key && {
                    backgroundColor: colors.accentDim,
                    borderColor: colors.accent + '40',
                  },
                ]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={15}
                  color={activeFilter === tab.key ? colors.accent : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.filterTabText,
                    { color: colors.textTertiary },
                    activeFilter === tab.key && { color: colors.accent },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {todayBills.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Today ({todayBills.length})</Text>
            {todayBills
              .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate))
              .map((bill, idx) => (
                <ReminderCard
                  key={bill.id}
                  bill={bill}
                  onPress={() => router.push(`/bill-details/${bill.id}`)}
                  onMarkPaid={() => toggleBillPaid(bill.id)}
                  onSnooze={() => {
                    setSnoozeBillId(bill.id);
                    setShowSnoozeModal(true);
                  }}
                  onEdit={() => {
                    setEditBill(bill);
                    setShowAddModal(true);
                  }}
                  onDelete={() => handleDelete(bill.id)}
                  index={idx}
                />
              ))}
          </>
        )}

        {activeBills.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Upcoming ({activeBills.length})
            </Text>
            {activeBills.map((bill, idx) => (
              <ReminderCard
                key={bill.id}
                bill={bill}
                onPress={() => router.push(`/bill-details/${bill.id}`)}
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
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 28 }]}>
              Completed ({paidBills.length})
            </Text>
            {paidBills.map((bill, idx) => (
              <ReminderCard
                key={bill.id}
                bill={bill}
                onPress={() => router.push(`/bill-details/${bill.id}`)}
                onMarkPaid={() => toggleBillPaid(bill.id)}
                onSnooze={() => { }}
                onEdit={() => { setEditBill(bill); setShowAddModal(true); }}
                onDelete={() => handleDelete(bill.id)}
                index={idx}
              />
            ))}
          </>
        )}

        {filteredBills.length === 0 && (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="notifications-off" size={32} color={colors.accent} />
            </View>
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
        reminderSettings={reminderSettings}
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
          <View style={[styles.snoozeSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalGrabberCentered, { backgroundColor: colors.textTertiary }]} />
            <View style={[styles.deleteIconWrap, { backgroundColor: colors.dangerDim }]}>
              <Ionicons name="warning" size={28} color={colors.danger} />
            </View>
            <Text style={[styles.snoozeTitle, { color: colors.text }]}>Delete Reminder</Text>
            <Text style={[styles.snoozeSubtitle, { color: colors.textSecondary }]}>Are you sure you want to delete this reminder? This action cannot be undone.</Text>
            <View style={styles.deleteActions}>
              <Pressable
                onPress={() => setDeleteConfirmId(null)}
                style={[styles.deleteActionBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
                <Text style={[styles.deleteActionText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (deleteConfirmId) deleteReminder(deleteConfirmId); setDeleteConfirmId(null); }}
                style={[styles.deleteActionBtn, { backgroundColor: colors.dangerDim, borderColor: colors.danger + '30' }]}
                testID="confirm-delete-btn"
              >
                <Ionicons name="trash" size={18} color={colors.danger} />
                <Text style={[styles.deleteActionText, { color: colors.danger }]}>Delete</Text>
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
    fontSize: 30,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  addBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    borderRadius: 22,
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
    height: 40,
  },
  overviewLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  overviewAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  overviewAmountLarge: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  urgentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 12,
    marginBottom: 10,
  },
  filterTab: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterTabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginBottom: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  reminderCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
  },
  reminderCardPaid: {
    opacity: 0.5,
  },
  reminderTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    marginBottom: 5,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  reminderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reminderDue: {
    fontFamily: 'Inter_500Medium',
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
    marginLeft: 8,
  },
  reminderAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  cardActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  snoozeInfoText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalGrabberCentered: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
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
    fontSize: 22,
    letterSpacing: -0.3,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 18,
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
    borderRadius: 14,
    borderWidth: 1,
  },
  typeChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  input: {
    borderRadius: 14,
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
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  iconPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  selectedIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveBtnDisabled: {
    opacity: 0.45,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  snoozeSheet: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  snoozeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    marginBottom: 4,
    textAlign: 'center',
  },
  snoozeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
  },
  snoozeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  snoozeOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
  },
  settingsContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  settingsContent: {
    paddingHorizontal: 20,
  },
  settingsSectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 8,
  },
  dayChipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  deleteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  deleteActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
