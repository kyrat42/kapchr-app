import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';
import { getPalette, APP_BACKGROUND } from '@/lib/constants/palette';
import TimePicker, { toTimeString, fromTimeString } from '@/components/ui/TimePicker';
import type { AreaOfLife } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TemplateBlock {
  id: string;
  user_id: string;
  area_of_life_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  name: string | null;
  is_all_day: boolean;
}

interface UserSettings {
  week_start_day: number;
  bedtime: string;
}

// ─── Constants & Helpers ──────────────────────────────────────────────────────
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "HH:MM" → "h:MM AM/PM"
const fmt = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

// Minutes between two "HH:MM" strings
const minsBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TemplateScreen() {
  const router = useRouter();
  const { session } = useAuthStore();

  const [settings, setSettings]       = useState<UserSettings>({ week_start_day: 1, bedtime: '22:00' });
  const [areas, setAreas]             = useState<AreaOfLife[]>([]);
  const [allBlocks, setAllBlocks]     = useState<TemplateBlock[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedDay, setSelectedDay] = useState(1); // default Monday

  // Block modal state
  const [modalVisible, setModalVisible]     = useState(false);
  const [editingBlock, setEditingBlock]     = useState<TemplateBlock | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [timeHour, setTimeHour]             = useState(9);
  const [timeMinute, setTimeMinute]         = useState(0);
  const [timeIsPM, setTimeIsPM]             = useState(false);
  const [saving, setSaving]                 = useState(false);

  const setTimeParts = (hour: number, minute: number, isPM: boolean) => {
    setTimeHour(hour); setTimeMinute(minute); setTimeIsPM(isPM);
  };

  // Bedtime modal state
  const [bedtimeModalVisible, setBedtimeModalVisible] = useState(false);
  const [bedHour, setBedHour]     = useState(10);
  const [bedMinute, setBedMinute] = useState(0);
  const [bedIsPM, setBedIsPM]     = useState(true);
  const [savingBedtime, setSavingBedtime] = useState(false);

  const setBedParts = (hour: number, minute: number, isPM: boolean) => {
    setBedHour(hour); setBedMinute(minute); setBedIsPM(isPM);
  };

  const openBedtimeModal = () => {
    const { hour, minute, isPM } = fromTimeString(settings.bedtime);
    setBedParts(hour, minute, isPM);
    setBedtimeModalVisible(true);
  };

  const saveBedtime = async () => {
    setSavingBedtime(true);
    const bedtime = toTimeString(bedHour, bedMinute, bedIsPM);
    const { error } = await supabase
      .from('user_settings')
      .update({ bedtime })
      .eq('user_id', session!.user.id);
    if (!error) setSettings(prev => ({ ...prev, bedtime }));
    setSavingBedtime(false);
    setBedtimeModalVisible(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Start on whichever day the user configured as their week start
  useEffect(() => { setSelectedDay(settings.week_start_day); }, [settings.week_start_day]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: sData }, { data: aData }, { data: bData }] = await Promise.all([
      supabase.from('user_settings').select('*').single(),
      supabase.from('areas_of_life').select('*').order('created_at', { ascending: true }),
      supabase.from('weekly_template_blocks').select('*'),
    ]);
    if (sData) setSettings(sData);
    if (aData) setAreas(aData);
    if (bData) setAllBlocks(bData);
    setLoading(false);
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  // Sorted blocks for the visible day
  const dayBlocks   = allBlocks
    .filter(b => b.day_of_week === selectedDay)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const timedBlocks = dayBlocks.filter(b => !b.is_all_day);

  // Each block's end time = next block's start, or bedtime for the last one
  const endTimeFor = (index: number): string =>
    timedBlocks[index + 1]?.start_time ?? settings.bedtime;

  // Tab order starts from week_start_day and wraps around
  const orderedDays = Array.from({ length: 7 }, (_, i) => (settings.week_start_day + i) % 7);

  // Weekly hours per area across all 7 days
  const weeklyHours = areas.map(area => {
    const blocks = allBlocks.filter(b => b.area_of_life_id === area.id && !b.is_all_day);
    const totalMins = blocks.reduce((sum, block) => {
      const siblings = allBlocks
        .filter(b => b.day_of_week === block.day_of_week && !b.is_all_day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const idx = siblings.findIndex(b => b.id === block.id);
      const end = siblings[idx + 1]?.start_time ?? settings.bedtime;
      const mins = minsBetween(block.start_time, end);
      return sum + (mins > 0 ? mins : 0);
    }, 0);
    return { area, totalMins };
  }).filter(x => x.totalMins > 0);

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const openAdd = () => {
    if (areas.length === 0) {
      Alert.alert('No Areas Yet', 'Create at least one Area of Life before adding blocks.');
      return;
    }
    setEditingBlock(null);
    setSelectedAreaId(areas[0].id);
    setTimeParts(9, 0, false); // default 9:00 AM
    setModalVisible(true);
  };

  const openEdit = (block: TemplateBlock) => {
    setEditingBlock(block);
    setSelectedAreaId(block.area_of_life_id);
    const { hour, minute, isPM } = fromTimeString(block.start_time);
    setTimeParts(hour, minute, isPM);
    setModalVisible(true);
  };

  const closeModal = () => { setModalVisible(false); setEditingBlock(null); };

  const save = async () => {
    if (!selectedAreaId) return;
    setSaving(true);
    const startTime = toTimeString(timeHour, timeMinute, timeIsPM);

    // No two blocks can share the same start time on the same day
    const conflict = timedBlocks.find(b => b.start_time === startTime && b.id !== editingBlock?.id);
    if (conflict) {
      Alert.alert('Time Conflict', 'A block already starts at this time. Choose a different time.');
      setSaving(false);
      return;
    }

    if (editingBlock) {
      const { error } = await supabase
        .from('weekly_template_blocks')
        .update({ area_of_life_id: selectedAreaId, start_time: startTime })
        .eq('id', editingBlock.id);
      if (!error) {
        setAllBlocks(prev => prev.map(b =>
          b.id === editingBlock.id
            ? { ...b, area_of_life_id: selectedAreaId, start_time: startTime }
            : b
        ));
      }
    } else {
      const { data, error } = await supabase
        .from('weekly_template_blocks')
        .insert({
          user_id: session!.user.id,
          area_of_life_id: selectedAreaId,
          day_of_week: selectedDay,
          start_time: startTime,
          end_time: startTime, // UI derives real end time; this is a placeholder
          is_all_day: false,
        })
        .select()
        .single();
      if (!error && data) setAllBlocks(prev => [...prev, data]);
    }
    setSaving(false);
    closeModal();
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDelete = (block: TemplateBlock) => {
    Alert.alert(
      'Delete Block',
      'Remove this block from the template? Any scheduled tasks will move to the All Day section as a reminder to reschedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteBlock(block.id) },
      ]
    );
  };

  const deleteBlock = async (id: string) => {
    // Move all future task instances for this block to All Day before deleting
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await supabase
      .from('task_instances')
      .update({ weekly_template_block_id: null })
      .eq('weekly_template_block_id', id)
      .gte('scheduled_date', todayStr);

    const { error } = await supabase.from('weekly_template_blocks').delete().eq('id', id);
    if (!error) setAllBlocks(prev => prev.filter(b => b.id !== id));
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add Block</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Weekly Template</Text>

      {/* Day tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={styles.tabsContent}
      >
        {orderedDays.map(day => (
          <TouchableOpacity
            key={day}
            style={[styles.tab, selectedDay === day && styles.tabActive]}
            onPress={() => setSelectedDay(day)}
          >
            <Text style={[styles.tabText, selectedDay === day && styles.tabTextActive]}>
              {DAY_SHORT[day]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Blocks */}
      <ScrollView style={styles.blockList} showsVerticalScrollIndicator={false}>

        {/* All Day card — pinned to top, cannot be deleted */}
        <View style={styles.allDayCard}>
          <Text style={styles.allDayTitle}>All Day</Text>
          <Text style={styles.allDayHint}>holidays · birthdays · events</Text>
        </View>

        {timedBlocks.length === 0 ? (
          <Text style={styles.emptyText}>
            No blocks yet.{'\n'}Tap "+ Add Block" to build your {DAY_FULL[selectedDay]} schedule.
          </Text>
        ) : (
          timedBlocks.map((block, index) => {
            const area   = areas.find(a => a.id === block.area_of_life_id);
            const colors = area ? getPalette(area.color) : null;
            return (
              <TouchableOpacity
                key={block.id}
                style={[styles.blockCard, { backgroundColor: colors?.light ?? '#f5f5f5' }]}
                onPress={() => openEdit(block)}
                activeOpacity={0.8}
              >
                <View style={styles.blockInner}>
                  <Text style={[styles.blockTime, { color: colors?.dark ?? '#333' }]}>
                    {fmt(block.start_time)} → {fmt(endTimeFor(index))}
                  </Text>
                  <Text style={[styles.blockArea, { color: colors?.dark ?? '#333' }]}>
                    {area?.name ?? '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => confirmDelete(block)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.blockDeleteBtn, { color: colors?.dark ?? '#999' }]}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* Bedtime card */}
        <TouchableOpacity style={styles.bedtimeCard} onPress={openBedtimeModal} activeOpacity={0.8}>
          <View style={styles.bedtimeInner}>
            <Text style={styles.bedtimeLabel}>🌙 Bedtime</Text>
            <Text style={styles.bedtimeTime}>{fmt(settings.bedtime)}</Text>
          </View>
          <Text style={styles.bedtimeEdit}>Edit</Text>
        </TouchableOpacity>

        {/* Hours summary */}
        {weeklyHours.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Weekly Hours by Area</Text>
            {weeklyHours.map(({ area, totalMins }) => {
              const colors = getPalette(area.color);
              const h = Math.floor(totalMins / 60);
              const m = totalMins % 60;
              return (
                <View key={area.id} style={styles.summaryRow}>
                  <View style={[styles.summarySwatch, { backgroundColor: colors.light }]}>
                    <View style={[styles.summaryDot, { backgroundColor: colors.dark }]} />
                  </View>
                  <Text style={styles.summaryAreaName}>{area.name}</Text>
                  <Text style={styles.summaryHours}>
                    {h > 0 ? `${h}h` : ''}{m > 0 ? ` ${m}m` : ''} / wk
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Bedtime Modal */}
      <Modal visible={bedtimeModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setBedtimeModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Bedtime</Text>
            <TouchableOpacity onPress={saveBedtime} disabled={savingBedtime}>
              {savingBedtime
                ? <ActivityIndicator size="small" />
                : <Text style={styles.modalSave}>Save</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Time</Text>
            <TimePicker
              hour={bedHour}
              minute={bedMinute}
              isPM={bedIsPM}
              onChange={setBedParts}
            />
            <Text style={styles.bedtimeHint}>
              Bedtime marks the end of your last block each day. Blocks after your final entry run until this time.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>

          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingBlock ? 'Edit Block' : DAY_FULL[selectedDay]}
            </Text>
            <TouchableOpacity onPress={save} disabled={!selectedAreaId || saving}>
              {saving
                ? <ActivityIndicator size="small" />
                : <Text style={[styles.modalSave, !selectedAreaId && { opacity: 0.4 }]}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>

            {/* Start time */}
            <Text style={styles.fieldLabel}>Start Time</Text>
            <TimePicker
              hour={timeHour}
              minute={timeMinute}
              isPM={timeIsPM}
              onChange={setTimeParts}
            />

            {/* Area picker */}
            <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Area of Life</Text>
            <View style={styles.areaPicker}>
              {areas.map(area => {
                const colors     = getPalette(area.color);
                const isSelected = selectedAreaId === area.id;
                return (
                  <TouchableOpacity
                    key={area.id}
                    style={[
                      styles.areaChip,
                      { backgroundColor: colors.light },
                      isSelected && { borderColor: colors.dark, borderWidth: 2.5 },
                    ]}
                    onPress={() => setSelectedAreaId(area.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.areaChipText, { color: colors.dark }]}>
                      {area.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Live block preview */}
            {selectedAreaId && (() => {
              const area   = areas.find(a => a.id === selectedAreaId);
              const colors = area ? getPalette(area.color) : null;
              return colors ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Preview</Text>
                  <View style={[styles.previewCard, { backgroundColor: colors.light }]}>
                    <Text style={[styles.previewTime, { color: colors.dark }]}>
                      {fmt(toTimeString(timeHour, timeMinute, timeIsPM))} → ...
                    </Text>
                    <Text style={[styles.previewAreaName, { color: colors.dark }]}>
                      {area?.name}
                    </Text>
                  </View>
                </>
              ) : null;
            })()}

          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_BACKGROUND, paddingTop: 64 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 24, marginBottom: 8,
  },
  backLink: { color: '#6b7280', fontSize: 15 },
  addBtn:   { backgroundColor: '#000', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', paddingHorizontal: 24, marginBottom: 16 },

  tabsRow:     { flexGrow: 0, marginBottom: 12 },
  tabsContent: { paddingHorizontal: 20, gap: 8 },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabActive:     { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  tabText:       { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  blockList: { flex: 1, paddingHorizontal: 24 },

  allDayCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb', borderStyle: 'dashed',
  },
  allDayTitle: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  allDayHint:  { fontSize: 12, color: '#c4c4c4', marginTop: 2 },

  emptyText: {
    textAlign: 'center', color: '#9ca3af', marginTop: 32,
    fontSize: 14, lineHeight: 22,
  },

  blockCard:      { borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  blockInner:     { flex: 1 },
  blockTime:      { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  blockArea:      { fontSize: 16, fontWeight: '700' },
  blockDeleteBtn: { fontSize: 16, opacity: 0.35, paddingLeft: 8 },

  bedtimeCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    marginTop: 4, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  bedtimeInner: { flex: 1 },
  bedtimeLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 3 },
  bedtimeTime:  { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  bedtimeEdit:  { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  bedtimeHint:  { fontSize: 13, color: '#9ca3af', marginTop: 20, lineHeight: 20, textAlign: 'center' },

  summary: {
    marginTop: 24, backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12,
  },
  summaryTitle:    { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summarySwatch:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryDot:      { width: 8, height: 8, borderRadius: 4 },
  summaryAreaName: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  summaryHours:    { fontSize: 14, fontWeight: '600', color: '#6b7280' },

  modal: { flex: 1, backgroundColor: APP_BACKGROUND },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff',
  },
  modalCancel: { color: '#6b7280', fontSize: 16 },
  modalTitle:  { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  modalSave:   { color: '#000', fontSize: 16, fontWeight: '700' },
  modalBody:   { padding: 24 },

  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  areaPicker:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  areaChip:     { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  areaChipText: { fontSize: 14, fontWeight: '600' },

  previewCard:     { borderRadius: 14, padding: 16, marginTop: 8 },
  previewTime:     { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  previewAreaName: { fontSize: 16, fontWeight: '700' },
});
