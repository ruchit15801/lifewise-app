import React from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.screenTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.paragraph, styles.sectionTitle, { color: colors.text }]}>
          LifeWise is built to be privacy-first. This page explains what data we collect, what
          permissions we request, how we use data, and how we keep it secure.
        </Text>

        <Text style={[styles.paragraphHeading, { color: colors.text }]}>Data Collection</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          • Account data (optional): name, email/phone if you create an account.{'\n'}
          • Reminder data: reminders you create, schedules, and completion status.{'\n'}
          • Usage analytics (optional): app performance and feature usage to improve reliability.
        </Text>

        <Text style={[styles.paragraphHeading, { color: colors.text }]}>Permissions (SMS detection)</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          LifeWise may request access to read SMS only to detect bill and financial reminder messages
          (for example: electricity, mobile recharge, subscriptions, and bank alerts). This helps us
          identify due dates and amounts so you don’t miss critical payments.
        </Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          We do not use SMS data for advertising, profiling, or selling to third parties.
        </Text>

        <Text style={[styles.paragraphHeading, { color: colors.text }]}>Data Usage</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          • To create reminders and send notifications.{'\n'}
          • To generate insights like life score and reports.{'\n'}
          • To support Family Hub features you enable.
        </Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          User data is never sold.
        </Text>

        <Text style={[styles.paragraphHeading, { color: colors.text }]}>Security</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          We apply industry-standard security practices (encryption in transit, access controls,
          and least-privilege). If we store data, we aim to minimize what’s collected and retain it
          only as long as needed to provide the service.
        </Text>

        <Text style={[styles.paragraphHeading, { color: colors.text }]}>Contact</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          Questions? Email Info@lifewise.app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  paragraph: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  paragraphHeading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
});

