import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useExpenses } from '@/lib/expense-context';
import {
  CATEGORIES,
  formatCurrency,
  formatTime,
  getDateLabel,
  CategoryType,
  Transaction,
} from '@/lib/data';
import { ThemeColors } from '@/constants/colors';

const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'transport', label: 'Transport' },
  { key: 'entertainment', label: 'Fun' },
  { key: 'bills', label: 'Bills' },
  { key: 'healthcare', label: 'Health' },
  { key: 'education', label: 'Edu' },
  { key: 'investment', label: 'Invest' },
  { key: 'others', label: 'Others' },
];

function TransactionItem({ item, colors }: { item: Transaction; colors: ThemeColors }) {
  const cat = CATEGORIES[item.category];
  return (
    <View style={[styles.txRow, { backgroundColor: colors.card }]}>
      <View style={[styles.txIcon, { backgroundColor: cat.color + '15' }]}>
        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={[styles.txMerchant, { color: colors.text }]}>{item.merchant}</Text>
        <Text style={[styles.txUpi, { color: colors.textTertiary }]}>{item.upiId}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: colors.danger }]}>- {formatCurrency(item.amount)}</Text>
        <Text style={[styles.txTimeText, { color: colors.textTertiary }]}>{formatTime(item.date)}</Text>
      </View>
    </View>
  );
}

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { transactions, isLoading } = useExpenses();
  const [activeFilter, setActiveFilter] = useState('all');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return transactions;
    return transactions.filter(tx => tx.category === activeFilter);
  }, [transactions, activeFilter]);

  const sections = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    filtered.forEach(tx => {
      const label = getDateLabel(tx.date);
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(tx);
    });
    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data,
      total: data.reduce((s, tx) => s + tx.amount, 0),
    }));
  }, [filtered]);

  const totalFiltered = filtered.reduce((s, tx) => s + tx.amount, 0);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.headerArea, { paddingTop: topInset + 16 }]}>
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Activity</Text>
          <Text style={[styles.totalText, { color: colors.textSecondary }]}>
            Total: <Text style={[styles.totalAmount, { color: colors.accent }]}>{formatCurrency(totalFiltered)}</Text>
          </Text>
        </Animated.View>

        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(500) : undefined}>
          <View style={styles.filterRow}>
            {FILTER_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                onPress={() => setActiveFilter(opt.key)}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  activeFilter === opt.key && { backgroundColor: colors.accentDim, borderColor: colors.accent + '50' },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.textSecondary },
                    activeFilter === opt.key && { color: colors.accent },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <TransactionItem item={item} colors={colors} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
            <Text style={[styles.sectionTotal, { color: colors.textTertiary }]}>
              {formatCurrency((section as any).total)}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === 'web' ? 100 : 100,
        }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
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
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
  },
  totalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  totalAmount: {
    fontFamily: 'Inter_600SemiBold',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  sectionTotal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txMerchant: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  txUpi: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  txTimeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  separator: {
    height: 8,
  },
});
