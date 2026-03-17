import React from 'react';
import { Tabs } from 'expo-router';
import ScrollableTabBar from '@/components/ScrollableTabBar';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ScrollableTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Activity' }} />
      <Tabs.Screen name="reports" options={{ title: 'Report' }} />
      <Tabs.Screen name="money-leaks" options={{ title: 'Money Leaks' }} />
      <Tabs.Screen name="planet" options={{ title: 'Life Planet' }} />
      <Tabs.Screen name="bills" options={{ title: 'Reminders' }} />
      <Tabs.Screen name="wiseai" options={{ title: 'Wise AI' }} />
      <Tabs.Screen name="leaks" options={{ href: null }} />
      <Tabs.Screen name="reminders" options={{ href: null }} />
      <Tabs.Screen name="lifemind" options={{ href: null }} />
    </Tabs>
  );
}
