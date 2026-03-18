import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTheme } from "@/lib/theme-context";

function ClassicTabLayout() {
  const { colors, isDark } = useTheme();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const activeColor = "#7C3AED"; // unified purple accent
  const inactiveColor = "#9CA3AF";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute" as const,
          left: 16,
          right: 16,
          bottom: isIOS ? 26 : 18,
          height: 64,
          borderRadius: 999,
          paddingHorizontal: 24,
          paddingVertical: 8,
          backgroundColor: colors.tabBarBg,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: isDark ? "#000000" : "rgba(15,23,42,0.35)",
          shadowOpacity: 0.22,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={colors.blurTint}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBarBg }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabItem, focused && styles.tabItemActive]}>
              <Ionicons
                name="home"
                size={22}
                color={focused ? activeColor : inactiveColor}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabItem, focused && styles.tabItemActive]}>
              <Ionicons
                name="stats-chart"
                size={22}
                color={focused ? activeColor : inactiveColor}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabItem, focused && styles.tabItemActive]}>
              <Ionicons
                name="pie-chart"
                size={22}
                color={focused ? activeColor : inactiveColor}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="leaks"
        options={{
          title: "Leaks",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabItem, focused && styles.tabItemActive]}>
              <Ionicons
                name="water"
                size={22}
                color={focused ? activeColor : inactiveColor}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: "Reminders",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabItem, focused && styles.tabItemActive]}>
              <Ionicons
                name="notifications"
                size={22}
                color={focused ? activeColor : inactiveColor}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  // Always use the custom pill-style tab bar to match the design.
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabItem: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: "rgba(124, 58, 237, 0.16)",
  },
  tabLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
});
