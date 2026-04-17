import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { APP_BACKGROUND } from '@/lib/constants/palette';
import type { PriorityLevel, ChecklistItem, ChecklistItemState } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const strToDate = (t: string | null): Date => {
  const d = new Date();
  if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h, m, 0, 0); }
  else d.setHours(9, 0, 0, 0);
  return d;
};
const dateToStr = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmt = (t: string): string => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

// ─── Local types ──────────────────────────────────────────────────────────────
interface InstanceData {
  id: string;
  task_id: string;
  start_time: string | null;
  end_time: string | null;
  priority_level_id: string | null;
  status: string;
  task: {
    id: string;
    name: string;
    notes: string | null;
    checklist_items: ChecklistItem[];
  } | null;
  checklist_item_states: ChecklistItemState[];
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TaskScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [instance, setInstance]   = useState<InstanceData | null>(null);
  const [priorities, setPriorities] = useState<PriorityLevel[]>([]);

  // Editable instance fields
  const [taskName, setTaskName]       = useState('');
  const [notes, setNotes]             = useState('');
  const [priorityId, setPriorityId]   = useState<string | null>(null);
  const [startTime, setStartTime]     = useState<string | null>(null);
  const [endTime, setEndTime]         = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  // Checklist
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [itemStates, setItemStates]         = useState<ChecklistItemState[]>([]);
  const [newItemText, setNewItemText]       = useState('');
  const [addingItem, setAddingItem]         = useState(false);
  const newItemRef = useRef<TextInput>(null);

  useEffect(() => { loadData(); }, [id]);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    const [{ data: inst }, { data: pData }] = await Promise.all([
      supabase
        .from('task_instances')
        .select(`
          id, task_id, start_time, end_time, priority_level_id, status,
          task:tasks(id, name, notes, checklist_items(id, label, sort_order)),
          checklist_item_states(id, checklist_item_id, is_done)
        `)
        .eq('id', id)
        .single(),
      supabase.from('priority_levels').select('*').order('sort_index'),
    ]);

    if (inst) {
      const data = inst as InstanceData;
      setInstance(data);
      setTaskName(data.task?.name ?? '');
      setNotes(data.task?.notes ?? '');
      setPriorityId(data.priority_level_id);
      setStartTime(data.start_time);
      setEndTime(data.end_time);
      const items = [...(data.task?.checklist_items ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order);
      setChecklistItems(items);
      setItemStates(data.checklist_item_states ?? []);
    }
    if (pData) setPriorities(pData);
    setLoading(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!instance) return;
    setSaving(true);
    await Promise.all([
      supabase
        .from('tasks')
        .update({ name: taskName.trim() || 'Untitled', notes })
        .eq('id', instance.task_id),
      supabase
        .from('task_instances')
        .update({ priority_level_id: priorityId, start_time: startTime, end_time: endTime })
        .eq('id', instance.id),
    ]);
    setSaving(false);
    router.back();
  };

  // ── Checklist ─────────────────────────────────────────────────────────────
  const toggleItem = async (state: ChecklistItemState) => {
    const newDone = !state.is_done;
    setItemStates(prev => prev.map(s => s.id === state.id ? { ...s, is_done: newDone } : s));
    await supabase.from('checklist_item_states').update({ is_done: newDone }).eq('id', state.id);
  };

  // If an item exists on the task but has no state for this instance yet, create one
  const getOrCreateState = async (item: ChecklistItem): Promise<ChecklistItemState | null> => {
    const existing = itemStates.find(s => s.checklist_item_id === item.id);
    if (existing) return existing;
    const { data } = await supabase
      .from('checklist_item_states')
      .insert({ task_instance_id: instance!.id, checklist_item_id: item.id, is_done: false })
      .select()
      .single();
    if (data) {
      const newState = data as ChecklistItemState;
      setItemStates(prev => [...prev, newState]);
      return newState;
    }
    return null;
  };

  const handleChecklistTap = async (item: ChecklistItem) => {
    const state = await getOrCreateState(item);
    if (state) await toggleItem(state);
  };

  const addChecklistItem = async () => {
    if (!newItemText.trim() || !instance) return;
    setAddingItem(true);
    const { data: item } = await supabase
      .from('checklist_items')
      .insert({ task_id: instance.task_id, label: newItemText.trim(), sort_order: checklistItems.length })
      .select()
      .single();
    if (item) {
      const { data: state } = await supabase
        .from('checklist_item_states')
        .insert({ task_instance_id: instance.id, checklist_item_id: item.id, is_done: false })
        .select()
        .single();
      setChecklistItems(prev => [...prev, item as ChecklistItem]);
      if (state) setItemStates(prev => [...prev, state as ChecklistItemState]);
    }
    setNewItemText('');
    setAddingItem(false);
    newItemRef.current?.focus();
  };

