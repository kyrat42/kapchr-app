import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';
import { PALETTE, APP_BACKGROUND, getPalette, type PaletteKey } from '@/lib/constants/palette';
import ColorPicker from '@/components/ui/ColorPicker';
import type { AreaOfLife } from '@/lib/types';

const MAX_AREAS = 10;

export default function AreasScreen() {
  const router = useRouter();
  const { session } = useAuthStore();

  // ── Data state ──────────────────────────────────────────────
  const [areas, setAreas] = useState<AreaOfLife[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Modal state ─────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AreaOfLife | null>(null);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<PaletteKey>('forest');
  const [saving, setSaving] = useState(false);

  // Refresh areas every time this screen comes into focus
  // (e.g. navigating back from another settings page)
  useFocusEffect(
    useCallback(() => {
      fetchAreas();
    }, [])
  );

  const fetchAreas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('areas_of_life')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) setAreas(data);
    setLoading(false);
  };

  // ── Modal helpers ────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setName('');
    setSelectedColor('forest');
    setModalVisible(true);
  };

  const openEdit = (area: AreaOfLife) => {
    setEditing(area);
    setName(area.name);
    setSelectedColor(area.color as PaletteKey);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditing(null);
    setName('');
    setSelectedColor('forest');
  };

  // ── Save (create or update) ──────────────────────────────────
  const save = async () => {
    if (!name.trim() || !session) return;
    setSaving(true);

    if (editing) {
      // UPDATE existing area
      const { error } = await supabase
        .from('areas_of_life')
        .update({ name: name.trim(), color: selectedColor })
        .eq('id', editing.id);

      if (!error) {
        setAreas((prev) =>
          prev.map((a) =>
            a.id === editing.id ? { ...a, name: name.trim(), color: selectedColor } : a
          )
        );
      }
    } else {
      // INSERT new area
      const { data, error } = await supabase
        .from('areas_of_life')
        .insert({ name: name.trim(), color: selectedColor, user_id: session.user.id })
        .select()
        .single();

      if (!error && data) setAreas((prev) => [...prev, data]);
    }

    setSaving(false);
    closeModal();
  };

  // ── Delete with confirmation ─────────────────────────────────
  const confirmDelete = (area: AreaOfLife) => {
    Alert.alert(
      'Delete Area',
      `Delete "${area.name}"? Time blocks using this area will lose their color.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteArea(area.id) },
      ]
    );
  };

  const deleteArea = async (id: string) => {
    const { error } = await supabase.from('areas_of_life').delete().eq('id', id);
    if (!error) setAreas((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Settings</Text>
        </TouchableOpacity>
        {areas.length < MAX_AREAS && (
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.title}>Areas of Life</Text>
      <Text style={styles.count}>{areas.length} / {MAX_AREAS} areas</Text>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : areas.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No areas yet.</Text>
          <Text style={styles.emptySubtext}>Tap "+ Add" to create your first area of life.</Text>
        </View>
      ) : (
        <FlatList
          data={areas}
          keyExtractor={(item) => item.id}
          style={{ marginTop: 16 }}
          renderItem={({ item }) => {
            const colors = getPalette(item.color);
            return (
              <TouchableOpacity style={styles.row} onPress={() => openEdit(item)}>
                {/* Color swatch */}
                <View style={[styles.swatch, { backgroundColor: colors.light }]}>
                  <View style={[styles.swatchDot, { backgroundColor: colors.dark }]} />
                </View>
                <Text style={styles.rowName}>{item.name}</Text>
                <TouchableOpacity
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>

          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editing ? 'Edit Area' : 'New Area'}</Text>
            <TouchableOpacity onPress={save} disabled={!name.trim() || saving}>
              {saving
                ? <ActivityIndicator size="small" />
                : <Text style={[styles.modalSave, !name.trim() && styles.modalSaveDisabled]}>
                    Save
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {/* Name field */}
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Health & Wellness"
              maxLength={40}
              autoFocus
            />

            {/* Color picker */}
            <Text style={[styles.fieldLabel, { marginTop: 28 }]}>Color</Text>
            <ColorPicker selected={selectedColor} onSelect={setSelectedColor} />

            {/* Live preview */}
            <Text style={[styles.fieldLabel, { marginTop: 28 }]}>Preview</Text>
            <View style={[styles.preview, { backgroundColor: getPalette(selectedColor).light }]}>
              <Text style={[styles.previewText, { color: getPalette(selectedColor).dark }]}>
                {name.trim() || 'Area Name'}
              </Text>
            </View>
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
  backLink: {
    color: '#6b7280',
    fontSize: 15,
  },
  addButton: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  count: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 64,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 6,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  swatchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowName: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  deleteButton: {
    padding: 4,
  },
  deleteText: {
    color: '#d1d5db',
    fontSize: 16,
  },

  // ── Modal ──────────────────────────────────────────────────
  modal: {
    flex: 1,
    backgroundColor: APP_BACKGROUND,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalSaveDisabled: {
    opacity: 0.3,
  },
  modalBody: {
    padding: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  preview: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  previewText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
