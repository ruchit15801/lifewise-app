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
import Colors from '@/constants/colors';
import { useExpenses } from '@/lib/expense-context';
import {
  CATEGORIES,
  formatCurrency,
  formatTime,
  getDateLabel,
  CategoryType,
  Transaction,
} from '@/lib/data';

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

function TransactionItem({ item }: { item: Transaction }) {
  const cat = CATEGORIES[item.category];
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: cat.color + '15' }]}>
        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txMerchant}>{item.merchant}</Text>
        <Text style={styles.txUpi}>{item.upiId}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={styles.txAmount}>- {formatCurrency(item.amount)}</Text>
        <Text style={styles.txTimeText}>{formatTime(item.date)}</Text>
      </View>
    </View>
  );
}

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
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
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: topInset + 16 }]}>
        <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(500) : undefined}>
          <Text style={styles.screenTitle}>Activity</Text>
          <Text style={styles.totalText}>
            Total: <Text style={styles.totalAmount}>{formatCurrency(totalFiltered)}</Text>
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
                  activeFilter === opt.key && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === opt.key && styles.filterChipTextActive,
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
        renderItem={({ item }) => <TransactionItem item={item} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>
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
    backgroundColor: Colors.dark.bg,
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
    color: Colors.dark.text,
  },
  totalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  totalAmount: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.accent,
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
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent + '50',
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.dark.accent,
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
    color: Colors.dark.textSecondary,
  },
  sectionTotal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.dark.textTertiary,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.card,
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
    color: Colors.dark.text,
  },
  txUpi: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginTop: 3,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.dark.danger,
  },
  txTimeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.dark.textTertiary,
    marginTop: 3,
  },
  separator: {
    height: 8,
  },
});
