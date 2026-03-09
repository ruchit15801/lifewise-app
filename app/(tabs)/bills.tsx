import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useExpenses } from '@/lib/expense-context';
import { formatCurrency, Bill } from '@/lib/data';

function getDaysUntil(dateStr: string): number {
  const now = new Date();
  const due = new Date(dateStr);
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(days: number): string {
  if (days <= 1) return Colors.dark.danger;
  if (days <= 5) return Colors.dark.warning;
  return Colors.dark.accent;
}

function BillCard({ bill, onToggle, index }: { bill: Bill; onToggle: () => void; index: number }) {
  const daysLeft = getDaysUntil(bill.dueDate);
  const urgencyColor = getUrgencyColor(daysLeft);
  const dueDate = new Date(bill.dueDate);

  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(200 + index * 80).duration(500) : undefined}>
      <View style={[styles.billCard, bill.isPaid && styles.billCardPaid]}>
        <View style={styles.billLeft}>
          <View style={[styles.billIcon, { backgroundColor: bill.isPaid ? Colors.dark.accent + '18' : urgencyColor + '18' }]}>
            <Ionicons
              name={bill.icon as any}
              size={20}
              color={bill.isPaid ? Colors.dark.accent : urgencyColor}
            />
          </View>
          <View style={styles.billInfo}>
            <Text style={[styles.billName, bill.isPaid && styles.billNamePaid]}>{bill.name}</Text>
            <Text style={styles.billDue}>
              {bill.isPaid
                ? 'Paid'
                : daysLeft <= 0
                  ? 'Overdue'
                  : daysLeft === 1
                    ? 'Due tomorrow'
                    : `Due in ${daysLeft} days`}
            </Text>
            <Text style={styles.billDate}>
              {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        </View>

        <View style={styles.billRight}>
          <Text style={[styles.billAmount, bill.isPaid && styles.billAmountPaid]}>
            {formatCurrency(bill.amount)}
          </Text>
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              onToggle();
            }}
            testID={`bill-toggle-${bill.id}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: bill.isPaid }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              styles.toggleBtn,
              bill.isPaid && styles.toggleBtnActive,
            ]}
          >
            {bill.isPaid ? (
              <Ionicons name="checkmark" size={16} color={Colors.dark.bg} />
            ) : (
              <View style={styles.toggleEmpty} />
            )}
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  const { bills, isLoading, toggleBillPaid } = useExpenses();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const unpaidBills = bills.filter(b => !b.isPaid).sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));
  const paidBills = bills.filter(b => b.isPaid);
  const totalPending = unpaidBills.reduce((s, b) => s + b.amount, 0);
  const urgentCount = unpaidBills.filter(b => getDaysUntil(b.dueDate) <= 3).length;

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
          <Text style={styles.screenTitle}>Bill Reminders</Text>
          <Text style={styles.screenSubtitle}>Stay on top of your payments</Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
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
                <Text style={styles.overviewLabel}>Bills Due</Text>
                <Text style={styles.overviewAmount}>{unpaidBills.length}</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Urgent</Text>
                <Text style={[styles.overviewAmount, urgentCount > 0 && { color: Colors.dark.danger }]}>
                  {urgentCount}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {unpaidBills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {unpaidBills.map((bill, idx) => (
              <BillCard
                key={bill.id}
                bill={bill}
                onToggle={() => toggleBillPaid(bill.id)}
                index={idx}
              />
            ))}
          </>
        )}

        {paidBills.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Paid</Text>
            {paidBills.map((bill, idx) => (
              <BillCard
                key={bill.id}
                bill={bill}
                onToggle={() => toggleBillPaid(bill.id)}
                index={idx}
              />
            ))}
          </>
        )}

        {bills.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.dark.accent} />
            <Text style={styles.emptyTitle}>No bills to track</Text>
            <Text style={styles.emptySubtitle}>All bills will appear here</Text>
          </View>
        )}
      </ScrollView>
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
    marginBottom: 24,
  },
  overviewCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
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
    fontSize: 12,
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  overviewAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.dark.text,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  billCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  billCardPaid: {
    opacity: 0.6,
  },
  billLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  billIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  billInfo: {
    flex: 1,
  },
  billName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.text,
  },
  billNamePaid: {
    textDecorationLine: 'line-through' as const,
    color: Colors.dark.textTertiary,
  },
  billDue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 3,
  },
  billDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  billRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  billAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.dark.text,
  },
  billAmountPaid: {
    color: Colors.dark.textTertiary,
    textDecorationLine: 'line-through' as const,
  },
  toggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: Colors.dark.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  toggleEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
});
