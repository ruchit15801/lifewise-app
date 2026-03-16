import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, ActivityIndicator, Image } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { ExpenseProvider } from "@/lib/expense-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { CurrencyProvider } from "@/lib/currency-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "@/lib/notifications";

SplashScreen.preventAutoHideAsync();

function AnimatedSplash() {
  return (
    <LinearGradient
      colors={["#ffffff", "#ffffff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={splashStyles.container}
    >
      <Animated.View
        entering={FadeIn.duration(700)}
        exiting={FadeOut.duration(300)}
        style={splashStyles.content}
      >
        <Animated.View
          entering={FadeIn.duration(500)}
          style={splashStyles.logoShadow}
        >
          <Image
            source={require("../logo.png")}
            style={splashStyles.logo}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.Text
          entering={FadeIn.duration(600).delay(150)}
          style={splashStyles.title}
        >
          LifeWise
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.duration(700).delay(250)}
          style={splashStyles.subtitle}
        >
          Your Intelligent Life Companion
        </Animated.Text>
        <ActivityIndicator color="#EC4899" style={{ marginTop: 24 }} />
      </Animated.View>
    </LinearGradient>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  content: {
    alignItems: "center",
  },
  logoShadow: {
    width: 140,
    height: 140,
    borderRadius: 40,
    padding: 8,
    backgroundColor: "#ffffff",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    marginBottom: 20,
  },
  logo: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: "#111827",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(31,41,55,0.6)",
    marginTop: 8,
  },
});

function AuthGate() {
  const { user, token, isLoading, hasOnboarded, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShowSplash(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || showSplash) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const inTabs = segments[0] === '(tabs)';
    const inSettings = segments[0] === 'settings';

    if (!hasOnboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (hasOnboarded && !isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, hasOnboarded, segments, showSplash]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    registerForPushNotifications(token).catch((e) => {
      console.log("[Push] Registration error", e);
    });
  }, [isAuthenticated, token]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "reminder" && data?.billId) {
        router.push({
          pathname: "/(tabs)",
          params: { billId: data.billId },
        } as any);
      }
    });

    return () => {
      sub.remove();
    };
  }, [router]);

  if (isLoading || showSplash) {
    return <AnimatedSplash />;
  }

  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="life-memory" />
        <Stack.Screen name="family" />
        <Stack.Screen name="assistant" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <ThemeProvider>
              <CurrencyProvider>
                <AuthProvider>
                  <ExpenseProvider>
                    <AuthGate />
                  </ExpenseProvider>
                </AuthProvider>
              </CurrencyProvider>
            </ThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
