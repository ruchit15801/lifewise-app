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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
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

  const headerHeight = 110 + insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Premium Header */}
        <LinearGradient
          colors={colors.heroGradient as any}
          style={[styles.header, { height: headerHeight, paddingTop: insets.top }]}
        >
          <View style={styles.headerTop}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Family Hub</Text>
            <Pressable onPress={() => router.push('/add-family-member')} style={styles.addBtn}>
              <Ionicons name="add-circle" size={32} color={colors.accent} />
            </Pressable>
          </View>

          <View style={styles.headerContent}>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Manage your family's health routines
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {members.length === 0 ? (
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentDim }]}>
                <Ionicons name="people-outline" size={60} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Your hub is empty</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                Add your loved ones to track their medications and health schedules in one place.
              </Text>
              <Pressable 
                onPress={() => router.push('/add-family-member')}
                style={styles.emptyActionBtn}
              >
                <LinearGradient
                  colors={colors.buttonGradient as any}
                  style={styles.emptyActionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.emptyActionText}>Add First Member</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          ) : (
            members.map((member, idx) => (
              <Animated.View
                key={member.id}
                entering={FadeInDown.delay(idx * 100).duration(500)}
                style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.memberHeader}>
                  <View style={styles.memberInfo}>
                    <View style={[styles.avatarWrap, { backgroundColor: colors.accent + '15' }]}>
                      <Ionicons name={getRelIcon(member.relationship) as any} size={24} color={colors.accent} />
                    </View>
                    <View>
                      <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                      <Text style={[styles.memberRel, { color: colors.textTertiary }]}>
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
                      style={[styles.actionBtn, { backgroundColor: colors.accentMintDim }]}
                    >
                      <Ionicons name="add" size={20} color={colors.accentMint} />
                    </Pressable>
                    <Pressable 
                      onPress={() => deleteMember(member.id)}
                      style={[styles.actionBtn, { backgroundColor: colors.dangerDim }]}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>

                {member.medicines.length === 0 ? (
                  <View style={styles.noMedsBox}>
                    <Ionicons name="medical-outline" size={20} color={colors.textTertiary} />
                    <Text style={[styles.noMedsText, { color: colors.textTertiary }]}>No medicines tracked yet</Text>
                  </View>
                ) : (
                  <View style={styles.medList}>
                    {member.medicines.map((med, mIdx) => {
                      const pillColor = med.color || '#10B981';
                      const slots = med.slots || {};
                      const parts: string[] = [];
                      if (slots.morning) parts.push(`Morn ${slots.morning}`);
                      if (slots.noon) parts.push(`Noon ${slots.noon}`);
                      if (slots.evening) parts.push(`Eve ${slots.evening}`);
                      const scheduleText = parts.length > 0 ? parts.join(' • ') : 'No schedule';

                      return (
                        <View 
                          key={med.id} 
                          style={[styles.medCard, { backgroundColor: isDark ? colors.bg : colors.bg + '50', borderColor: colors.border }]}
                        >
                          <View style={styles.medMain}>
                            <View style={[styles.medIconBox, { backgroundColor: pillColor + '15' }]}>
                              <Ionicons name="medkit" size={18} color={pillColor} />
                            </View>
                            <View style={styles.medDetails}>
                              <Text style={[styles.medName, { color: colors.text }]}>
                                {med.name}
                                {med.dosage ? <Text style={styles.medDosage}> ({med.dosage})</Text> : ''}
                              </Text>
                              <Text style={[styles.medSchedule, { color: colors.textTertiary }]} numberOfLines={1}>
                                {scheduleText}
                              </Text>
                            </View>
                            {med.taken ? (
                              <View style={[styles.tag, { backgroundColor: '#10B98120' }]}>
                                <Text style={[styles.tagText, { color: '#10B981' }]}>Done</Text>
                              </View>
                            ) : med.snoozed ? (
                                <View style={[styles.tag, { backgroundColor: colors.warningDim }]}>
                                  <Text style={[styles.tagText, { color: colors.warning }]}>Later</Text>
                                </View>
                            ) : null}
                          </View>

                          <View style={styles.medFooter}>
                             <Pressable 
                               onPress={() => markMedicine(member.id, med.id, 'taken')}
                               style={[styles.medActionBtn, { backgroundColor: '#10B98115' }]}
                             >
                               <Ionicons name="checkmark" size={18} color="#10B981" />
                             </Pressable>
                             <Pressable 
                               onPress={() => markMedicine(member.id, med.id, 'snooze')}
                               style={[styles.medActionBtn, { backgroundColor: colors.warningDim }]}
                             >
                               <Ionicons name="time-outline" size={18} color={colors.warning} />
                             </Pressable>
                             <Pressable 
                               onPress={() => markMedicine(member.id, med.id, 'skip')}
                               style={[styles.medActionBtn, { backgroundColor: colors.dangerDim }]}
                             >
                               <Ionicons name="close" size={18} color={colors.danger} />
                             </Pressable>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    marginTop: -2,
    alignItems: 'center',
  },
  headerSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    opacity: 0.8,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyActionBtn: {
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    width: '100%',
  },
  emptyActionGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  memberCard: {
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  memberRel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMedsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  noMedsText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  medList: {
    gap: 12,
  },
  medCard: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
  },
  medMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medDetails: {
    flex: 1,
  },
  medName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  medDosage: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    opacity: 0.7,
  },
  medSchedule: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  medFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  medActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
