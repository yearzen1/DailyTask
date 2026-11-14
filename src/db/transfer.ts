import type {
  Checkin,
  Interval,
  NamePeriod,
  Settings,
  Task,
  Todo,
} from "../domain/types";
import { normalizeEveryDays } from "../domain/intervals";
import { namePeriodsOf } from "../domain/names";
import type { SqlDatabase } from "./client";
import { listCheckins } from "./checkins";
import { getSettings, sanitizeSettings, setSettings } from "./settings";
import { listTasks } from "./tasks";
import { listTodos } from "./todos";

/** JSON v2：任务、名称段与区间分开放，导入时可以按 id upsert。v1 仍可导入。 */
export interface ExportTask {
  id: string;
  name: string;
  category: Task["category"];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportBundle {
  version: 1 | 2;
  exportedAt: string;
  tasks: ExportTask[];
  namePeriods: NamePeriod[];
  intervals: Interval[];
  checkins: Checkin[];
  todos: Todo[];
  settings: Settings;
}

export function buildExportBundle(
  tasks: Task[],
  checkins: Checkin[],
  todos: Todo[],
  settings: Settings,
  now: Date,
): ExportBundle {
  return {
    version: 2,
    exportedAt: now.toISOString(),
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      category: task.category,
      order: task.order,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })),
    namePeriods: tasks
      .flatMap((task) => namePeriodsOf(task))
      .sort(
        (a, b) =>
          a.taskId.localeCompare(b.taskId) || a.start.localeCompare(b.start),
      ),
    intervals: tasks
      .flatMap((task) => task.intervals)
      .sort((a, b) => a.taskId.localeCompare(b.taskId) || a.start.localeCompare(b.start)),
    checkins: [...checkins].sort(
      (a, b) => a.taskId.localeCompare(b.taskId) || a.date.localeCompare(b.date),
    ),
    todos: [...todos].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    ),
    settings,
  };
}

export async function exportData(
  db: SqlDatabase,
  now = new Date(),
): Promise<ExportBundle> {
  const [tasks, checkins, todos, settings] = await Promise.all([
    listTasks(db),
    listCheckins(db),
    listTodos(db),
    getSettings(db),
  ]);

  return buildExportBundle(tasks, checkins, todos, settings, now);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const CHECKIN_STATUSES = ["done", "missed", "skipped"] as const;
/** 旧 JSON v1 可能还带 recorded；导入时统一归到 done。 */
const IMPORT_CHECKIN_STATUSES = [...CHECKIN_STATUSES, "recorded"] as const;

type ImportCheckin = Omit<Checkin, "status"> & {
  status: Checkin["status"] | "recorded";
};

function isExportTask(value: unknown): value is ExportTask {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.category === "voluntary" || value.category === "forced") &&
    typeof value.order === "number" &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isInterval(value: unknown): value is Interval {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.taskId) &&
    isString(value.start) &&
    isNullableString(value.end) &&
    (value.everyDays === undefined ||
      (typeof value.everyDays === "number" &&
        Number.isInteger(value.everyDays) &&
        value.everyDays >= 1 &&
        value.everyDays <= 365))
  );
}

function isNamePeriod(value: unknown): value is NamePeriod {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.taskId) &&
    isString(value.name) &&
    isString(value.start) &&
    isNullableString(value.end)
  );
}

/** v1 没有名称段：每个任务按最早区间启用日合成一段。 */
function synthesizeNamePeriods(
  tasks: ExportTask[],
  intervals: Interval[],
): NamePeriod[] {
  const earliest = new Map<string, string>();
  for (const interval of intervals) {
    const current = earliest.get(interval.taskId);
    if (current === undefined || interval.start < current) {
      earliest.set(interval.taskId, interval.start);
    }
  }

  return tasks.map((task) => ({
    id: `${task.id}:name`,
    taskId: task.id,
    name: task.name,
    start: earliest.get(task.id) ?? task.createdAt.slice(0, 10),
    end: null,
  }));
}

function isCheckin(value: unknown): value is ImportCheckin {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.taskId) &&
    isString(value.date) &&
    IMPORT_CHECKIN_STATUSES.includes(
      value.status as (typeof IMPORT_CHECKIN_STATUSES)[number],
    ) &&
    isNullableString(value.value) &&
    isNullableString(value.note) &&
    isString(value.updatedAt)
  );
}

