import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { io } from 'socket.io-client';

const RELATIONSHIPS = [
  { key: 'self', label: 'Self', icon: 'person' },
  { key: 'parent', label: 'Parent', icon: 'man' },
  { key: 'spouse', label: 'Spouse', icon: 'heart' },
  { key: 'child', label: 'Child', icon: 'happy' },
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
  relation?: string;
  memberType?: 'parent' | 'child' | 'spouse' | 'self';
  modulesEnabled?: string[];
  connectionCode?: string | null;
  medicines: Medicine[];
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { token } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [familyGraph, setFamilyGraph] = useState<Array<{ id: string; member_name: string; relation: string }>>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddMedicine, setShowAddMedicine] = useState<string | null>(null);
  const [familyCodeInput, setFamilyCodeInput] = useState('');
  const [memberCodeInput, setMemberCodeInput] = useState('');
  const [generatedFamilyCode, setGeneratedFamilyCode] = useState('');
  const [latestMemberCode, setLatestMemberCode] = useState('');
  const [connectStatus, setConnectStatus] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedRel, setSelectedRel] = useState('self');
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medAppearance, setMedAppearance] = useState<MedAppearance>('tablet');
  const [medColor, setMedColor] = useState('#10B981');
  const [medInstruction, setMedInstruction] = useState<MedInstruction>('any');
  const [slotMorning, setSlotMorning] = useState(true);
  const [slotNoon, setSlotNoon] = useState(false);
  const [slotEvening, setSlotEvening] = useState(false);
  const [slotMorningTime, setSlotMorningTime] = useState('9:00 AM');
  const [slotNoonTime, setSlotNoonTime] = useState('1:00 PM');
  const [slotEveningTime, setSlotEveningTime] = useState('8:00 PM');
  const [medScheduleType, setMedScheduleType] = useState<MedScheduleType>('continuous');
  const todayIso = new Date().toISOString().slice(0, 10);
  const [medStartDate, setMedStartDate] = useState(todayIso);
  const [medEndDate, setMedEndDate] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isAddingMedicine, setIsAddingMedicine] = useState(false);
  const [isCreatingFamily, setIsCreatingFamily] = useState(false);
  const [isJoiningFamily, setIsJoiningFamily] = useState(false);
  const [isLinkingFamily, setIsLinkingFamily] = useState(false);
  const [actionError, setActionError] = useState('');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  const loadMembers = useCallback(async () => {
    if (!token) return;
    setIsLoadingMembers(true);
    try {
      const [res, graphRes] = await Promise.all([
        apiRequest('GET', '/api/family', undefined, token),
        apiRequest('GET', '/api/family/graph', undefined, token),
      ]);
      const [data, graphJson] = await Promise.all([res.json(), graphRes.json()]);
      const membersData = data as FamilyMember[];
      setMembers(membersData);
      const ownerMember = membersData.find((m) => String(m.relationship || '').toLowerCase() === 'self');
      if (ownerMember?.connectionCode) {
        setLatestMemberCode(ownerMember.connectionCode);
      }
      setFamilyGraph(Array.isArray(graphJson) ? graphJson : []);
      setActionError('');
    } catch (e) {
      console.error('Load family error:', e);
      setActionError('Cannot connect to Family Hub. Check backend and network.');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [token]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const addMember = () => {
    if (!newName.trim()) return;
    if (!token) return;
    (async () => {
      setIsAddingMember(true);
      try {
        const res = await apiRequest(
          'POST',
          '/api/family',
          { name: newName.trim(), relation: selectedRel, member_type: selectedRel },
          token,
        );
        const created = (await res.json()) as FamilyMember;
        setMembers(prev => [...prev, created]);
        if (created.connectionCode) {
          setLatestMemberCode(created.connectionCode);
        }
        setNewName('');
        setSelectedRel('self');
        setShowAddMember(false);
        setActionError('');
      } catch (e) {
        console.error('Add family member error:', e);
        setActionError('Unable to add member right now. Please retry.');
      } finally {
        setIsAddingMember(false);
      }
    })();
  };

  const addMedicine = () => {
    if (!medName.trim() || !showAddMedicine) return;
    if (!token) return;
    (async () => {
      setIsAddingMedicine(true);
      try {
        const slots: MedicineSlots = {};
        if (slotMorning) slots.morning = slotMorningTime;
        if (slotNoon) slots.noon = slotNoonTime;
        if (slotEvening) slots.evening = slotEveningTime;

        const body = {
          name: medName.trim(),
          dosage: medDosage.trim(),
          appearance: medAppearance,
          color: medColor,
          instruction: medInstruction,
          slots,
          scheduleType: medScheduleType,
          startDate: medStartDate,
          endDate: medScheduleType === 'custom' ? medEndDate || null : null,
        };

        const res = await apiRequest(
          'POST',
          `/api/family/${showAddMedicine}/medicines`,
          body,
          token,
        );
        const updatedMember = (await res.json()) as FamilyMember;
        setMembers(prev =>
          prev.map(m => (m.id === updatedMember.id ? updatedMember : m)),
        );
        setMedName('');
        setMedDosage('');
        setMedAppearance('tablet');
        setMedColor('#10B981');
        setMedInstruction('any');
        setSlotMorning(true);
        setSlotNoon(false);
        setSlotEvening(false);
        setSlotMorningTime('9:00 AM');
        setSlotNoonTime('1:00 PM');
        setSlotEveningTime('8:00 PM');
        setMedScheduleType('continuous');
        setMedStartDate(todayIso);
        setMedEndDate('');
        setShowAddMedicine(null);
        setActionError('');
      } catch (e) {
        console.error('Add medicine error:', e);
        setActionError('Unable to add medicine right now. Please retry.');
      } finally {
        setIsAddingMedicine(false);
      }
    })();
  };

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

  const connectFamily = () => {
    if (!token || !memberCodeInput.trim()) return;
    (async () => {
      setIsLinkingFamily(true);
      try {
        const res = await apiRequest(
          'POST',
          '/api/family/connect',
          { code: memberCodeInput.trim().toUpperCase() },
          token,
        );
        const data = (await res.json()) as { ok: boolean };
        if (data.ok) {
          setConnectStatus('Connected successfully. Family modules synced.');
          setMemberCodeInput('');
          await loadMembers();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid code. Please check and try again.';
        setConnectStatus(message);
      } finally {
        setIsLinkingFamily(false);
      }
    })();
  };

  const createFamily = () => {
    if (!token) return;
    (async () => {
      setIsCreatingFamily(true);
      try {
        const res = await apiRequest('POST', '/api/family/create', {}, token);
        const data = (await res.json()) as { family_id: string; family_code: string };
        setFamilyId(data.family_id);
        setGeneratedFamilyCode(data.family_code);
        setFamilyCodeInput(data.family_code);
        setConnectStatus(`Family created: ${data.family_code}`);
      } catch {
        setConnectStatus('Unable to create family.');
      } finally {
        setIsCreatingFamily(false);
      }
    })();
  };

  const joinFamily = () => {
    if (!token || !familyCodeInput.trim()) return;
    (async () => {
      setIsJoiningFamily(true);
      try {
        const res = await apiRequest('POST', '/api/family/join', { family_code: familyCodeInput.trim().toUpperCase() }, token);
        const data = (await res.json()) as { family_id?: string };
        if (data.family_id) setFamilyId(data.family_id);
        setConnectStatus('Joined family successfully.');
        await loadMembers();
      } catch {
        setConnectStatus('Invalid family code.');
      } finally {
        setIsJoiningFamily(false);
      }
    })();
  };

  useEffect(() => {
    if (!familyId) return;
    const baseUrl = getApiUrl();
    const socket = io(baseUrl, { transports: ['websocket'] });
    socket.emit('join-family', familyId);
    socket.on('family_member_joined', (payload: { message?: string }) => {
      setConnectStatus(payload?.message || 'Family member joined');
      loadMembers();
    });
    return () => {
      socket.disconnect();
    };
  }, [familyId, loadMembers]);

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
          <Pressable onPress={() => setShowAddMember(true)} hitSlop={10}>
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

        {!!actionError && (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorBannerText, { color: colors.danger }]}>{actionError}</Text>
          </View>
        )}

        <View style={[styles.connectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.connectTitle, { color: colors.text }]}>Connect to Family Hub</Text>
          <Text style={[styles.connectSubtitle, { color: colors.textSecondary }]}>
            Step 1: User 1 creates a family code. Step 2: User 2 joins using that code.
          </Text>
          <View style={styles.connectRow}>
            <Pressable
              onPress={createFamily}
              disabled={isCreatingFamily}
              style={[styles.connectBtn, { backgroundColor: colors.accent, opacity: isCreatingFamily ? 0.7 : 1 }]}
            >
              <Text style={styles.connectBtnText}>{isCreatingFamily ? 'Creating...' : 'Create Family'}</Text>
            </Pressable>
            <Pressable
              onPress={joinFamily}
              disabled={isJoiningFamily}
              style={[styles.connectBtn, { backgroundColor: colors.accentBlue || colors.accent, opacity: isJoiningFamily ? 0.7 : 1 }]}
            >
              <Text style={styles.connectBtnText}>{isJoiningFamily ? 'Joining...' : 'Join Family'}</Text>
            </Pressable>
          </View>

          {(generatedFamilyCode || latestMemberCode) && (
            <View style={[styles.codePreviewCard, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}>
              {!!generatedFamilyCode && (
                <Text style={[styles.codePreviewText, { color: colors.text }]}>
                  Family Code: <Text style={[styles.codePreviewStrong, { color: colors.accent }]}>{generatedFamilyCode}</Text>
                </Text>
              )}
              {!!latestMemberCode && (
                <Text style={[styles.codePreviewText, { color: colors.text }]}>
                  Member Connect Code: <Text style={[styles.codePreviewStrong, { color: colors.accentMint }]}>{latestMemberCode}</Text>
                </Text>
              )}
            </View>
          )}

          <View style={styles.connectRow}>
            <TextInput
              style={[styles.connectInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={familyCodeInput}
              onChangeText={setFamilyCodeInput}
              placeholder="FAM-8472"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
            />
            <Pressable
              onPress={joinFamily}
              disabled={isJoiningFamily}
              style={[styles.connectBtn, { backgroundColor: colors.accentBlue || colors.accent, opacity: isJoiningFamily ? 0.7 : 1 }]}
            >
              <Text style={styles.connectBtnText}>{isJoiningFamily ? 'Joining...' : 'Join Code'}</Text>
            </Pressable>
          </View>
          <View style={styles.connectRow}>
            <TextInput
              style={[styles.connectInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={memberCodeInput}
              onChangeText={setMemberCodeInput}
              placeholder="Member connect code"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
            />
            <Pressable
              onPress={connectFamily}
              disabled={isLinkingFamily}
              style={[styles.connectBtn, { backgroundColor: colors.accentMint || colors.accent, opacity: isLinkingFamily ? 0.7 : 1 }]}
            >
              <Text style={styles.connectBtnText}>{isLinkingFamily ? 'Linking...' : 'Link Device'}</Text>
            </Pressable>
          </View>
          {!!connectStatus && <Text style={[styles.connectStatus, { color: colors.textTertiary }]}>{connectStatus}</Text>}
        </View>

        <View style={[styles.connectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.connectTitle, { color: colors.text }]}>Family Graph</Text>
          {familyGraph.length === 0 ? (
            <Text style={[styles.connectStatus, { color: colors.textTertiary }]}>No graph data yet.</Text>
          ) : (
            familyGraph.map((node) => (
              <Text key={node.id} style={[styles.connectStatus, { color: colors.textSecondary }]}>
                Hetvi → {node.member_name} ({node.relation})
              </Text>
            ))
          )}
        </View>

        {members.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="people-outline" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No family members yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Tap + to add your first family member</Text>
            <Pressable onPress={() => setShowAddMember(true)} style={[styles.emptyCtaBtn, { backgroundColor: colors.accent }]}>
              {isLoadingMembers ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.connectBtnText}>Add First Member</Text>}
            </Pressable>
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
                  <View style={[styles.memberAvatar, { backgroundColor: colors.accent + '15' }]}>
                    <Ionicons name={getRelIcon(member.relationship) as any} size={22} color={colors.accent} />
                  </View>
                  <View>
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                    <Text style={[styles.memberRel, { color: colors.textTertiary }]}>
                      {RELATIONSHIPS.find(r => r.key === (member.memberType || member.relationship))?.label || member.relationship}
                    </Text>
                  </View>
                </View>
                <View style={styles.memberActions}>
                  <Pressable onPress={() => setShowAddMedicine(member.id)} hitSlop={8}>
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

              {member.connectionCode ? (
                <Text style={[styles.connectionCode, { color: colors.accent }]}>Code: {member.connectionCode}</Text>
              ) : null}
              {Array.isArray(member.modulesEnabled) && member.modulesEnabled.length > 0 ? (
                <View style={styles.modulesWrap}>
                  {member.modulesEnabled.map((mod) => (
                    <View key={mod} style={[styles.moduleChip, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Text style={[styles.moduleChipText, { color: colors.textSecondary }]}>{mod.replace(/_/g, ' ')}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

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
                      <View style={[styles.medIconWrap, { backgroundColor: pillColor + '15' }]}>
                        <Ionicons name="medkit" size={16} color={pillColor} />
                      </View>
                      <View style={styles.medDetails}>
                        <Text style={[styles.medName, { color: colors.text }]}>
                          {med.name}
                          {med.dosage ? `  ${med.dosage}` : ''}
                        </Text>
                        <Text style={[styles.medSchedule, { color: colors.textTertiary }]}>
                          {scheduleText}
                          {med.instruction === 'before_meal' && ' • Before meal'}
                          {med.instruction === 'after_meal' && ' • After meal'}
                        </Text>
                        {adherence !== null && (
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
                    <View style={styles.medActions}>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'taken')}
                        style={[styles.medBtn, { backgroundColor: '#10B981' + '12' }]}
                      >
                        <Ionicons name="checkmark" size={18} color="#10B981" />
                      </Pressable>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'snooze')}
                        style={[styles.medBtn, { backgroundColor: colors.warningDim }]}
                      >
                        <Ionicons name="time" size={18} color={colors.warning} />
                      </Pressable>
                      <Pressable
                        onPress={() => markMedicine(member.id, med.id, 'skip')}
                        style={[styles.medBtn, { backgroundColor: colors.dangerDim }]}
                      >
                        <Ionicons name="close" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <Modal visible={showAddMember} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Family Member</Text>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter name"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Relationship</Text>
            <View style={styles.relGrid}>
              {RELATIONSHIPS.map(rel => (
                <Pressable
                  key={rel.key}
                  onPress={() => setSelectedRel(rel.key)}
                  style={[
                    styles.relChip,
                    { backgroundColor: selectedRel === rel.key ? colors.accentDim : colors.inputBg, borderColor: selectedRel === rel.key ? colors.accent : colors.inputBorder },
                  ]}
                >
                  <Ionicons name={rel.icon as any} size={16} color={selectedRel === rel.key ? colors.accent : colors.textSecondary} />
                  <Text style={[styles.relChipText, { color: selectedRel === rel.key ? colors.accent : colors.textSecondary }]}>{rel.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <Pressable onPress={() => setShowAddMember(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addMember} style={styles.saveBtnWrap} disabled={isAddingMember}>
                <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>{isAddingMember ? 'Adding...' : 'Add Member'}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!showAddMedicine} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Medicine</Text>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Medicine Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={medName}
              onChangeText={setMedName}
              placeholder="e.g., Telma 40"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Dosage</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={medDosage}
              onChangeText={setMedDosage}
              placeholder="e.g., 40mg"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Appearance</Text>
            <View style={styles.relGrid}>
              {[
                { key: 'capsule', label: 'Capsule', icon: 'ellipse-outline' },
                { key: 'tablet', label: 'Tablet', icon: 'square-outline' },
                { key: 'round', label: 'Round', icon: 'radio-button-on' },
                { key: 'liquid', label: 'Liquid', icon: 'water' },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setMedAppearance(opt.key as MedAppearance)}
                  style={[
                    styles.relChip,
                    {
                      backgroundColor:
                        medAppearance === opt.key ? colors.accentDim : colors.inputBg,
                      borderColor:
                        medAppearance === opt.key ? colors.accent : colors.inputBorder,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={16}
                    color={medAppearance === opt.key ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.relChipText,
                      {
                        color:
                          medAppearance === opt.key ? colors.accent : colors.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Color</Text>
            <View style={styles.colorRow}>
              {['#10B981', '#3B82F6', '#F97316', '#EF4444', '#8B5CF6'].map(c => (
                <Pressable
                  key={c}
                  onPress={() => setMedColor(c)}
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor: c,
                      borderColor: medColor === c ? '#FFFFFF' : 'transparent',
                    },
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Timing</Text>
            <View style={styles.slotRow}>
              <Pressable
                onPress={() => setSlotMorning(v => !v)}
                style={[
                  styles.slotChip,
                  {
                    backgroundColor: slotMorning ? colors.accentDim : colors.inputBg,
                    borderColor: slotMorning ? colors.accent : colors.inputBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.relChipText,
                    { color: slotMorning ? colors.accent : colors.textSecondary },
                  ]}
                >
                  Morning
                </Text>
                <Text style={[styles.slotTime, { color: colors.textTertiary }]}>
                  {slotMorningTime}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSlotNoon(v => !v)}
                style={[
                  styles.slotChip,
                  {
                    backgroundColor: slotNoon ? colors.accentDim : colors.inputBg,
                    borderColor: slotNoon ? colors.accent : colors.inputBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.relChipText,
                    { color: slotNoon ? colors.accent : colors.textSecondary },
                  ]}
                >
                  Noon
                </Text>
                <Text style={[styles.slotTime, { color: colors.textTertiary }]}>
                  {slotNoonTime}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSlotEvening(v => !v)}
                style={[
                  styles.slotChip,
                  {
                    backgroundColor: slotEvening ? colors.accentDim : colors.inputBg,
                    borderColor: slotEvening ? colors.accent : colors.inputBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.relChipText,
                    { color: slotEvening ? colors.accent : colors.textSecondary },
                  ]}
                >
                  Evening
                </Text>
                <Text style={[styles.slotTime, { color: colors.textTertiary }]}>
                  {slotEveningTime}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Instruction
            </Text>
            <View style={styles.relGrid}>
              {[
                { key: 'before_meal', label: 'Before Meal' },
                { key: 'after_meal', label: 'After Meal' },
                { key: 'any', label: "Doesn't Matter" },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setMedInstruction(opt.key as MedInstruction)}
                  style={[
                    styles.relChip,
                    {
                      backgroundColor:
                        medInstruction === opt.key ? colors.accentMintDim : colors.inputBg,
                      borderColor:
                        medInstruction === opt.key ? colors.accentMint : colors.inputBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.relChipText,
                      {
                        color:
                          medInstruction === opt.key
                            ? colors.accentMint
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Duration
            </Text>
            <View style={styles.relGrid}>
              {[
                { key: 'continuous', label: 'Continuous / Lifetime' },
                { key: 'custom', label: 'Custom' },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setMedScheduleType(opt.key as MedScheduleType)}
                  style={[
                    styles.relChip,
                    {
                      backgroundColor:
                        medScheduleType === opt.key ? colors.accentDim : colors.inputBg,
                      borderColor:
                        medScheduleType === opt.key ? colors.accent : colors.inputBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.relChipText,
                      {
                        color:
                          medScheduleType === opt.key
                            ? colors.accent
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {medScheduleType === 'custom' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Start Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  value={medStartDate}
                  onChangeText={setMedStartDate}
                  placeholder={todayIso}
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  End Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  value={medEndDate}
                  onChangeText={setMedEndDate}
                  placeholder="e.g., 2026-04-01"
                  placeholderTextColor={colors.textTertiary}
                />
              </>
            )}

            <View style={styles.modalBtns}>
              <Pressable onPress={() => setShowAddMedicine(null)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addMedicine} style={styles.saveBtnWrap} disabled={isAddingMedicine}>
                <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>{isAddingMedicine ? 'Saving...' : 'Add Medicine'}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  connectCard: { borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 16, gap: 8 },
  connectTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  connectSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  connectRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  connectInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_500Medium' },
  connectBtn: { borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  connectBtnText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  connectStatus: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  codePreviewCard: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4, marginTop: 4 },
  codePreviewText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  codePreviewStrong: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  errorBanner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: { fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 },
  emptyState: { borderRadius: 24, padding: 40, borderWidth: 1, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  emptyCtaBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 6 },
  memberCard: { borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 14, gap: 12 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  memberRel: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  smallActionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  connectionCode: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 2 },
  modulesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moduleChip: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  moduleChipText: { fontFamily: 'Inter_400Regular', fontSize: 11, textTransform: 'capitalize' as const },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 14 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center' },
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
