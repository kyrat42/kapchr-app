import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth.store';
import { getPalette, APP_BACKGROUND } from '@/lib/constants/palette';
import type { AreaOfLife, PriorityLevel } from '@/lib/types';

// ─── Local Types ──────────────────────────────────────────────────────────────
interface TemplateBlock {
  id: string;
  area_of_life_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
}

interface BlockOverrideLocal {
  id: string;
  weekly_template_block_id: string;
  date: string;
  start_time: string;
  is_cancelled: boolean;
}

interface UserSettings {
  week_start_day: number;
  bedtime: string;
}

interface TaskInstance {
  id: string;
  task_id: string;
  weekly_template_block_id: string | null;
  scheduled_date: string;
  priority_level_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  created_at: string;
  task: { name: string } | null;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTERS     = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES     = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Timezone-safe: builds "YYYY-MM-DD" from local date components
const toDateStr = (d: Date): string => {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const shiftDay = (dateStr: string, delta: number): string => {
  const d = new Date(dateStr + 'T00:00:00'); // force local midnight
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
};

// Computed once at module load
const _today    = new Date();
_today.setHours(0, 0, 0, 0);
const TODAY_STR = toDateStr(_today);

// "HH:MM" string → Date object (today's date, just the time set)
const strToDate = (timeStr: string | null): Date => {
  const d = new Date();
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
};

// Date → "HH:MM" 24-hour string
const dateToTimeStr = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

// "HH:MM" 24-hour → "h:MM AM/PM"
const fmt = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

// "YYYY-MM-DD" → "Wednesday, April 9"
const fmtDateHeader = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES_SHORT[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
};

// ─── Calendar helpers ─────────────────────────────────────────────────────────
// Returns an array of cells for a month grid.
// null = empty padding cell before the 1st of the month.
const buildCalendarCells = (year: number, month: number): (number | null)[] => {
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PlannerScreen() {
  const router      = useRouter();
  const { session } = useAuthStore();

  const [selectedDate, setSelectedDate]       = useState(TODAY_STR);
  const [settings, setSettings]               = useState<UserSettings>({ week_start_day: 1, bedtime: '22:00' });
  const [areas, setAreas]                     = useState<AreaOfLife[]>([]);
  const [allBlocks, setAllBlocks]             = useState<TemplateBlock[]>([]);
  const [priorities, setPriorities]           = useState<PriorityLevel[]>([]);
  const [taskInstances, setTaskInstances]     = useState<TaskInstance[]>([]);
  const [loading, setLoading]                 = useState(true);

  // Calendar picker
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [pickerYear, setPickerYear]           = useState(_today.getFullYear());
  const [pickerMonth, setPickerMonth]         = useState(_today.getMonth());

  // Block overrides for the selected date
  const [blockOverrides, setBlockOverrides] = useState<BlockOverrideLocal[]>([]);

  // Edit block modal
  const [editBlockVisible, setEditBlockVisible]     = useState(false);
  const [editingBlock, setEditingBlock]             = useState<TemplateBlock | null>(null);
  const [editBlockStartTime, setEditBlockStartTime] = useState('');
  const [activeBlockPicker, setActiveBlockPicker]   = useState<'start' | 'end' | null>(null);
  const [savingBlockEdit, setSavingBlockEdit]       = useState(false);

  // Schedule-next modal
  const [scheduleNextVisible, setScheduleNextVisible]       = useState(false);
  const [scheduleNextSource, setScheduleNextSource]         = useState<TaskInstance | null>(null);
  const [scheduleNextDate, setScheduleNextDate]             = useState(TODAY_STR);
  const [scheduleNextInstances, setScheduleNextInstances]   = useState<TaskInstance[]>([]);
  const [scheduleNextLoading, setScheduleNextLoading]       = useState(false);
  const [savingNext, setSavingNext]                         = useState(false);
  const [scheduleCalendarVisible, setScheduleCalendarVisible] = useState(false);
  const [schedulePickerYear, setSchedulePickerYear]         = useState(_today.getFullYear());
  const [schedulePickerMonth, setSchedulePickerMonth]       = useState(_today.getMonth());

  // Add task modal
  const [modalVisible, setModalVisible]       = useState(false);
  const [addingToBlockId, setAddingToBlockId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle]             = useState('');
  const [taskPriorityId, setTaskPriorityId]   = useState<string | null>(null);
  const [taskStartTime, setTaskStartTime]     = useState<string | null>(null);
  const [taskEndTime, setTaskEndTime]         = useState<string | null>(null);
  const [activePicker, setActivePicker]       = useState<'start' | 'end' | null>(null);
  const [savingTask, setSavingTask]           = useState(false);
  const [taskSearchResults, setTaskSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedTaskId, setSelectedTaskId]       = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => { loadStatic(); }, []);
  useEffect(() => { loadTasks(selectedDate); loadBlockOverrides(selectedDate); }, [selectedDate]);
  useFocusEffect(useCallback(() => { loadTasks(selectedDate); loadBlockOverrides(selectedDate); }, [selectedDate]));
  useEffect(() => {
    if (scheduleNextVisible) loadScheduleNextInstances(scheduleNextDate);
  }, [scheduleNextDate, scheduleNextVisible]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const loadStatic = async () => {
    setLoading(true);
    const [{ data: sData }, { data: aData }, { data: bData }, { data: pData }] =
      await Promise.all([
        supabase.from('user_settings').select('*').single(),
        supabase.from('areas_of_life').select('*').order('created_at', { ascending: true }),
        supabase.from('weekly_template_blocks').select('*'),
        supabase.from('priority_levels').select('*').order('sort_index', { ascending: true }),
      ]);
    if (sData) setSettings(sData);
    if (aData) setAreas(aData);
    if (bData) setAllBlocks(bData);
    if (pData) setPriorities(pData);
    setLoading(false);
  };

  const loadTasks = async (date: string) => {
    const { data } = await supabase
      .from('task_instances')
      .select('*, task:tasks(name)')
      .eq('scheduled_date', date)
      .order('created_at', { ascending: true });
    if (data) setTaskInstances(data as TaskInstance[]);
  };

  const loadBlockOverrides = async (date: string) => {
    const { data } = await supabase
      .from('block_overrides')
      .select('*')
      .eq('date', date);
    if (data) setBlockOverrides(data as BlockOverrideLocal[]);
  };

  const loadScheduleNextInstances = async (date: string) => {
    setScheduleNextLoading(true);
    const { data } = await supabase
      .from('task_instances')
      .select('*, task:tasks(name)')
      .eq('scheduled_date', date)
      .order('created_at', { ascending: true });
    if (data) setScheduleNextInstances(data as TaskInstance[]);
    setScheduleNextLoading(false);
  };

  // ── Calendar picker helpers ───────────────────────────────────────────────
  const openCalendar = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
    setCalendarVisible(true);
  };

  const shiftPickerMonth = (delta: number) => {
    let m = pickerMonth + delta;
    let y = pickerYear;
    if (m > 11) { m = 0;  y += 1; }
    if (m < 0)  { m = 11; y -= 1; }
    setPickerMonth(m);
    setPickerYear(y);
  };

  const selectCalendarDay = (day: number) => {
    const d = new Date(pickerYear, pickerMonth, day);
    setSelectedDate(toDateStr(d));
    setCalendarVisible(false);
  };

  const openScheduleCalendar = () => {
    const d = new Date(scheduleNextDate + 'T00:00:00');
    setSchedulePickerYear(d.getFullYear());
    setSchedulePickerMonth(d.getMonth());
    setScheduleCalendarVisible(true);
  };

  const shiftSchedulePickerMonth = (delta: number) => {
    let m = schedulePickerMonth + delta;
    let y = schedulePickerYear;
    if (m > 11) { m = 0;  y += 1; }
    if (m < 0)  { m = 11; y -= 1; }
    setSchedulePickerMonth(m);
    setSchedulePickerYear(y);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const dayOfWeek       = selectedDateObj.getDay();

  const timedBlocks = allBlocks
    .filter(b => b.day_of_week === dayOfWeek && !b.is_all_day)
    .map(b => {
      const override = blockOverrides.find(o => o.weekly_template_block_id === b.id);
      if (override?.is_cancelled) return null;
      return {
        ...b,
        start_time: override?.start_time ?? b.start_time,
        end_time:   override?.end_time   ?? b.end_time,
        override,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const endTimeFor = (_block: typeof timedBlocks[0], index: number) =>
    timedBlocks[index + 1]?.start_time ?? settings.bedtime;

  const sortByPriority = (instances: TaskInstance[]) =>
    [...instances].sort((a, b) => {
      // 1. Tasks with a start time come first, sorted by that time
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      // 2. Among tasks with no time, sort by priority
      const pa = priorities.find(p => p.id === a.priority_level_id);
      const pb = priorities.find(p => p.id === b.priority_level_id);
      if (pa && pb) return pa.sort_index - pb.sort_index;
      if (pa) return -1;
      if (pb) return 1;
      return 0;
    });

  const allDayInstances   = sortByPriority(taskInstances.filter(t => !t.weekly_template_block_id));
  const instancesForBlock = (blockId: string) =>
    sortByPriority(taskInstances.filter(t => t.weekly_template_block_id === blockId));

  // Schedule-next derived values
  const scheduleNextDayOfWeek = new Date(scheduleNextDate + 'T00:00:00').getDay();
  const timedBlocksForSchedule = allBlocks
    .filter(b => b.day_of_week === scheduleNextDayOfWeek && !b.is_all_day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const endTimeForSchedule = (index: number) =>
    timedBlocksForSchedule[index + 1]?.start_time ?? settings.bedtime;
  const allDayScheduleInstances = sortByPriority(
    scheduleNextInstances.filter(t => !t.weekly_template_block_id),
  );
  const instancesForScheduleBlock = (blockId: string) =>
    sortByPriority(scheduleNextInstances.filter(t => t.weekly_template_block_id === blockId));

  // ── Task actions ──────────────────────────────────────────────────────────
  const searchTasks = async (query: string) => {
    const { data } = await supabase
      .from('tasks')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .limit(8);
    setTaskSearchResults(data ?? []);
  };

  const handleTaskTitleChange = (text: string) => {
    setTaskTitle(text);
    setSelectedTaskId(null); // clear any existing-task selection when typing
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length === 0) {
      setTaskSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => searchTasks(text.trim()), 200);
  };

  const openAddTask = (blockId: string | null) => {
    setAddingToBlockId(blockId);
    setTaskTitle('');
    setTaskPriorityId(null);
    setTaskStartTime(null);
    setTaskEndTime(null);
    setTaskSearchResults([]);
    setSelectedTaskId(null);
    setModalVisible(true);
  };

  const saveTask = async () => {
    if (!taskTitle.trim() || !session) return;
    setSavingTask(true);

    let taskId = selectedTaskId;

    if (!taskId) {
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({ user_id: session.user.id, name: taskTitle.trim() })
        .select()
        .single();
      if (taskError || !taskData) { setSavingTask(false); return; }
      taskId = taskData.id;
    }

    const { data: instData, error: instError } = await supabase
      .from('task_instances')
      .insert({
        task_id:                  taskId,
        user_id:                  session.user.id,
        scheduled_date:           selectedDate,
        weekly_template_block_id: addingToBlockId,
        priority_level_id:        taskPriorityId,
        start_time:               taskStartTime,
        end_time:                 taskEndTime,
        status:                   'pending',
      })
      .select('*, task:tasks(name)')
      .single();

    if (!instError && instData) {
      setTaskInstances(prev => [...prev, instData as TaskInstance]);
    }
    setSavingTask(false);
    setModalVisible(false);
  };

  const toggleComplete = async (instance: TaskInstance) => {
    const newStatus = instance.status === 'complete' ? 'pending' : 'complete';
    setTaskInstances(prev =>
      prev.map(t => t.id === instance.id ? { ...t, status: newStatus } : t),
    );
    await supabase.from('task_instances').update({ status: newStatus }).eq('id', instance.id);

    if (newStatus === 'complete') {
      setScheduleNextDate(TODAY_STR);
      setScheduleNextSource(instance);
      Alert.alert(
        'Task Complete',
        'Schedule the next instance?',
        [
          {
            text: 'Not now', style: 'cancel',
            // TODO: create a reminder to schedule this task — revisit when reminders are built
          },
          { text: 'Schedule', onPress: () => setScheduleNextVisible(true) },
        ],
      );
    }
  };

  const deleteInstance = (instance: TaskInstance) => {
    const name = instance.task?.name ?? 'this task';
    Alert.alert('Delete Task', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setTaskInstances(prev => prev.filter(t => t.id !== instance.id));
          await supabase.from('task_instances').delete().eq('id', instance.id);
          await supabase.from('tasks').delete().eq('id', instance.task_id);
        },
      },
    ]);
  };

  const saveNext = async (blockId: string | null) => {
    if (!scheduleNextSource || !session) return;
    setSavingNext(true);

    const { data, error } = await supabase
      .from('task_instances')
      .insert({
        task_id:                  scheduleNextSource.task_id,
        user_id:                  session.user.id,
        scheduled_date:           scheduleNextDate,
        weekly_template_block_id: blockId,
        priority_level_id:        scheduleNextSource.priority_level_id,
        start_time:               scheduleNextSource.start_time,
        end_time:                 scheduleNextSource.end_time,
        status:                   'pending',
      })
      .select('*, task:tasks(name)')
      .single();

    if (!error && data) {
      if (scheduleNextDate === selectedDate) {
        setTaskInstances(prev => [...prev, data as TaskInstance]);
      }
      setScheduleNextInstances(prev => [...prev, data as TaskInstance]);
    }
    setSavingNext(false);
    setScheduleNextVisible(false);
  };

  // ── Block edit actions ────────────────────────────────────────────────────
  const openEditBlock = (block: typeof timedBlocks[0]) => {
    setEditingBlock(block);
    setEditBlockStartTime(block.start_time);
    setEditBlockVisible(true);
  };

  const saveBlockEdit = async () => {
    if (!editingBlock || !session) return;
    setSavingBlockEdit(true);

    const existing = blockOverrides.find(
      o => o.weekly_template_block_id === editingBlock.id,
    );

    const payload = {
      weekly_template_block_id: editingBlock.id,
      user_id:                  session.user.id,
      date:                     selectedDate,
      start_time:               editBlockStartTime,
      is_cancelled:             false,
    };

    let saved: BlockOverrideLocal | null = null;

    if (existing) {
      const { data } = await supabase
        .from('block_overrides')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      saved = data as BlockOverrideLocal;
    } else {
      const { data } = await supabase
        .from('block_overrides')
        .insert(payload)
        .select()
        .single();
      saved = data as BlockOverrideLocal;
    }

    if (saved) {
      setBlockOverrides(prev => [
        ...prev.filter(o => o.weekly_template_block_id !== editingBlock.id),
        saved!,
      ]);
    }
    setSavingBlockEdit(false);
    setEditBlockVisible(false);
  };

  const cancelBlockToday = async () => {
    if (!editingBlock || !session) return;
    setSavingBlockEdit(true);

    const existing = blockOverrides.find(
      o => o.weekly_template_block_id === editingBlock.id,
    );

    const payload = {
      weekly_template_block_id: editingBlock.id,
      user_id:                  session.user.id,
      date:                     selectedDate,
      start_time:               editingBlock.start_time,
      is_cancelled:             true,
    };

    let saved: BlockOverrideLocal | null = null;

    if (existing) {
      const { data } = await supabase
        .from('block_overrides')
        .update({ is_cancelled: true })
        .eq('id', existing.id)
        .select()
        .single();
      saved = data as BlockOverrideLocal;
    } else {
      const { data } = await supabase
        .from('block_overrides')
        .insert(payload)
        .select()
        .single();
      saved = data as BlockOverrideLocal;
    }

    if (saved) {
      setBlockOverrides(prev => [
        ...prev.filter(o => o.weekly_template_block_id !== editingBlock.id),
        saved!,
      ]);
      // Move any task instances in this block today to All Day
      await supabase
        .from('task_instances')
        .update({ weekly_template_block_id: null })
        .eq('weekly_template_block_id', editingBlock.id)
        .eq('scheduled_date', selectedDate);
      setTaskInstances(prev => prev.map(t =>
        t.weekly_template_block_id === editingBlock.id
          ? { ...t, weekly_template_block_id: null }
          : t,
      ));
    }
    setSavingBlockEdit(false);
    setEditBlockVisible(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const calendarCells = buildCalendarCells(pickerYear, pickerMonth);

  return (
    <View style={styles.container}>

      {/* ── Date header with arrows ── */}
      <View style={styles.dateHeader}>
        <TouchableOpacity
          onPress={() => setSelectedDate(d => shiftDay(d, -1))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.arrowBtn}
        >
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openCalendar} activeOpacity={0.7} style={styles.dateLabelBtn}>
          <Text style={styles.dateLabel}>{fmtDateHeader(selectedDate)}</Text>
          {selectedDate === TODAY_STR && <Text style={styles.todayBadge}>Today</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSelectedDate(d => shiftDay(d, 1))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.arrowBtn}
        >
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Scrollable day content ── */}
      <ScrollView style={styles.dayContent} showsVerticalScrollIndicator={false}>

        {/* All Day section */}
        <View style={styles.allDaySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>All Day</Text>
            <TouchableOpacity
              onPress={() => openAddTask(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.addBtn}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {allDayInstances.length === 0
            ? <Text style={styles.emptyText}>No all-day items</Text>
            : allDayInstances.map(inst => (
              <TaskRow
                key={inst.id}
                instance={inst}
                priorities={priorities}
                onToggle={toggleComplete}
                onDelete={deleteInstance}
                onPress={() => router.push(`/(app)/task/${inst.id}`)}
              />
            ))
          }
        </View>

        {/* Timed blocks */}
        {timedBlocks.length === 0 ? (
          <Text style={styles.noBlocksText}>
            No blocks for this day.{'\n'}Set up your Weekly Template in Settings.
          </Text>
        ) : (
          timedBlocks.map((block, index) => {
            const area       = areas.find(a => a.id === block.area_of_life_id);
            const colors     = area ? getPalette(area.color) : null;
            const blockInsts = instancesForBlock(block.id);
            return (
              <View
                key={block.id}
                style={[styles.blockSection, { backgroundColor: colors?.light ?? '#f5f5f5' }]}
              >
                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    onPress={() => openEditBlock(block)}
                    activeOpacity={0.7}
                    style={{ flex: 1 }}
                  >
                    <Text style={[styles.blockTime, { color: colors?.dark ?? '#555' }]}>
                      {fmt(block.start_time)} → {fmt(endTimeFor(block, index))}
                      {block.override && <Text style={{ fontSize: 10 }}> ✎</Text>}
                    </Text>
                    <Text style={[styles.blockName, { color: colors?.dark ?? '#333' }]}>
                      {area?.name ?? '—'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openAddTask(block.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.addBtn, { color: colors?.dark ?? '#9ca3af' }]}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {blockInsts.length > 0 && (
                  <View style={styles.taskList}>
                    {blockInsts.map(inst => (
                      <TaskRow
                        key={inst.id}
                        instance={inst}
                        priorities={priorities}
                        onToggle={toggleComplete}
                        onDelete={deleteInstance}
                        onPress={() => router.push(`/(app)/task/${inst.id}`)}
                        dark={colors?.dark}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Bedtime anchor */}
        <View style={styles.bedtimeRow}>
          <Text style={styles.bedtimeText}>🌙  Bedtime · {fmt(settings.bedtime)}</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Calendar picker modal ── */}
      <Modal visible={calendarVisible} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.calendarOverlay}
          activeOpacity={1}
          onPress={() => setCalendarVisible(false)}
        >
          {/* Stop tap propagation so tapping inside the card doesn't close it */}
          <TouchableOpacity activeOpacity={1} style={styles.calendarCard}>

            {/* Month navigation */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => shiftPickerMonth(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.calendarArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {MONTH_NAMES[pickerMonth]} {pickerYear}
              </Text>
              <TouchableOpacity
                onPress={() => shiftPickerMonth(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.calendarArrow}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day-of-week labels */}
            <View style={styles.calendarRow}>
              {DAY_LETTERS.map((letter, i) => (
                <Text key={i} style={styles.calendarDayLabel}>{letter}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.calendarGrid}>
              {calendarCells.map((day, i) => {
                if (day === null) {
                  return <View key={`empty-${i}`} style={styles.calendarCell} />;
                }
                const cellStr   = toDateStr(new Date(pickerYear, pickerMonth, day));
                const isToday   = cellStr === TODAY_STR;
                const isSelected = cellStr === selectedDate;
                return (
                  <TouchableOpacity
                    key={cellStr}
                    style={styles.calendarCell}
                    onPress={() => selectCalendarDay(day)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.calendarCellInner,
                      isSelected && styles.calendarCellSelected,
                      isToday && !isSelected && styles.calendarCellToday,
                    ]}>
                      <Text style={[
                        styles.calendarDayNum,
                        isSelected && styles.calendarDayNumSelected,
                        isToday && !isSelected && styles.calendarDayNumToday,
                      ]}>
                        {day}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Jump to today */}
            <TouchableOpacity
              style={styles.calendarTodayBtn}
              onPress={() => { setSelectedDate(TODAY_STR); setCalendarVisible(false); }}
            >
              <Text style={styles.calendarTodayBtnText}>Go to Today</Text>
            </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Task modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onShow={() => setTimeout(() => titleInputRef.current?.focus(), 100)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Task</Text>
              <TouchableOpacity onPress={saveTask} disabled={!taskTitle.trim() || savingTask}>
                {savingTask
                  ? <ActivityIndicator size="small" />
                  : <Text style={[styles.modalSave, !taskTitle.trim() && { opacity: 0.4 }]}>
                      Save
                    </Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
              <TextInput
                ref={titleInputRef}
                style={styles.titleInput}
                placeholder="Search or create a task"
                placeholderTextColor="#bbb"
                value={taskTitle}
                onChangeText={handleTaskTitleChange}
                returnKeyType="done"
                onSubmitEditing={saveTask}
              />

              {/* Search results */}
              {taskTitle.trim().length > 0 && !selectedTaskId && (
                <View style={styles.searchResults}>
                  {taskSearchResults.map((t, index) => {
                    const isLast = index === taskSearchResults.length - 1
                      && taskTitle.trim().toLowerCase() === t.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.searchRow, !isLast && styles.searchRowBorder]}
                        onPress={() => {
                          setTaskTitle(t.name);
                          setSelectedTaskId(t.id);
                          setTaskSearchResults([]);
                        }}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.searchRowText}>{t.name}</Text>
                        <Text style={styles.searchRowHint}>existing</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {taskSearchResults.every(
                    t => t.name.toLowerCase() !== taskTitle.trim().toLowerCase(),
                  ) && (
                    <TouchableOpacity
                      style={[styles.searchRow, styles.searchRowCreate]}
                      onPress={() => { setTaskSearchResults([]); }}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.searchRowText, styles.searchRowCreateText]}>
                        Create "{taskTitle.trim()}"
                      </Text>
                      <Text style={[styles.searchRowHint, styles.searchRowCreateText]}>new</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {priorities.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Priority</Text>
                  <View style={styles.priorityList}>
                    {[{ id: null, label: 'None' }, ...priorities].map((p, index, arr) => {
                      const isSelected = taskPriorityId === p.id;
                      const isLast = index === arr.length - 1;
                      return (
                        <TouchableOpacity
                          key={p.id ?? 'none'}
                          style={[styles.priorityRow, !isLast && styles.priorityRowBorder]}
                          onPress={() => setTaskPriorityId(p.id)}
                          activeOpacity={0.6}
                        >
                          <Text style={[styles.priorityLabel, isSelected && styles.priorityLabelSelected]}>
                            {p.label}
                          </Text>
                          {isSelected && <Text style={styles.priorityCheck}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Time */}
              <Text style={[styles.fieldLabel, { marginTop: 28 }]}>Time</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setActivePicker('start')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timeBtnLabel}>Start</Text>
                  <Text style={styles.timeBtnValue}>
                    {taskStartTime ? fmt(taskStartTime) : 'Not set'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.timeSep}>→</Text>

                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setActivePicker('end')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timeBtnLabel}>End</Text>
                  <Text style={styles.timeBtnValue}>
                    {taskEndTime ? fmt(taskEndTime) : 'Not set'}
                  </Text>
                </TouchableOpacity>
              </View>

              {activePicker && (
                <DateTimePicker
                  mode="time"
                  value={strToDate(activePicker === 'start' ? taskStartTime : taskEndTime)}
                  is24Hour={false}
                  onChange={(event, date) => {
                    if (event.type !== 'dismissed' && date) {
                      if (activePicker === 'start') setTaskStartTime(dateToTimeStr(date));
                      else setTaskEndTime(dateToTimeStr(date));
                    }
                    setActivePicker(null);
                  }}
                />
              )}

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Block modal ── */}
      <Modal
        visible={editBlockVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditBlockVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Block</Text>
              <TouchableOpacity onPress={saveBlockEdit} disabled={savingBlockEdit}>
                {savingBlockEdit
                  ? <ActivityIndicator size="small" />
                  : <Text style={styles.modalSave}>Save</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 64 }}>

              {/* Block name info */}
              {editingBlock && (() => {
                const area   = areas.find(a => a.id === editingBlock.area_of_life_id);
                const colors = area ? getPalette(area.color) : null;
                return (
                  <View style={[styles.blockInfoBanner, { backgroundColor: colors?.light ?? '#f5f5f5' }]}>
                    <Text style={[styles.blockInfoName, { color: colors?.dark ?? '#333' }]}>
                      {area?.name ?? '—'}
                    </Text>
                    <Text style={[styles.blockInfoSub, { color: colors?.dark ?? '#555' }]}>
                      Changes apply to {fmtDateHeader(selectedDate)} only
                    </Text>
                  </View>
                );
              })()}

              {/* Time pickers */}
              <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Time</Text>
              <TouchableOpacity
                style={styles.timeBtn}
                onPress={() => setActiveBlockPicker('start')}
                activeOpacity={0.7}
              >
                <Text style={styles.timeBtnLabel}>Start</Text>
                <Text style={styles.timeBtnValue}>{editBlockStartTime ? fmt(editBlockStartTime) : 'Not set'}</Text>
              </TouchableOpacity>

              {activeBlockPicker && (
                <DateTimePicker
                  mode="time"
                  value={strToDate(activeBlockPicker === 'start' ? editBlockStartTime : editBlockEndTime)}
                  is24Hour={false}
                  onChange={(event, date) => {
                    if (event.type !== 'dismissed' && date) {
                      if (activeBlockPicker === 'start') setEditBlockStartTime(dateToTimeStr(date));
                      else setEditBlockEndTime(dateToTimeStr(date));
                    }
                    setActiveBlockPicker(null);
                  }}
                />
              )}

              {/* Remove block for today */}
              <TouchableOpacity
                style={styles.cancelBlockBtn}
                onPress={() => Alert.alert(
                  'Remove Block',
                  `Remove this block for ${fmtDateHeader(selectedDate)} only?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: cancelBlockToday },
                  ],
                )}
              >
                <Text style={styles.cancelBlockBtnText}>Remove this block today</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Schedule Next modal ── */}
      <Modal visible={scheduleNextVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.container, { paddingTop: 0, position: 'relative' }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setScheduleNextVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Schedule Next</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Date navigation */}
          <View style={styles.dateHeader}>
            <TouchableOpacity
              onPress={() => setScheduleNextDate(d => shiftDay(d, -1))}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.arrowBtn}
            >
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openScheduleCalendar} activeOpacity={0.7} style={styles.dateLabelBtn}>
              <Text style={styles.dateLabel}>{fmtDateHeader(scheduleNextDate)}</Text>
              {scheduleNextDate === TODAY_STR && <Text style={styles.todayBadge}>Today</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setScheduleNextDate(d => shiftDay(d, 1))}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.arrowBtn}
            >
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day content */}
          {scheduleNextLoading || savingNext
            ? <ActivityIndicator style={{ marginTop: 40 }} />
            : (
              <ScrollView style={styles.dayContent} showsVerticalScrollIndicator={false}>

                {/* All Day */}
                <View style={styles.allDaySection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>All Day</Text>
                    <TouchableOpacity
                      onPress={() => saveNext(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.addBtn}>+ Add Here</Text>
                    </TouchableOpacity>
                  </View>
                  {allDayScheduleInstances.length === 0
                    ? <Text style={styles.emptyText}>No all-day items</Text>
                    : allDayScheduleInstances.map(inst => (
                      <TaskRow
                        key={inst.id}
                        instance={inst}
                        priorities={priorities}
                        onToggle={() => {}}
                        onDelete={() => {}}
                        onPress={() => {}}
                      />
                    ))
                  }
                </View>

                {/* Timed blocks */}
                {timedBlocksForSchedule.length === 0 ? (
                  <Text style={styles.noBlocksText}>
                    No blocks for this day.{'\n'}Set up your Weekly Template in Settings.
                  </Text>
                ) : (
                  timedBlocksForSchedule.map((block, index) => {
                    const area       = areas.find(a => a.id === block.area_of_life_id);
                    const colors     = area ? getPalette(area.color) : null;
                    const blockInsts = instancesForScheduleBlock(block.id);
                    return (
                      <View
                        key={block.id}
                        style={[styles.blockSection, { backgroundColor: colors?.light ?? '#f5f5f5' }]}
                      >
                        <View style={styles.sectionHeader}>
                          <View>
                            <Text style={[styles.blockTime, { color: colors?.dark ?? '#555' }]}>
                              {fmt(block.start_time)} → {fmt(endTimeForSchedule(index))}
                            </Text>
                            <Text style={[styles.blockName, { color: colors?.dark ?? '#333' }]}>
                              {area?.name ?? '—'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => saveNext(block.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={[styles.addBtn, { color: colors?.dark ?? '#9ca3af' }]}>
                              + Add Here
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {blockInsts.length > 0 && (
                          <View style={styles.taskList}>
                            {blockInsts.map(inst => (
                              <TaskRow
                                key={inst.id}
                                instance={inst}
                                priorities={priorities}
                                onToggle={() => {}}
                                onDelete={() => {}}
                                onPress={() => {}}
                                dark={colors?.dark}
                              />
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}

                <View style={styles.bedtimeRow}>
                  <Text style={styles.bedtimeText}>🌙  Bedtime · {fmt(settings.bedtime)}</Text>
                </View>
                <View style={{ height: 32 }} />
              </ScrollView>
            )
          }

          {/* ── Inline calendar overlay (avoids nested-Modal issues on Android) ── */}
          {scheduleCalendarVisible && (
            <TouchableOpacity
              style={styles.calendarOverlay}
              activeOpacity={1}
              onPress={() => setScheduleCalendarVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.calendarCard}>

                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    onPress={() => shiftSchedulePickerMonth(-1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.calendarArrow}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthLabel}>
                    {MONTH_NAMES[schedulePickerMonth]} {schedulePickerYear}
                  </Text>
                  <TouchableOpacity
                    onPress={() => shiftSchedulePickerMonth(1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.calendarArrow}>›</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calendarRow}>
                  {DAY_LETTERS.map((letter, i) => (
                    <Text key={i} style={styles.calendarDayLabel}>{letter}</Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {buildCalendarCells(schedulePickerYear, schedulePickerMonth).map((day, i) => {
                    if (day === null) return <View key={`e-${i}`} style={styles.calendarCell} />;
                    const cellStr    = toDateStr(new Date(schedulePickerYear, schedulePickerMonth, day));
                    const isToday    = cellStr === TODAY_STR;
                    const isSelected = cellStr === scheduleNextDate;
                    return (
                      <TouchableOpacity
                        key={cellStr}
                        style={styles.calendarCell}
                        onPress={() => {
                          setScheduleNextDate(cellStr);
                          setScheduleCalendarVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          styles.calendarCellInner,
                          isSelected && styles.calendarCellSelected,
                          isToday && !isSelected && styles.calendarCellToday,
                        ]}>
                          <Text style={[
                            styles.calendarDayNum,
                            isSelected && styles.calendarDayNumSelected,
                            isToday && !isSelected && styles.calendarDayNumToday,
                          ]}>
                            {day}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.calendarTodayBtn}
                  onPress={() => {
                    setScheduleNextDate(TODAY_STR);
                    setScheduleCalendarVisible(false);
                  }}
                >
                  <Text style={styles.calendarTodayBtnText}>Go to Today</Text>
                </TouchableOpacity>

              </TouchableOpacity>
            </TouchableOpacity>
          )}

        </View>
      </Modal>

    </View>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────
function TaskRow({
  instance, priorities, onToggle, onDelete, onPress, dark = '#333',
}: {
  instance:   TaskInstance;
  priorities: PriorityLevel[];
  onToggle:   (t: TaskInstance) => void;
  onDelete:   (t: TaskInstance) => void;
  onPress:    () => void;
  dark?:      string;
}) {
  const isDone   = instance.status === 'complete';
  const priority = priorities.find(p => p.id === instance.priority_level_id);

  return (
    <TouchableOpacity style={styles.taskRow} onPress={onPress} activeOpacity={0.7}>
      <TouchableOpacity
        onPress={() => onToggle(instance)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.checkbox, { borderColor: dark }, isDone && { backgroundColor: dark }]}>
          {isDone
            ? <Text style={styles.checkmark}>✓</Text>
            : priority && <Text style={[styles.priorityIndex, { color: dark }]}>{priority.sort_index}</Text>
          }
        </View>
      </TouchableOpacity>

      <View style={styles.taskTextCol}>
        {(instance.start_time || instance.end_time) && (
          <Text style={[styles.taskTitle, { color: dark }, isDone && styles.taskDone]}>
            {instance.start_time ? fmt(instance.start_time) : '—'}
            {instance.end_time ? ` → ${fmt(instance.end_time)}` : ''}
          </Text>
        )}
        <Text style={[styles.taskTitle, { color: dark }, isDone && styles.taskDone]}>
          {instance.task?.name ?? '—'}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => onDelete(instance)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.deleteBtn, { color: dark }]}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_BACKGROUND, paddingTop: 64 },

  // Date header
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
  },
  arrowBtn:  { padding: 8 },
  arrowText: { fontSize: 32, color: '#1a1a1a', lineHeight: 36 },
  dateLabelBtn: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  todayBadge: {
    fontSize: 11, color: '#9ca3af', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
  },

  // Day content
  dayContent: { flex: 1, paddingHorizontal: 16 },

  allDaySection: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  blockSection: { borderRadius: 14, padding: 14, marginBottom: 10 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  addBtn:    { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  emptyText: { fontSize: 13, color: '#d1d5db', fontStyle: 'italic' },

  blockTime: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  blockName: { fontSize: 18, fontWeight: '400' },

  noBlocksText: {
    textAlign: 'center', color: '#9ca3af', fontSize: 14,
    lineHeight: 22, marginTop: 32, paddingHorizontal: 24,
  },

  taskList: { marginTop: 4, gap: 2 },
  taskRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  checkmark:     { color: '#fff', fontSize: 11, fontWeight: '800' },
  priorityIndex: { fontSize: 11, fontWeight: '700', opacity: 0.6 },
  taskTextCol:   { flex: 1 },
  taskTitle:     { fontSize: 15, fontWeight: '500' },
  taskDone:      { textDecorationLine: 'line-through', opacity: 0.45 },
  deleteBtn:     { fontSize: 14, opacity: 0.3, paddingLeft: 4 },

  bedtimeRow:  { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  bedtimeText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },

  // Calendar modal
  calendarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
  calendarCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: 320, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 20, elevation: 8,
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  calendarArrow:      { fontSize: 28, color: '#1a1a1a', lineHeight: 32, paddingHorizontal: 4 },
  calendarMonthLabel: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  calendarRow: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8,
  },
  calendarDayLabel: {
    width: 36, textAlign: 'center',
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
  },
  calendarGrid:     { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  calendarCellInner: {
    width: 34, height: 34, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  calendarCellSelected: {
    backgroundColor: '#1a1a1a',
  },
  calendarCellToday: {
    borderWidth: 1.5, borderColor: '#1a1a1a',
  },
  calendarDayNum:         { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  calendarDayNumSelected: { color: '#fff', fontWeight: '700' },
  calendarDayNumToday:    { fontWeight: '800' },
  calendarTodayBtn: {
    marginTop: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#f5f0e8', alignItems: 'center',
  },
  calendarTodayBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },

  // Add task modal
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

  titleInput: {
    fontSize: 20, fontWeight: '500', color: '#1a1a1a',
    paddingVertical: 12, borderBottomWidth: 1.5,
    borderBottomColor: '#e5e7eb', marginBottom: 8,
  },
  searchResults:   { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', overflow: 'hidden', marginBottom: 20 },
  searchRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  searchRowBorder: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchRowText:   { fontSize: 15, fontWeight: '500', color: '#1a1a1a', flex: 1 },
  searchRowHint:       { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 8 },
  searchRowCreate:     { backgroundColor: '#1a1a1a' },
  searchRowCreateText: { color: '#fff', opacity: 1 },
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  timeRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeBtn:      { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 12 },
  timeBtnLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  timeBtnValue: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  timeSep:      { fontSize: 16, color: '#9ca3af', fontWeight: '600' },

  blockInfoBanner: { borderRadius: 12, padding: 14, marginBottom: 4 },
  blockInfoName:   { fontSize: 18, fontWeight: '500' },
  blockInfoSub:    { fontSize: 12, marginTop: 2, opacity: 0.7 },
  cancelBlockBtn:     { marginTop: 32, paddingVertical: 16, borderRadius: 12, backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#fecaca', alignItems: 'center' },
  cancelBlockBtnText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },

  priorityList:        { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', overflow: 'hidden' },
  priorityRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  priorityRowBorder:   { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  priorityLabel:       { fontSize: 15, fontWeight: '500', color: '#6b7280' },
  priorityLabelSelected: { color: '#1a1a1a', fontWeight: '600' },
  priorityCheck:       { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
});
