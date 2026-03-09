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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';

const STORAGE_KEY = '@spendiq_family';

const RELATIONSHIPS = [
  { key: 'self', label: 'Self', icon: 'person' },
  { key: 'papa', label: 'Papa', icon: 'man' },
  { key: 'mummy', label: 'Mummy', icon: 'woman' },
  { key: 'partner', label: 'Partner', icon: 'heart' },
  { key: 'child', label: 'Child', icon: 'happy' },
  { key: 'other', label: 'Other', icon: 'people' },
];

interface Medicine {
  id: string;
  name: string;
  time: string;
  frequency: string;
  taken: boolean;
  snoozed: boolean;
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
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddMedicine, setShowAddMedicine] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedRel, setSelectedRel] = useState('self');
  const [medName, setMedName] = useState('');
  const [medTime, setMedTime] = useState('8:00 AM');
  const [medFreq, setMedFreq] = useState('Daily');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored) setMembers(JSON.parse(stored));
    }).catch(() => {});
  }, []);

  const save = useCallback((updated: FamilyMember[]) => {
    setMembers(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addMember = () => {
    if (!newName.trim()) return;
    const member: FamilyMember = {
      id: Date.now().toString(),
      name: newName.trim(),
      relationship: selectedRel,
      medicines: [],
    };
    save([...members, member]);
    setNewName('');
    setSelectedRel('self');
    setShowAddMember(false);
  };

  const addMedicine = () => {
    if (!medName.trim() || !showAddMedicine) return;
    const med: Medicine = {
      id: Date.now().toString(),
      name: medName.trim(),
      time: medTime,
      frequency: medFreq,
      taken: false,
      snoozed: false,
    };
    const updated = members.map(m =>
      m.id === showAddMedicine ? { ...m, medicines: [...m.medicines, med] } : m
    );
    save(updated);
    setMedName('');
    setMedTime('8:00 AM');
    setMedFreq('Daily');
    setShowAddMedicine(null);
  };

  const markMedicine = (memberId: string, medId: string, action: 'taken' | 'snooze' | 'skip') => {
    const updated = members.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        medicines: m.medicines.map(med => {
          if (med.id !== medId) return med;
          if (action === 'taken') return { ...med, taken: true, snoozed: false };
          if (action === 'snooze') return { ...med, snoozed: true };
          if (action === 'skip') return { ...med, taken: false, snoozed: false };
          return med;
        }),
      };
    });
    save(updated);
  };

  const deleteMember = (memberId: string) => {
    save(members.filter(m => m.id !== memberId));
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
                  <View style={[styles.memberAvatar, { backgroundColor: colors.accent + '15' }]}>
                    <Ionicons name={getRelIcon(member.relationship) as any} size={22} color={colors.accent} />
                  </View>
                  <View>
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                    <Text style={[styles.memberRel, { color: colors.textTertiary }]}>
                      {RELATIONSHIPS.find(r => r.key === member.relationship)?.label || member.relationship}
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

              {member.medicines.length === 0 && (
                <Text style={[styles.noMedsText, { color: colors.textTertiary }]}>No medicines added</Text>
              )}

              {member.medicines.map(med => (
                <View key={med.id} style={[styles.medCard, { backgroundColor: isDark ? colors.cardElevated : colors.cardElevated, borderColor: colors.border }]}>
                  <View style={styles.medInfo}>
                    <View style={[styles.medIconWrap, { backgroundColor: '#10B981' + '15' }]}>
                      <Ionicons name="medkit" size={16} color="#10B981" />
                    </View>
                    <View style={styles.medDetails}>
                      <Text style={[styles.medName, { color: colors.text }]}>{med.name}</Text>
                      <Text style={[styles.medSchedule, { color: colors.textTertiary }]}>{med.time} / {med.frequency}</Text>
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
                    <Pressable onPress={() => markMedicine(member.id, med.id, 'taken')} style={[styles.medBtn, { backgroundColor: '#10B981' + '12' }]}>
                      <Ionicons name="checkmark" size={18} color="#10B981" />
                    </Pressable>
                    <Pressable onPress={() => markMedicine(member.id, med.id, 'snooze')} style={[styles.medBtn, { backgroundColor: colors.warningDim }]}>
                      <Ionicons name="time" size={18} color={colors.warning} />
                    </Pressable>
                    <Pressable onPress={() => markMedicine(member.id, med.id, 'skip')} style={[styles.medBtn, { backgroundColor: colors.dangerDim }]}>
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
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
              <Pressable onPress={addMember} style={styles.saveBtnWrap}>
                <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>Add Member</Text>
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

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Time</Text>
            <View style={styles.relGrid}>
              {['8:00 AM', '12:00 PM', '8:00 PM', '10:00 PM'].map(t => (
                <Pressable
                  key={t}
                  onPress={() => setMedTime(t)}
                  style={[styles.relChip, { backgroundColor: medTime === t ? colors.accentDim : colors.inputBg, borderColor: medTime === t ? colors.accent : colors.inputBorder }]}
                >
                  <Text style={[styles.relChipText, { color: medTime === t ? colors.accent : colors.textSecondary }]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Frequency</Text>
            <View style={styles.relGrid}>
              {['Daily', 'Twice Daily', 'Weekly', 'As Needed'].map(f => (
                <Pressable
                  key={f}
                  onPress={() => setMedFreq(f)}
                  style={[styles.relChip, { backgroundColor: medFreq === f ? colors.accentMintDim : colors.inputBg, borderColor: medFreq === f ? colors.accentMint : colors.inputBorder }]}
                >
                  <Text style={[styles.relChipText, { color: medFreq === f ? colors.accentMint : colors.textSecondary }]}>{f}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <Pressable onPress={() => setShowAddMedicine(null)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addMedicine} style={styles.saveBtnWrap}>
                <LinearGradient colors={[...colors.buttonGradient] as [string, string]} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>Add Medicine</Text>
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
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  saveBtnWrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  saveBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  saveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
});
