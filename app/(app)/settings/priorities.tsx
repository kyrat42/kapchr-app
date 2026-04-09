import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';
import { APP_BACKGROUND } from '@/lib/constants/palette';

interface PriorityLevel {
  id: string;
  user_id: string;
  label: string;
  sort_index: number;
}

export default function PrioritiesScreen() {
  const router = useRouter();
  const { session } = useAuthStore();

  const [priorities, setPriorities] = useState<PriorityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PriorityLevel | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { fetchPriorities(); }, []);

  const fetchPriorities = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('priority_levels')
      .select('*')
      .order('sort_index', { ascending: true });
    if (data) setPriorities(data);
    setLoading(false);
  };

  // ── Reorder with ↑ ↓ buttons ─────────────────────────────────────────────────
  // Swaps two adjacent items and persists both new sort_index values to the DB.
  const move = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= priorities.length) return;

    const updated = [...priorities];
    const temp = updated[index];
    updated[index] = { ...updated[swapIndex], sort_index: temp.sort_index };
    updated[swapIndex] = { ...temp, sort_index: updated[swapIndex].sort_index };

    setPriorities(updated); // Instant local update

    await Promise.all([
      supabase.from('priority_levels')
        .update({ sort_index: updated[index].sort_index })
        .eq('id', updated[index].id),
      supabase.from('priority_levels')
        .update({ sort_index: updated[swapIndex].sort_index })
        .eq('id', updated[swapIndex].id),
    ]);
  };

  // ── Add / Edit ────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingItem(null);
    setLabelInput('');
    setModalVisible(true);
  };

  const openEdit = (item: PriorityLevel) => {
    setEditingItem(item);
    setLabelInput(item.label);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingItem(null);
    setLabelInput('');
  };

  const save = async () => {
    if (!labelInput.trim()) return;
    setSaving(true);

    if (editingItem) {
      const { error } = await supabase
        .from('priority_levels')
        .update({ label: labelInput.trim() })
        .eq('id', editingItem.id);
      if (!error) {
        setPriorities((prev) =>
          prev.map((p) => p.id === editingItem.id ? { ...p, label: labelInput.trim() } : p)
        );
      }
    } else {
      const nextIndex = priorities.length + 1;
      const { data, error } = await supabase
        .from('priority_levels')
        .insert({ label: labelInput.trim(), sort_index: nextIndex, user_id: session!.user.id })
        .select()
        .single();
      if (!error && data) setPriorities((prev) => [...prev, data]);
    }

    setSaving(false);
    closeModal();
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const confirmDelete = (item: PriorityLevel) => {
    Alert.alert(
      'Delete Priority',
      `Delete "${item.label}"? Task instances using this priority will become unprioritized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item) },
      ]
    );
  };

  const deleteItem = async (item: PriorityLevel) => {
    const { error } = await supabase.from('priority_levels').delete().eq('id', item.id);
    if (!error) {
      const remaining = priorities
        .filter((p) => p.id !== item.id)
        .map((p, i) => ({ ...p, sort_index: i + 1 }));
      setPriorities(remaining);
      await Promise.all(
        remaining.map((p) =>
          supabase.from('priority_levels').update({ sort_index: p.sort_index }).eq('id', p.id)
        )
      );
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const renderItem = ({ item, index }: { item: PriorityLevel; index: number }) => (
    <View style={styles.row}>
      {/* Priority number badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.sort_index}</Text>
      </View>

      {/* Label — tap to edit */}
      <TouchableOpacity style={styles.labelContainer} onPress={() => openEdit(item)}>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.editHint}>tap to edit</Text>
      </TouchableOpacity>

      {/* Up / Down reorder buttons */}
      <View style={styles.reorderButtons}>
        <TouchableOpacity
          onPress={() => move(index, 'up')}
          disabled={index === 0}
          style={styles.reorderBtn}
        >
          <Text style={[styles.reorderBtnText, index === 0 && styles.reorderBtnDisabled]}>▲</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => move(index, 'down')}
          disabled={index === priorities.length - 1}
          style={styles.reorderBtn}
        >
          <Text style={[styles.reorderBtnText, index === priorities.length - 1 && styles.reorderBtnDisabled]}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Delete */}
      <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteBtn}>
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Priority Levels</Text>
      <Text style={styles.subtitle}>1 is highest priority. Use ▲ ▼ to reorder.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={priorities}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={{ marginTop: 16 }}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onShow={() => setTimeout(() => inputRef.current?.focus(), 100)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingItem ? 'Edit Priority' : 'New Priority'}
            </Text>
            <TouchableOpacity onPress={save} disabled={!labelInput.trim() || saving}>
              {saving
                ? <ActivityIndicator size="small" />
                : <Text style={[styles.modalSave, !labelInput.trim() && { opacity: 0.4 }]}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={labelInput}
              onChangeText={setLabelInput}
              placeholder="e.g. Critical, High, Nice to Have..."
              maxLength={30}
            />
            <Text style={styles.fieldHint}>
              New priorities are added to the bottom. Use ▲ ▼ to reorder after saving.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_BACKGROUND,
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backLink: { color: '#6b7280', fontSize: 15 },
  addBtn: {
    backgroundColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  subtitle: { fontSize: 13, color: '#9ca3af', marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  labelContainer: { flex: 1 },
  label: { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },
  editHint: { fontSize: 11, color: '#c0c0c0', marginTop: 2 },
  reorderButtons: { flexDirection: 'column', gap: 2 },
  reorderBtn: { padding: 4 },
  reorderBtnText: { fontSize: 12, color: '#6b7280' },
  reorderBtnDisabled: { color: '#d1d5db' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: '#d1d5db', fontSize: 14, fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: APP_BACKGROUND },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  modalCancel: { color: '#6b7280', fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  modalSave: { color: '#000', fontSize: 16, fontWeight: '700' },
  modalBody: { padding: 24 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  fieldHint: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
});
