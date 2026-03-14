import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useCurrency } from '@/lib/currency-context';
import { useExpenses } from '@/lib/expense-context';
import { CATEGORIES, CategoryType, getMonthlySpending } from '@/lib/data';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  cards?: AnalysisCard[];
}

interface AnalysisCard {
  label: string;
  value: string;
  icon: string;
  color: string;
}

const QUICK_CHIPS = [
  { label: 'Can I buy?', query: 'afford' },
  { label: 'Food spending', query: 'food' },
  { label: 'Savings status', query: 'savings' },
  { label: 'Spending trends', query: 'trends' },
  { label: 'Top merchants', query: 'merchants' },
  { label: 'Budget check', query: 'budget' },
];

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const { transactions, bills, leaks, monthlyBudget } = useExpenses();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      text: 'Hi! I\'m your LifeWise Assistant. I can help you make smarter financial decisions. Ask me anything about your spending!',
      isUser: false,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const monthlySpend = useMemo(() => getMonthlySpending(transactions), [transactions]);

  const categoryTotals = useMemo(() => {
    const totals: Partial<Record<CategoryType, number>> = {};
    transactions.forEach(tx => {
      if (tx.isDebit) {
        totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
      }
    });
    return totals;
  }, [transactions]);

  const merchantTotals = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
      map[tx.merchant] = (map[tx.merchant] || 0) + tx.amount;
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [transactions]);

  const generateResponse = useCallback((query: string): { text: string; cards?: AnalysisCard[] } => {
    const q = query.toLowerCase();

    if (q.includes('afford') || q.includes('buy') || q.includes('can i')) {
      const remaining = Math.max(0, monthlyBudget - monthlySpend);
      const dailyBudget = remaining / Math.max(1, 30 - new Date().getDate());
      return {
        text: remaining > 5000
          ? `You have ${formatAmount(remaining)} left in your budget this month. That's ${formatAmount(Math.round(dailyBudget))}/day. You're in a good position for a moderate purchase!`
          : `You have ${formatAmount(remaining)} remaining this month. I'd suggest holding off on non-essential purchases to stay on track.`,
        cards: [
          { label: 'Budget Left', value: formatAmount(remaining), icon: 'wallet', color: '#10B981' },
          { label: 'Daily Budget', value: formatAmount(Math.round(dailyBudget)), icon: 'today', color: '#3B82F6' },
          { label: 'Budget Used', value: `${Math.round((monthlySpend / monthlyBudget) * 100)}%`, icon: 'pie-chart', color: '#8B5CF6' },
        ],
      };
    }

    if (q.includes('food') || q.includes('dining') || q.includes('eat')) {
      const foodSpend = categoryTotals.food || 0;
      const foodTxCount = transactions.filter(tx => tx.category === 'food').length;
      return {
        text: `You've spent ${formatAmount(foodSpend)} on food this month across ${foodTxCount} transactions. That's ${formatAmount(Math.round(foodSpend / Math.max(1, foodTxCount)))} per order on average.`,
        cards: [
          { label: 'Food Total', value: formatAmount(foodSpend), icon: 'fast-food', color: '#F97316' },
          { label: 'Orders', value: String(foodTxCount), icon: 'receipt', color: '#EC4899' },
          { label: 'Avg Order', value: formatAmount(Math.round(foodSpend / Math.max(1, foodTxCount))), icon: 'calculator', color: '#6366F1' },
        ],
      };
    }

    if (q.includes('saving') || q.includes('save')) {
      const savings = Math.max(0, monthlyBudget - monthlySpend);
      const savingsRate = monthlyBudget > 0 ? Math.round((savings / monthlyBudget) * 100) : 0;
      const totalLeaks = leaks.reduce((s, l) => s + l.monthlyEstimate, 0);
      return {
        text: savingsRate > 20
          ? `Great job! You're saving ${savingsRate}% of your budget (${formatAmount(savings)}). You could save even more by addressing ${leaks.length} spending leaks.`
          : `Your savings rate is ${savingsRate}% (${formatAmount(savings)}). Try cutting back on recurring expenses to improve this.`,
        cards: [
          { label: 'Saved', value: formatAmount(savings), icon: 'shield-checkmark', color: '#10B981' },
          { label: 'Savings Rate', value: `${savingsRate}%`, icon: 'trending-up', color: '#3B82F6' },
          { label: 'Potential Savings', value: formatAmount(totalLeaks), icon: 'leaf', color: '#F59E0B' },
        ],
      };
    }

    if (q.includes('trend') || q.includes('pattern')) {
      const firstHalf = transactions.filter(tx => new Date(tx.date).getDate() <= 15 && tx.isDebit).reduce((s, tx) => s + tx.amount, 0);
      const secondHalf = transactions.filter(tx => new Date(tx.date).getDate() > 15 && tx.isDebit).reduce((s, tx) => s + tx.amount, 0);
      const dailyAvg = monthlySpend / Math.max(1, new Date().getDate());
      return {
        text: `Your spending this month: ${formatAmount(monthlySpend)}. ${firstHalf > secondHalf ? 'You spend more in the first half of the month.' : 'Your spending is fairly balanced.'} Daily average: ${formatAmount(Math.round(dailyAvg))}.`,
        cards: [
          { label: '1st Half', value: formatAmount(Math.round(firstHalf)), icon: 'arrow-up', color: '#EF4444' },
          { label: '2nd Half', value: formatAmount(Math.round(secondHalf)), icon: 'arrow-down', color: '#10B981' },
          { label: 'Daily Avg', value: formatAmount(Math.round(dailyAvg)), icon: 'analytics', color: '#8B5CF6' },
        ],
      };
    }

    if (q.includes('merchant') || q.includes('store') || q.includes('shop') || q.includes('where')) {
      const top3 = merchantTotals.slice(0, 3);
      return {
        text: `Your top merchants this month: ${top3.map(([m, v]) => `${m} (${formatAmount(v)})`).join(', ')}.`,
        cards: top3.map(([merchant, total], idx) => ({
          label: merchant,
          value: formatAmount(total),
          icon: idx === 0 ? 'trophy' : idx === 1 ? 'medal' : 'ribbon',
          color: idx === 0 ? '#F59E0B' : idx === 1 ? '#64748B' : '#B45309',
        })),
      };
    }

    if (q.includes('budget') || q.includes('limit')) {
      const used = Math.round((monthlySpend / monthlyBudget) * 100);
      const remaining = Math.max(0, monthlyBudget - monthlySpend);
      return {
        text: `You've used ${used}% of your monthly budget (${formatAmount(monthlyBudget)}). ${used > 80 ? 'Be careful - you\'re running low!' : 'You\'re on track!'}`,
        cards: [
          { label: 'Budget', value: formatAmount(monthlyBudget), icon: 'wallet', color: '#8B5CF6' },
          { label: 'Spent', value: formatAmount(monthlySpend), icon: 'card', color: '#EF4444' },
          { label: 'Remaining', value: formatAmount(remaining), icon: 'cash', color: '#10B981' },
        ],
      };
    }

    const topCat = Object.entries(categoryTotals).sort(([, a], [, b]) => (b as number) - (a as number))[0];
    return {
      text: `This month you've spent ${formatAmount(monthlySpend)} across ${transactions.length} transactions. ${topCat ? `Your biggest category is ${CATEGORIES[topCat[0] as CategoryType].label} at ${formatAmount(topCat[1] as number)}.` : ''} Try asking about specific areas like food spending, savings, or budget status!`,
    };
  }, [monthlySpend, monthlyBudget, categoryTotals, merchantTotals, transactions, leaks, formatAmount]);

  const handleSend = useCallback((text?: string) => {
    const query = text || inputText.trim();
    if (!query) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: query,
      isUser: true,
    };

    const response = generateResponse(query);
    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      text: response.text,
      isUser: false,
      cards: response.cards,
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setInputText('');

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [inputText, generateResponse]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => (
    <Animated.View
      entering={Platform.OS !== 'web' ? FadeInDown.delay(index * 30).duration(300) : undefined}
      style={[styles.msgRow, item.isUser && styles.msgRowUser]}
    >
      {!item.isUser && (
        <View style={[styles.botAvatar, { backgroundColor: colors.accentDim }]}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
        </View>
      )}
      <View style={[
        styles.msgBubble,
        item.isUser
          ? { backgroundColor: colors.accent }
          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
      ]}>
        <Text style={[
          styles.msgText,
          { color: item.isUser ? '#FFFFFF' : colors.text },
        ]}>
          {item.text}
        </Text>
        {item.cards && (
          <View style={styles.cardsGrid}>
            {item.cards.map((card, idx) => (
              <View key={idx} style={[styles.analysisCard, { backgroundColor: card.color + '10', borderColor: card.color + '20' }]}>
                <View style={[styles.analysisIconWrap, { backgroundColor: card.color + '15' }]}>
                  <Ionicons name={card.icon as any} size={16} color={card.color} />
                </View>
                <Text style={[styles.analysisLabel, { color: colors.textSecondary }]}>{card.label}</Text>
                <Text style={[styles.analysisValue, { color: colors.text }]}>{card.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Decision Assistant</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>AI-powered insights</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.chipsSection}>
            <Text style={[styles.chipsSectionTitle, { color: colors.textTertiary }]}>Quick questions</Text>
            <View style={styles.chipsRow}>
              {QUICK_CHIPS.map(chip => (
                <Pressable
                  key={chip.query}
                  onPress={() => handleSend(chip.label)}
                  style={[styles.quickChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.quickChipText, { color: colors.accent }]}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />

      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomInset }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your finances..."
          placeholderTextColor={colors.textTertiary}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
        />
        <Pressable onPress={() => handleSend()} style={styles.sendBtnWrap}>
          <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.sendBtn}>
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  messageList: { paddingHorizontal: 16, paddingBottom: 8 },
  chipsSection: { paddingVertical: 16, gap: 10 },
  chipsSectionTitle: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  quickChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  msgRow: { flexDirection: 'row', marginBottom: 16, gap: 10, alignItems: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },
  botAvatar: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  msgBubble: { maxWidth: '80%', borderRadius: 18, padding: 14 },
  msgText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  analysisCard: { flex: 1, minWidth: 90, borderRadius: 14, padding: 12, borderWidth: 1, gap: 6, alignItems: 'center' },
  analysisIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  analysisLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center' },
  analysisValue: { fontFamily: 'Inter_700Bold', fontSize: 14, textAlign: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 15 },
  sendBtnWrap: { borderRadius: 14, overflow: 'hidden' },
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
