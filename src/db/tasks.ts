import type {
  Interval,
  Task,
  TaskCategory,
} from "../domain/types";
import { normalizeEveryDays } from "../domain/intervals";
import type { SqlDatabase } from "./client";

export interface TaskRow {
  id: string;
  name: string;
  category: TaskCategory;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IntervalRow {
  id: string;
  task_id: string;
  start_date: string;
  end_date: string | null;
  every_days: number;
}

export function intervalFromRow(row: IntervalRow): Interval {
  return {
    id: row.id,
    taskId: row.task_id,
    start: row.start_date,
    end: row.end_date,
    everyDays: normalizeEveryDays(row.every_days),
  };
}

export function taskFromRows(row: TaskRow, intervals: Interval[]): Task {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    intervals,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupIntervals(rows: IntervalRow[]): Map<string, Interval[]> {
  const byTask = new Map<string, Interval[]>();
  for (const row of rows) {
    const list = byTask.get(row.task_id);
    if (list) {
      list.push(intervalFromRow(row));
    } else {
      byTask.set(row.task_id, [intervalFromRow(row)]);
    }
  }
  return byTask;
}

export async function listTasks(db: SqlDatabase): Promise<Task[]> {
  const [taskRows, intervalRows] = await Promise.all([
    db.select<TaskRow[]>(
      "SELECT id, name, category, sort_order, created_at, updated_at " +
        "FROM tasks ORDER BY sort_order ASC, created_at ASC",
    ),
    db.select<IntervalRow[]>(
      "SELECT id, task_id, start_date, end_date, every_days " +
        "FROM task_intervals ORDER BY start_date ASC",
    ),
  ]);

  const byTask = groupIntervals(intervalRows);
  return taskRows.map((row) => taskFromRows(row, byTask.get(row.id) ?? []));
}

export interface CreateTaskInput {
  name: string;
  category: TaskCategory;
  startDate: string;
  /** 截止日期；null / 缺省表示一直有效。 */
  endDate?: string | null;
  everyDays?: number;
  order?: number;
}

export async function createTask(
  db: SqlDatabase,
  input: CreateTaskInput,
): Promise<Task> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const order =
    input.order ??
    (await db.select<{ next: number }[]>(
      "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks",
    ))[0].next;

  await db.execute(
    "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    [id, input.name, input.category, order, now, now],
  );

  const interval: Interval = {
    id: crypto.randomUUID(),
    taskId: id,
    start: input.startDate,
    end: input.endDate || null,
    everyDays: normalizeEveryDays(input.everyDays),
  };
  await db.execute(
    "INSERT INTO task_intervals (id, task_id, start_date, end_date, every_days) " +
      "VALUES (?, ?, ?, ?, ?)",
    [
      interval.id,
      interval.taskId,
      interval.start,
      interval.end,
      interval.everyDays,
    ],
  );

  return {
    id,
    name: input.name,
    category: input.category,
    intervals: [interval],
    order,
    createdAt: now,
    updatedAt: now,
  };
}

export interface TaskPatch {
  name?: string;
  category?: TaskCategory;
  order?: number;
}

export async function updateTask(
  db: SqlDatabase,
  id: string,
  patch: TaskPatch,
): Promise<void> {
  const columns: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) {
    columns.push("name = ?");
    values.push(patch.name);
  }
  if (patch.category !== undefined) {
    columns.push("category = ?");
    values.push(patch.category);
  }
  if (patch.order !== undefined) {
    columns.push("sort_order = ?");
    values.push(patch.order);
  }
  if (columns.length === 0) {
    return;
  }

  columns.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  await db.execute(
    `UPDATE tasks SET ${columns.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteTask(db: SqlDatabase, id: string): Promise<void> {
  // SQLite 外键默认可能关闭，级联删除不要只依赖 ON DELETE CASCADE。
  await db.execute("DELETE FROM checkins WHERE task_id = ?", [id]);
  await db.execute("DELETE FROM task_intervals WHERE task_id = ?", [id]);
  await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
}

/** 按传入顺序重排全部任务；拖拽只在同组内调整，顺序由调用方展开成全局列表。 */
export async function reorderTasks(
  db: SqlDatabase,
  taskIds: string[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const [index, id] of taskIds.entries()) {
    await db.execute(
      "UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?",
      [index, now, id],
    );
  }
}

/** 停用：关掉当前开放区间（endDate 含当天），返回受影响的行数。 */
export async function closeOpenInterval(
  db: SqlDatabase,
  taskId: string,
  endDate: string,
): Promise<number> {
  const result = await db.execute(
    "UPDATE task_intervals SET end_date = ? WHERE task_id = ? AND end_date IS NULL",
    [endDate, taskId],
  );
  return result.rowsAffected;
}

/** 重新启用：追加第 2 段及以后的区间，历史区间不动。 */
export async function appendInterval(
  db: SqlDatabase,
  taskId: string,
  startDate: string,
  everyDays = 1,
): Promise<Interval> {
  const interval: Interval = {
    id: crypto.randomUUID(),
    taskId,
    start: startDate,
    end: null,
    everyDays: normalizeEveryDays(everyDays),
  };
  await db.execute(
    "INSERT INTO task_intervals (id, task_id, start_date, end_date, every_days) " +
      "VALUES (?, ?, ?, ?, ?)",
    [
      interval.id,
      interval.taskId,
      interval.start,
      interval.end,
      interval.everyDays,
    ],
  );
  return interval;
}

/** 编辑单段区间的起止日期与间隔天数（M5 D65）；历史区间默认只读，由 UI 限定。 */
export async function updateIntervalDates(
  db: SqlDatabase,
  intervalId: string,
  startDate: string,
  endDate: string | null,
  everyDays = 1,
): Promise<void> {
  await db.execute(
    "UPDATE task_intervals SET start_date = ?, end_date = ?, every_days = ? " +
      "WHERE id = ?",
    [startDate, endDate, normalizeEveryDays(everyDays), intervalId],
  );
}
