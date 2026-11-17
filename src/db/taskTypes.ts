import { isTypeDescendant } from "../domain/taskTypes";
import type { TaskCategory, TaskType, TaskTypeColor } from "../domain/types";
import type { SqlDatabase } from "./client";

export interface TaskTypeRow {
  id: string;
  name: string | null;
  parent_id: string | null;
  sort_order: number;
  system_key: TaskCategory | null;
  color: TaskTypeColor | null;
  created_at: string;
  updated_at: string;
}

export type TaskTypeErrorCode =
  | "not-found"
  | "duplicate-name"
  | "empty-name"
  | "cycle"
  | "has-tasks"
  | "has-children"
  | "system-type";

export class TaskTypeError extends Error {
  readonly code: TaskTypeErrorCode;

  constructor(code: TaskTypeErrorCode) {
    super(code);
    this.name = "TaskTypeError";
    this.code = code;
  }
}

export function taskTypeFromRow(row: TaskTypeRow): TaskType {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    order: row.sort_order,
    systemKey: row.system_key,
    color: isTypeColor(row.color) ? row.color : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TYPE_COLORS = new Set<string>([
  "green",
  "blue",
  "purple",
  "orange",
  "red",
  "teal",
  "pink",
  "gray",
]);

function isTypeColor(value: unknown): value is TaskTypeColor {
  return typeof value === "string" && TYPE_COLORS.has(value);
}

export async function listTaskTypes(db: SqlDatabase): Promise<TaskType[]> {
  const rows = await db.select<TaskTypeRow[]>(
    "SELECT id, name, parent_id, sort_order, system_key, color, created_at, updated_at " +
      "FROM task_types ORDER BY sort_order ASC, created_at ASC, id ASC",
  );
  return rows.map(taskTypeFromRow);
}

export interface CreateTaskTypeInput {
  name: string;
  parentId?: string | null;
  color?: TaskTypeColor | null;
  order?: number;
}

async function siblingMaxOrder(
  db: SqlDatabase,
  parentId: string | null,
  excludeId?: string,
): Promise<number> {
  const rows = await db.select<{ next: number }[]>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM task_types " +
      "WHERE (parent_id IS ? OR parent_id = ?) AND id <> ?",
    [parentId, parentId, excludeId ?? ""],
  );
  return rows[0]?.next ?? 0;
}

function normalizeName(name: string | null): string | null {
  if (name === null) {
    return null;
  }
  const trimmed = name.trim();
  return trimmed === "" ? null : trimmed;
}

function ensureUniqueName(
  types: TaskType[],
  id: string | null,
  parentId: string | null,
  name: string | null,
): void {
  if (name === null) {
    return;
  }
  const clash = types.some(
    (type) =>
      type.id !== id &&
      type.parentId === parentId &&
      type.name !== null &&
      type.name === name,
  );
  if (clash) {
    throw new TaskTypeError("duplicate-name");
  }
}

