// ─── Core domain types for Kapchr ───────────────────────────────────────────
// These mirror our Supabase database schema.
// Having them here means TypeScript can catch mismatches between our UI and DB.

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday

export interface AreaOfLife {
  id: string;
  user_id: string;
  name: string;
  color: string; // hex color, e.g. "#4f46e5"
  created_at: string;
}

export interface PriorityLevel {
  id: string;
  user_id: string;
  label: string;
  sort_index: number; // lower number = higher priority
  created_at: string;
}

export interface WeeklyTemplateBlock {
  id: string;
  user_id: string;
  area_of_life_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM" 24-hour format
  end_time: string;   // "HH:MM" 24-hour format
  name: string;
  created_at: string;
  // Joined from areas_of_life table (populated by Supabase select queries)
  area?: AreaOfLife;
}

export interface BlockOverride {
  id: string;
  user_id: string;
  weekly_template_block_id: string;
  date: string;       // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  name: string;
  is_cancelled: boolean; // true = this block doesn't show at all on this date
  created_at: string;
}

// A "resolved" block merges template + override for rendering in the Planner.
// This type is computed in the app, not stored in the DB.
export interface ResolvedBlock {
  templateBlock: WeeklyTemplateBlock;
  override?: BlockOverride;
  // Convenience getters (whichever is active for that day)
  name: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  area?: AreaOfLife;
}

export type TaskStatus = 'pending' | 'complete' | 'skipped' | 'flagged';

export interface Task {
  id: string;
  user_id: string;
  name: string;
  notes?: string | null;
  created_at: string;
  // Joined
  checklist_items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface TaskInstance {
  id: string;
  task_id: string;
  user_id: string;
  scheduled_date: string;             // "YYYY-MM-DD"
  weekly_template_block_id: string;   // which block this lives in
  start_time?: string | null;         // optional override within the block
  end_time?: string | null;
  priority_level_id?: string | null;
  status: TaskStatus;
  created_at: string;
  // Joined
  task?: Task;
  priority_level?: PriorityLevel;
  checklist_item_states?: ChecklistItemState[];
}

export interface ChecklistItemState {
  id: string;
  task_instance_id: string;
  checklist_item_id: string;
  is_done: boolean;
  // Joined
  checklist_item?: ChecklistItem;
}