function isTodo(value: unknown): value is Todo {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isNullableString(value.dueDate) &&
    typeof value.done === "boolean" &&
    isNullableString(value.completedAt) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function arrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw new Error("invalid-structure");
  }
  return value;
}

/** 导入前的结构校验：版本不对或字段缺失一律拒绝，避免半截数据进库。 */
export function parseImportBundle(text: string): ExportBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("invalid-json");
  }
  if (!isRecord(raw)) {
    throw new Error("invalid-structure");
  }
  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error("unsupported-version");
  }

  const version = raw.version;
  const tasks = arrayOf(raw.tasks, isExportTask);
  const intervals = arrayOf(raw.intervals, isInterval).map((interval) => ({
    ...interval,
    everyDays: normalizeEveryDays(interval.everyDays),
  }));

  return {
    version,
    exportedAt: isString(raw.exportedAt) ? raw.exportedAt : new Date().toISOString(),
    tasks,
    namePeriods:
      version === 2
        ? arrayOf(raw.namePeriods, isNamePeriod)
        : synthesizeNamePeriods(tasks, intervals),
    intervals,
    checkins: arrayOf(raw.checkins, isCheckin).map((checkin) => ({
      ...checkin,
      status: checkin.status === "recorded" ? "done" : checkin.status,
    })),
    todos: arrayOf(raw.todos, isTodo),
    settings: sanitizeSettings(isRecord(raw.settings) ? raw.settings : {}),
  };
}

export interface ImportCounts {
  tasks: number;
  namePeriods: number;
  intervals: number;
  checkins: number;
  todos: number;
}

/**
 * 导入冲突策略：按主键 upsert，本地多出来的行一律保留；
 * 打卡以 (task_id, date) 为语义键，保留本地 id。
 * 全流程幂等，失败后重试同一文件不会产生重复数据。
 */
export async function importData(
  db: SqlDatabase,
  bundle: ExportBundle,
): Promise<ImportCounts> {
  const namePeriods =
    bundle.namePeriods ??
    synthesizeNamePeriods(bundle.tasks, bundle.intervals);

  for (const task of bundle.tasks) {
    await db.execute(
      "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET " +
        "name = excluded.name, category = excluded.category, " +
        "sort_order = excluded.sort_order, updated_at = excluded.updated_at",
      [
        task.id,
        task.name,
        task.category,
        task.order,
        task.createdAt,
        task.updatedAt,
      ],
    );
  }

  for (const period of namePeriods) {
    await db.execute(
      "INSERT INTO task_name_periods (id, task_id, name, start_date, end_date) " +
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id, start_date) DO UPDATE SET " +
        "name = excluded.name, end_date = excluded.end_date",
      [period.id, period.taskId, period.name, period.start, period.end],
    );
  }

  for (const interval of bundle.intervals) {
    await db.execute(
      "INSERT INTO task_intervals (id, task_id, start_date, end_date, every_days) " +
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET " +
        "task_id = excluded.task_id, start_date = excluded.start_date, " +
        "end_date = excluded.end_date, every_days = excluded.every_days",
      [
        interval.id,
        interval.taskId,
        interval.start,
        interval.end,
        normalizeEveryDays(interval.everyDays),
      ],
    );
  }

  for (const checkin of bundle.checkins) {
    await db.execute(
      "INSERT INTO checkins (id, task_id, date, status, value, note, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id, date) DO UPDATE SET " +
        "status = excluded.status, value = excluded.value, " +
        "note = excluded.note, updated_at = excluded.updated_at",
      [
        checkin.id,
        checkin.taskId,
        checkin.date,
        checkin.status,
        checkin.value,
        checkin.note,
        checkin.updatedAt,
      ],
    );
  }

  for (const todo of bundle.todos) {
    await db.execute(
      "INSERT INTO todos (id, title, due_date, done, completed_at, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET " +
        "title = excluded.title, due_date = excluded.due_date, " +
        "done = excluded.done, completed_at = excluded.completed_at, " +
        "updated_at = excluded.updated_at",
      [
        todo.id,
        todo.title,
        todo.dueDate,
        todo.done ? 1 : 0,
        todo.completedAt,
        todo.createdAt,
        todo.updatedAt,
      ],
    );
  }

  await setSettings(db, bundle.settings);

  return {
    tasks: bundle.tasks.length,
    namePeriods: namePeriods.length,
    intervals: bundle.intervals.length,
    checkins: bundle.checkins.length,
    todos: bundle.todos.length,
  };
}