export async function createTaskType(
  db: SqlDatabase,
  input: CreateTaskTypeInput,
): Promise<TaskType> {
  const name = normalizeName(input.name);
  if (name === null) {
    throw new TaskTypeError("empty-name");
  }

  const types = await listTaskTypes(db);
  const parentId = input.parentId ?? null;
  if (parentId !== null && !types.some((type) => type.id === parentId)) {
    throw new TaskTypeError("not-found");
  }
  ensureUniqueName(types, null, parentId, name);

  const order =
    input.order ?? (await siblingMaxOrder(db, parentId));
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.execute(
    "INSERT INTO task_types (id, name, parent_id, sort_order, system_key, color, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
    [id, name, parentId, order, input.color ?? null, now, now],
  );

  return {
    id,
    name,
    parentId,
    order,
    systemKey: null,
    color: input.color ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface TaskTypePatch {
  /** null 表示恢复内置类型的语言默认名；自定义类型不能为 null。 */
  name?: string | null;
  parentId?: string | null;
  color?: TaskTypeColor | null;
  order?: number;
}

export async function updateTaskType(
  db: SqlDatabase,
  id: string,
  patch: TaskTypePatch,
): Promise<TaskType> {
  const types = await listTaskTypes(db);
  const target = types.find((type) => type.id === id);
  if (!target) {
    throw new TaskTypeError("not-found");
  }

  const columns: string[] = [];
  const values: unknown[] = [];

  if ("name" in patch) {
    const raw = patch.name ?? null;
    const name = normalizeName(raw);
    if (name === null && target.systemKey === null) {
      throw new TaskTypeError("empty-name");
    }
    const effectiveParent = "parentId" in patch ? patch.parentId ?? null : target.parentId;
    ensureUniqueName(types, id, effectiveParent, name);
    columns.push("name = ?");
    values.push(name);
  }

  if ("parentId" in patch) {
    const parentId = patch.parentId ?? null;
    if (target.systemKey !== null && parentId !== null) {
      throw new TaskTypeError("system-type");
    }
    if (parentId !== null) {
      if (!types.some((type) => type.id === parentId)) {
        throw new TaskTypeError("not-found");
      }
      if (parentId === id || isTypeDescendant(types, id, parentId)) {
        throw new TaskTypeError("cycle");
      }
    }
    columns.push("parent_id = ?");
    values.push(parentId);

    if ("order" in patch) {
      columns.push("sort_order = ?");
      values.push(patch.order);
    } else if (parentId !== target.parentId) {
      columns.push("sort_order = ?");
      values.push(await siblingMaxOrder(db, parentId, id));
    }

    // 改父级后还要按新父级检查重名。
    const effectiveName =
      "name" in patch ? normalizeName(patch.name ?? null) : target.name;
    ensureUniqueName(types, id, parentId, effectiveName);
  } else if ("order" in patch) {
    columns.push("sort_order = ?");
    values.push(patch.order);
  }

  if ("color" in patch) {
    columns.push("color = ?");
    values.push(patch.color ?? null);
  }

  if (columns.length === 0) {
    return target;
  }

  columns.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  await db.execute(
    `UPDATE task_types SET ${columns.join(", ")} WHERE id = ?`,
    values,
  );

  const updated = (await listTaskTypes(db)).find((type) => type.id === id);
  if (!updated) {
    throw new TaskTypeError("not-found");
  }
  return updated;
}

/** 只调整同一父级下的顺序；调用方保证 ids 都是该父级的子节点。 */
export async function reorderTaskTypes(
  db: SqlDatabase,
  parentId: string | null,
  ids: string[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const [index, id] of ids.entries()) {
    await db.execute(
      "UPDATE task_types SET sort_order = ?, updated_at = ? " +
        "WHERE id = ? AND COALESCE(parent_id, '') = ?",
      [index, now, id, parentId ?? ""],
    );
  }
}

export async function deleteTaskType(
  db: SqlDatabase,
  id: string,
): Promise<void> {
  const rows = await db.select<{ system_key: TaskCategory | null }[]>(
    "SELECT system_key FROM task_types WHERE id = ?",
    [id],
  );
  const target = rows[0];
  if (!target) {
    throw new TaskTypeError("not-found");
  }
  if (target.system_key !== null) {
    throw new TaskTypeError("system-type");
  }

  const taskCount = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM tasks WHERE type_id = ?",
    [id],
  );
  if ((taskCount[0]?.count ?? 0) > 0) {
    throw new TaskTypeError("has-tasks");
  }

  const childCount = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM task_types WHERE parent_id = ?",
    [id],
  );
  if ((childCount[0]?.count ?? 0) > 0) {
    throw new TaskTypeError("has-children");
  }

  await db.execute("DELETE FROM task_types WHERE id = ?", [id]);
}

/** 自定义类型可能挂在 forced 下面；旧 category 兼容列取根节点的 system_key。 */
export async function rootCategoryForTaskType(
  db: SqlDatabase,
  typeId: string,
): Promise<TaskCategory> {
  const rows = await db.select<{ system_key: TaskCategory | null }[]>(
    "WITH RECURSIVE chain(id, parent_id, system_key) AS (" +
      "SELECT id, parent_id, system_key FROM task_types WHERE id = ? " +
      "UNION ALL " +
      "SELECT t.id, t.parent_id, t.system_key FROM task_types t " +
      "JOIN chain c ON t.id = c.parent_id" +
      ") SELECT system_key FROM chain WHERE system_key IS NOT NULL LIMIT 1",
    [typeId],
  );
  return rows[0]?.system_key === "forced" ? "forced" : "voluntary";
}
