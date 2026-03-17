import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@/lib/theme-context';

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home' },
  transactions: { label: 'Activity', icon: 'pulse' },
  reports: { label: 'Report', icon: 'bar-chart' },
  'money-leaks': { label: 'Money Leaks', icon: 'water' },
  planet: { label: 'Life Planet', icon: 'planet' },
  bills: { label: 'Reminders', icon: 'notifications' },
  wiseai: { label: 'Wise AI', icon: 'sparkles' },
};

export default function ScrollableTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { borderTopColor: colors.border, backgroundColor: colors.tabBarBg }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={styles.item}
            >
              <LinearGradient
                colors={focused ? (colors.buttonGradient as [string, string]) : ['transparent', 'transparent']}
                style={styles.iconWrap}
              >
                <Ionicons name={meta.icon} size={19} color={focused ? '#FFFFFF' : colors.tabIconDefault} />
              </LinearGradient>
              {focused ? <Text style={[styles.label, { color: colors.accent }]}>{meta.label}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1 },
  scroll: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' },
  item: { minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 2, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});
