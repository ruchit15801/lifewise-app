import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useAlert } from '@/lib/alert-context';
import CustomModal from '@/components/CustomModal';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import { useSeniorMode } from '@/lib/senior-context';

const RELATIONSHIPS = [
  { key: 'self', label: 'Self', icon: 'person' },
  { key: 'papa', label: 'Papa', icon: 'man' },
  { key: 'mummy', label: 'Mummy', icon: 'woman' },
  { key: 'partner', label: 'Partner', icon: 'heart' },
  { key: 'child', label: 'Child', icon: 'happy' },
  { key: 'other', label: 'Other', icon: 'people' },
];

type MedAppearance = 'capsule' | 'tablet' | 'round' | 'liquid';
type MedInstruction = 'before_meal' | 'after_meal' | 'any';
type MedScheduleType = 'continuous' | 'custom';

interface MedicineSlots {
  morning?: string | null;
  noon?: string | null;
  evening?: string | null;
}

interface Medicine {
  id: string;
  name: string;
  dosage?: string;
  appearance?: MedAppearance;
  color?: string;
  instruction?: MedInstruction;
  slots?: MedicineSlots;
  scheduleType?: MedScheduleType;
  startDate?: string;
  endDate?: string | null;
  caregiverName?: string | null;
  caregiverContact?: string | null;
  totalReminders?: number;
  takenReminders?: number;
  missedReminders?: number;
  adherenceScore?: number;
  streak?: number;
  lastTakenAt?: string | null;
  lastStatus?: 'pending' | 'taken' | 'missed' | 'snoozed';
  taken?: boolean;
  snoozed?: boolean;
}

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  medicines: Medicine[];
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { token } = useAuth();
  const { isSeniorMode } = useSeniorMode();
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const loadMembers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiRequest('GET', '/api/family', undefined, token);
      const data = await res.json();
      setMembers(data as FamilyMember[]);
    } catch (e) {
      console.error('Load family error:', e);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );



  const markMedicine = (memberId: string, medId: string, action: 'taken' | 'snooze' | 'skip') => {
    if (!token) return;
    (async () => {
      try {
        const res = await apiRequest(
          'PATCH',
          `/api/family/${memberId}/medicines/${medId}`,
          { action },
          token,
        );
        const updatedMember = (await res.json()) as FamilyMember;
        setMembers(prev =>
          prev.map(m => (m.id === updatedMember.id ? updatedMember : m)),
        );
      } catch (e) {
        console.error('Update medicine status error:', e);
      }
    })();
  };

  const deleteMember = (memberId: string) => {
    if (!token) return;
    (async () => {
      try {
        await apiRequest('DELETE', `/api/family/${memberId}`, undefined, token);
        setMembers(prev => prev.filter(m => m.id !== memberId));
      } catch (e) {
        console.error('Delete family member error:', e);
      }
    })();
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const getRelIcon = (rel: string) => RELATIONSHIPS.find(r => r.key === rel)?.icon || 'person';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16, paddingBottom: bottomInset + 20 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Family Hub</Text>
          <Pressable onPress={() => router.push('/add-family-member')} hitSlop={10}>
            <Ionicons name="add-circle" size={28} color={colors.accent} />
          </Pressable>
        </View>

        <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="people" size={24} color={colors.accent} />
          </View>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            Add family members and manage their medicine reminders. Track health routines for your loved ones.
          </Text>
        </View>

        {members.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="people-outline" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No family members yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Tap + to add your first family member</Text>
          </View>
        )}

        {members.map((member, idx) => (
          <Animated.View
            key={member.id}
            entering={Platform.OS !== 'web' ? FadeInDown.delay(idx * 60).duration(400) : undefined}
          >
            <View style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.memberHeader}>
                <View style={styles.memberInfo}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.accent + (isSeniorMode ? '25' : '15'), width: isSeniorMode ? 56 : 48, height: isSeniorMode ? 56 : 48 }]}>
                    <Ionicons name={getRelIcon(member.relationship) as any} size={isSeniorMode ? 28 : 22} color={colors.accent} />
                  </View>
                  <View>
                    <Text style={[styles.memberName, { color: colors.text, fontSize: isSeniorMode ? 20 : 17 }]}>{member.name}</Text>
                    <Text style={[styles.memberRel, { color: colors.textTertiary, fontSize: isSeniorMode ? 14 : 12 }]}>
                      {RELATIONSHIPS.find(r => r.key === member.relationship)?.label || member.relationship}
                    </Text>
                  </View>
                </View>
                <View style={styles.memberActions}>
                  <Pressable 
                    onPress={() => router.push({
                      pathname: '/add-medicine',
                      params: { memberId: member.id, memberName: member.name }
                    })} 
                    hitSlop={8}
                  >
                    <View style={[styles.smallActionBtn, { backgroundColor: colors.accentMintDim }]}>
                      <Ionicons name="add" size={16} color={colors.accentMint} />
                    </View>
                  </Pressable>
                  <Pressable onPress={() => deleteMember(member.id)} hitSlop={8}>
                    <View style={[styles.smallActionBtn, { backgroundColor: colors.dangerDim }]}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    </View>
                  </Pressable>
                </View>
              </View>

              {member.medicines.length === 0 && (
                <Text style={[styles.noMedsText, { color: colors.textTertiary }]}>No medicines added</Text>
              )}

              {member.medicines.map(med => {
                const pillColor = med.color || '#10B981';
                const adherence = typeof med.adherenceScore === 'number' ? med.adherenceScore : null;
                const slots = med.slots || {};
                const parts: string[] = [];
                if (slots.morning) parts.push(`Morning ${slots.morning}`);
                if (slots.noon) parts.push(`Noon ${slots.noon}`);
                if (slots.evening) parts.push(`Evening ${slots.evening}`);
                const scheduleText =
                  parts.length > 0
                    ? parts.join(' • ')
                    : (med as any).time && (med as any).frequency
                    ? `${(med as any).time} / ${(med as any).frequency}`
                    : 'No schedule set';

                return (
                  <View
                    key={med.id}
                    style={[
                      styles.medCard,
                      {
                        backgroundColor: isDark ? colors.cardElevated : colors.cardElevated,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.medInfo}>
                      <View style={[styles.medIconWrap, { backgroundColor: pillColor + '15', width: isSeniorMode ? 44 : 36, height: isSeniorMode ? 44 : 36 }]}>
                        <Ionicons name="medkit" size={isSeniorMode ? 20 : 16} color={pillColor} />
                      </View>
                      <View style={styles.medDetails}>
                        <Text style={[styles.medName, { color: colors.text, fontSize: isSeniorMode ? 18 : 15 }]}>
                          {med.name}
                          {med.dosage ? `  ${med.dosage}` : ''}
                        </Text>
                        <Text style={[styles.medSchedule, { color: (isSeniorMode ? colors.textSecondary : colors.textTertiary), fontSize: isSeniorMode ? 14 : 12 }]}>
                          {scheduleText}
                          {med.instruction === 'before_meal' && ' • Before meal'}
                          {med.instruction === 'after_meal' && ' • After meal'}
                        </Text>
                        {adherence !== null && !isSeniorMode && (
                          <Text style={[styles.medAdherence, { color: colors.textSecondary }]}>
                            Adherence: {adherence}%
                            {med.streak ? `  •  Streak ${med.streak} days` : ''}
                          </Text>
                        )}
                      </View>
                      {med.taken && (
                        <View style={[styles.statusBadge, { backgroundColor: '#10B981' + '15' }]}>
                          <Text style={[styles.statusText, { color: '#10B981' }]}>Taken</Text>
                        </View>
                      )}
                      {med.snoozed && (
                        <View style={[styles.statusBadge, { backgroundColor: colors.warningDim }]}>
                          <Text style={[styles.statusText, { color: colors.warning }]}>Snoozed</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.medActions, isSeniorMode && { justifyContent: 'space-between', marginTop: 12 }]}>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'taken')}
                        style={[styles.medBtn, { backgroundColor: '#10B981' + '12', width: isSeniorMode ? '31%' : 40, height: isSeniorMode ? 48 : 36 }]}
                      >
                        <Ionicons name="checkmark" size={isSeniorMode ? 24 : 18} color="#10B981" />
                        {isSeniorMode && <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Taken</Text>}
                      </Pressable>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'snooze')}
                        style={[styles.medBtn, { backgroundColor: colors.warningDim, width: isSeniorMode ? '31%' : 40, height: isSeniorMode ? 48 : 36 }]}
                      >
                        <Ionicons name="time" size={isSeniorMode ? 24 : 18} color={colors.warning} />
                        {isSeniorMode && <Text style={{ color: colors.warning, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Later</Text>}
                      </Pressable>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'skip')}
                        style={[styles.medBtn, { backgroundColor: colors.dangerDim, width: isSeniorMode ? '31%' : 40, height: isSeniorMode ? 48 : 36 }]}
                      >
                        <Ionicons name="close" size={isSeniorMode ? 24 : 18} color={colors.danger} />
                        {isSeniorMode && <Text style={{ color: colors.danger, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Skip</Text>}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ))}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  screenTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  introCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  introIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  emptyState: { borderRadius: 24, padding: 40, borderWidth: 1, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  memberCard: { borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 14, gap: 12 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  memberRel: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  smallActionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  noMedsText: { fontFamily: 'Inter_400Regular', fontSize: 13, paddingLeft: 4 },
  medCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  medInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  medIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  medDetails: { flex: 1 },
  medName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  medSchedule: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  medAdherence: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'uppercase' as const },
  medActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  medBtn: { width: 40, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalContainer: { paddingHorizontal: 24, paddingBottom: 24, gap: 14 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center', marginBottom: 12 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 4 },
  input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  relChipText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 90,
  },
  slotTime: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  saveBtnWrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  saveBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  saveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
});
