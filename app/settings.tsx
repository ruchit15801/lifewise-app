import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

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

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

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
  versionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
