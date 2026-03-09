import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useCurrency, CURRENCIES, CurrencyOption } from '@/lib/currency-context';

function SettingRow({
  icon,
  label,
  rightElement,
  onPress,
  danger,
  colors,
}: {
  icon: string;
  label: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !rightElement}
      style={[styles.settingRow, { borderBottomColor: colors.border }]}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: danger ? colors.dangerDim : colors.accentDim }]}>
          <Ionicons name={icon as any} size={18} color={danger ? colors.danger : colors.accent} />
        </View>
        <Text style={[styles.settingLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      </View>
      {rightElement || (onPress && (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      ))}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { colors, mode, toggleTheme, isDark } = useTheme();
  const { currentCurrency, setCurrency } = useCurrency();
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [seniorMode, setSeniorMode] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  useEffect(() => {
    AsyncStorage.getItem('@spendiq_senior_mode').then(v => {
      if (v === 'true') setSeniorMode(true);
    }).catch(() => {});
  }, []);

  const toggleSeniorMode = (val: boolean) => {
    setSeniorMode(val);
    AsyncStorage.setItem('@spendiq_senior_mode', val ? 'true' : 'false');
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      logout().then(() => router.replace('/(auth)/login'));
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => logout().then(() => router.replace('/(auth)/login')) },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 16, paddingBottom: bottomInset + 20 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={10} testID="settings-back">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="person" size={28} color={colors.accent} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'User'}</Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email || 'user@email.com'}</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Appearance</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="moon"
            label="Dark Mode"
            colors={colors}
            rightElement={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.inputBorder, true: colors.accent + '50' }}
                thumbColor={isDark ? colors.accent : '#ccc'}
              />
            }
          />
          <SettingRow
            icon="accessibility"
            label="Senior Mode"
            colors={colors}
            rightElement={
              <Switch
                value={seniorMode}
                onValueChange={toggleSeniorMode}
                trackColor={{ false: colors.inputBorder, true: colors.accent + '50' }}
                thumbColor={seniorMode ? colors.accent : '#ccc'}
              />
            }
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Preferences</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="cash"
            label="Currency"
            colors={colors}
            onPress={() => setShowCurrencyPicker(true)}
            rightElement={
              <Pressable onPress={() => setShowCurrencyPicker(true)} style={styles.currencyBadge}>
                <Text style={[styles.currencyBadgeText, { color: colors.accent }]}>
                  {currentCurrency.symbol} {currentCurrency.code}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            }
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>General</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => {}} colors={colors} />
          <SettingRow icon="shield-checkmark-outline" label="Privacy" onPress={() => {}} colors={colors} />
          <SettingRow icon="help-circle-outline" label="Help & Support" onPress={() => {}} colors={colors} />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Account</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="log-out-outline" label="Logout" onPress={handleLogout} danger colors={colors} />
        </View>

        <Text style={[styles.versionText, { color: colors.textTertiary }]}>SpendIQ v1.0.0</Text>
      </ScrollView>

      <Modal visible={showCurrencyPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Currency</Text>
            {CURRENCIES.map(curr => (
              <Pressable
                key={curr.code}
                onPress={() => { setCurrency(curr.code); setShowCurrencyPicker(false); }}
                style={[
                  styles.currencyRow,
                  { borderBottomColor: colors.border },
                  curr.code === currentCurrency.code && { backgroundColor: colors.accentDim },
                ]}
              >
                <Text style={[styles.currencySymbol, { color: colors.accent }]}>{curr.symbol}</Text>
                <View style={styles.currencyInfo}>
                  <Text style={[styles.currencyCode, { color: colors.text }]}>{curr.code}</Text>
                  <Text style={[styles.currencyName, { color: colors.textSecondary }]}>{curr.name}</Text>
                </View>
                {curr.code === currentCurrency.code && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                )}
              </Pressable>
            ))}
            <Pressable onPress={() => setShowCurrencyPicker(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 28,
    gap: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  profileEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  settingsGroup: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  currencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currencyBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  versionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center', marginBottom: 20 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderRadius: 12, gap: 14, marginBottom: 2 },
  currencySymbol: { fontFamily: 'Inter_700Bold', fontSize: 22, width: 32, textAlign: 'center' },
  currencyInfo: { flex: 1 },
  currencyCode: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  currencyName: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  cancelBtn: { marginTop: 12, borderRadius: 14, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
