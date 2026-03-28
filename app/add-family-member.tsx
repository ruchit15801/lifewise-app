import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';

const RELATIONSHIPS = [
  { key: 'self', label: 'Self', icon: 'person' },
  { key: 'spouse', label: 'Spouse', icon: 'heart' },
  { key: 'child', label: 'Child', icon: 'happy' },
  { key: 'parent', label: 'Parent', icon: 'people' },
  { key: 'sibling', label: 'Sibling', icon: 'people-circle' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

export default function AddFamilyMemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { token } = useAuth();

  // Form State
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('other');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }
    if (!token) return;

    setIsSaving(true);
    try {
      const res = await apiRequest(
        'POST',
        '/api/family',
        { name: name.trim(), relationship },
        token
      );
      if (res.ok) {
        router.back();
      } else {
        setError('Failed to add member. Please try again.');
      }
    } catch (e) {
      console.error('Add family member error:', e);
      setError('An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const headerHeight = 120 + insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
          {/* Header */}
          <LinearGradient
            colors={colors.heroGradient as any}
            style={[styles.header, { height: headerHeight, paddingTop: insets.top }]}
          >
            <View style={styles.headerTop}>
              <Pressable onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Add New Member</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.headerNameBlock}>
              <Text style={[styles.contextLabel, { color: colors.textSecondary }]}>Enter Member Details</Text>
              <TextInput
                style={[styles.nameInput, { color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="Name of Family Member"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
              <View style={[styles.nameUnderline, { backgroundColor: colors.accent }]} />
            </View>
          </LinearGradient>

          <View style={styles.form}>
            {error ? (
              <Animated.View entering={FadeInDown} style={[styles.errorBox, { backgroundColor: colors.dangerDim }]}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </Animated.View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RELATIONSHIP</Text>
            <View style={styles.relGrid}>
              {RELATIONSHIPS.map(rel => {
                const isSelected = relationship === rel.key;
                return (
                  <Pressable
                    key={rel.key}
                    onPress={() => setRelationship(rel.key)}
                    style={[
                      styles.relCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      isSelected && { borderColor: colors.accent, backgroundColor: colors.accent + '10' }
                    ]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: isSelected ? colors.accentDim : colors.bg }]}>
                      <Ionicons 
                        name={rel.icon as any} 
                        size={24} 
                        color={isSelected ? colors.accent : colors.textTertiary} 
                      />
                    </View>
                    <Text style={[
                      styles.relLabel, 
                      { color: colors.textSecondary },
                      isSelected && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }
                    ]}>
                      {rel.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.checkWrap}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.accentDim + '30', borderColor: colors.accent + '30' }]}>
               <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
               <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                 Adding family members helps you track their health, medicines, and reminders in one place.
               </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer Save */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable onPress={handleSave} disabled={isSaving} style={styles.saveBtn}>
            <LinearGradient
              colors={colors.buttonGradient as any}
              style={styles.saveGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="person-add-outline" size={24} color="#FFF" />
              <Text style={styles.saveBtnText}>{isSaving ? 'Adding...' : 'Add Family Member'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  headerNameBlock: {
    marginTop: 0,
  },
  contextLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginBottom: 4,
  },
  nameInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    paddingVertical: 4,
  },
  nameUnderline: {
    height: 3,
    width: 60,
    borderRadius: 2,
    marginTop: 4,
  },
  form: {
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: {
    marginLeft: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    marginBottom: 16,
    marginTop: 8,
    letterSpacing: 1,
  },
  relGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  relCard: {
    width: '48%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  checkWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  infoCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  saveBtn: {
    height: 64,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  saveGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  saveBtnText: {
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
});