  const deleteChecklistItem = (item: ChecklistItem) => {
    Alert.alert('Remove Item', `Remove "${item.label}" from this task?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setChecklistItems(prev => prev.filter(i => i.id !== item.id));
          setItemStates(prev => prev.filter(s => s.checklist_item_id !== item.id));
          await supabase.from('checklist_items').delete().eq('id', item.id);
        },
      },
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" />
            : <Text style={styles.saveBtn}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Task name */}
        <TextInput
          style={styles.taskNameInput}
          value={taskName}
          onChangeText={setTaskName}
          placeholder="Task name"
          placeholderTextColor="#bbb"
          returnKeyType="done"
        />

        {/* ── Instance section ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>This Instance</Text>

        <Text style={styles.fieldLabel}>Priority</Text>
        <View style={styles.listCard}>
          {[{ id: null, label: 'None' }, ...priorities].map((p, index, arr) => {
            const isSelected = priorityId === p.id;
            const isLast     = index === arr.length - 1;
            return (
              <TouchableOpacity
                key={p.id ?? 'none'}
                style={[styles.listRow, !isLast && styles.listRowBorder]}
                onPress={() => setPriorityId(p.id)}
                activeOpacity={0.6}
              >
                <Text style={[styles.listRowText, isSelected && styles.listRowTextSelected]}>
                  {p.label}
                </Text>
                {isSelected && <Text style={styles.listRowCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Time</Text>
        <View style={styles.timeRow}>
          <TouchableOpacity
            style={styles.timeBtn}
            onPress={() => setActivePicker('start')}
            activeOpacity={0.7}
          >
            <Text style={styles.timeBtnLabel}>Start</Text>
            <Text style={styles.timeBtnValue}>{startTime ? fmt(startTime) : 'Not set'}</Text>
          </TouchableOpacity>
          <Text style={styles.timeSep}>→</Text>
          <TouchableOpacity
            style={styles.timeBtn}
            onPress={() => setActivePicker('end')}
            activeOpacity={0.7}
          >
            <Text style={styles.timeBtnLabel}>End</Text>
            <Text style={styles.timeBtnValue}>{endTime ? fmt(endTime) : 'Not set'}</Text>
          </TouchableOpacity>
        </View>

        {activePicker && (
          <DateTimePicker
            mode="time"
            value={strToDate(activePicker === 'start' ? startTime : endTime)}
            is24Hour={false}
            onChange={(event, date) => {
              if (event.type !== 'dismissed' && date) {
                if (activePicker === 'start') setStartTime(dateToStr(date));
                else setEndTime(dateToStr(date));
              }
              setActivePicker(null);
            }}
          />
        )}

        {/* ── Task section ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>Task</Text>

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add a note…"
          placeholderTextColor="#bbb"
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Checklist</Text>

        {checklistItems.length > 0 && (
          <View style={styles.listCard}>
            {checklistItems.map((item, index) => {
              const state  = itemStates.find(s => s.checklist_item_id === item.id);
              const isDone = state?.is_done ?? false;
              const isLast = index === checklistItems.length - 1;
              return (
                <View
                  key={item.id}
                  style={[styles.checklistRow, !isLast && styles.listRowBorder]}
                >
                  <TouchableOpacity
                    onPress={() => handleChecklistTap(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                      {isDone && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <Text style={[styles.checklistLabel, isDone && styles.checklistLabelDone]}>
                    {item.label}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteChecklistItem(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Add checklist item */}
        <View style={styles.addItemRow}>
          <TextInput
            ref={newItemRef}
            style={styles.addItemInput}
            value={newItemText}
            onChangeText={setNewItemText}
            placeholder="+ Add item"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            onSubmitEditing={addChecklistItem}
          />
          {newItemText.trim().length > 0 && (
            <TouchableOpacity onPress={addChecklistItem} disabled={addingItem}>
              {addingItem
                ? <ActivityIndicator size="small" />
                : <Text style={styles.addItemBtn}>Add</Text>
              }
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_BACKGROUND },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff',
  },
  backLink: { fontSize: 15, color: '#6b7280' },
  saveBtn:  { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },

  body: { flex: 1, paddingHorizontal: 20 },

  taskNameInput: {
    fontSize: 22, fontWeight: '600', color: '#1a1a1a',
    paddingVertical: 20, borderBottomWidth: 1.5,
    borderBottomColor: '#e5e7eb', marginBottom: 28,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  listCard:            { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', overflow: 'hidden' },
  listRow:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  listRowBorder:       { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  listRowText:         { fontSize: 15, fontWeight: '500', color: '#6b7280' },
  listRowTextSelected: { color: '#1a1a1a', fontWeight: '600' },
  listRowCheck:        { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },

  timeRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeBtn:      { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 12 },
  timeBtnLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  timeBtnValue: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  timeSep:      { fontSize: 16, color: '#9ca3af', fontWeight: '600' },

  notesInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#e5e7eb', padding: 14, fontSize: 15,
    color: '#1a1a1a', minHeight: 100,
  },

  checklistRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  checkbox:          { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkboxDone:      { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  checkmark:         { color: '#fff', fontSize: 11, fontWeight: '800' },
  checklistLabel:    { flex: 1, fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  checklistLabelDone: { textDecorationLine: 'line-through', opacity: 0.4 },
  deleteBtn:         { fontSize: 13, color: '#d1d5db', paddingLeft: 4 },

  addItemRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 },
  addItemInput: { flex: 1, fontSize: 15, color: '#1a1a1a', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  addItemBtn:   { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
});
