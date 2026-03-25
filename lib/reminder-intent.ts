import type { Bill, RepeatType, ReminderType } from './data';
import type { CategoryType } from './data';

export type ReminderIntent =
  | 'all'
  | 'bills'
  | 'subscriptions'
  | 'health'
  | 'family'
  | 'work'
  | 'tasks'
  | 'finance'
  | 'habits'
  | 'travel'
  | 'events'
  | 'custom';

export type RepeatMode = 'hidden' | 'fixed' | 'editable';

export function getReminderIntentFromBill(bill: Bill): ReminderIntent {
  const icon = bill.icon || '';

  // These icon values are set by `voice-reminder.tsx` policy overrides and by scan-bill.
  if (icon === 'medkit') return 'health';
  if (icon === 'water') return 'habits';
  if (icon === 'people') return 'family';
  if (icon === 'newspaper') return 'work';
  if (icon === 'shield-checkmark') return 'tasks';
  if (icon === 'trending-up') return 'finance';
  if (icon === 'globe') return 'travel';
  if (icon === 'film') return 'events';

  if (icon === 'receipt') return 'bills';
  if (icon === 'refresh') return 'subscriptions';

  if (bill.reminderType === 'bill') return 'bills';
  if (bill.reminderType === 'subscription') return 'subscriptions';

  // Default: custom/other.
  return bill.reminderType === 'custom' ? 'custom' : 'custom';
}

export function shouldHaveAmountForIntent(intent: ReminderIntent): boolean {
  return intent === 'bills' || intent === 'subscriptions' || intent === 'finance';
}

export function getIntentPolicy(intent: ReminderIntent): {
  showDue: boolean;
  dueMode: 'hidden' | 'editable';
  showRepeat: boolean;
  repeatMode: RepeatMode;
  forcedRepeatType?: RepeatType;
  shouldHaveAmount: boolean;
} {
  // This matches your image logic table (X / ✓ / yearly / optional).
  switch (intent) {
    case 'health':
      return {
        showDue: false,
        dueMode: 'hidden',
        showRepeat: true,
        repeatMode: 'fixed',
        forcedRepeatType: 'daily',
        shouldHaveAmount: false,
      };
    case 'habits':
      return {
        showDue: false,
        dueMode: 'hidden',
        showRepeat: true,
        repeatMode: 'fixed',
        forcedRepeatType: 'daily',
        shouldHaveAmount: false,
      };
    case 'tasks':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: false,
        repeatMode: 'hidden',
        forcedRepeatType: 'none',
        shouldHaveAmount: false,
      };
    case 'travel':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: false,
        repeatMode: 'hidden',
        forcedRepeatType: 'none',
        shouldHaveAmount: false,
      };
    case 'events':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'fixed',
        forcedRepeatType: 'yearly',
        shouldHaveAmount: false,
      };
    case 'family':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: false,
      };
    case 'work':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: false,
      };
    case 'bills':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: true,
      };
    case 'subscriptions':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: true,
      };
    case 'finance':
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: true,
      };
    case 'custom':
    default:
      return {
        showDue: true,
        dueMode: 'editable',
        showRepeat: true,
        repeatMode: 'editable',
        shouldHaveAmount: false,
      };
  }
}

export function applyForcedRepeat(intent: ReminderIntent, repeatType: RepeatType): RepeatType {
  const policy = getIntentPolicy(intent);
  if (policy.repeatMode === 'fixed' && policy.forcedRepeatType) return policy.forcedRepeatType;
  return repeatType;
}

