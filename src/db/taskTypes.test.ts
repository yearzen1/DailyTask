import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "./client";
import {
  createTaskType,
  deleteTaskType,
  listTaskTypes,
  moveTaskType,
  reorderTaskTypes,
  taskTypeFromRow,
  updateTaskType,
  type TaskTypeRow,
} from "./taskTypes";

const MIGRATIONS = [
  "001_init.sql",
  "002_checkin_value.sql",
  "003_task_interval_every_days.sql",
  "004_drop_recorded_status.sql",
  "005_task_name_periods.sql",
  "006_task_types.sql",
].map((name) =>
  readFileSync(resolve(process.cwd(), "src-tauri/migrations", name), "utf8"),
);

function adapter(sqlite: DatabaseSync): SqlDatabase {
  return {
    select: async <T>(query: string, values: unknown[] = []) =>
      sqlite.prepare(query).all(...(values as never[])) as T,
    execute: async (query: string, values: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...(values as never[]));
      return { rowsAffected: Number(result.changes) };
    },
  };
}

function freshDb(): { sqlite: DatabaseSync; db: SqlDatabase } {
  const sqlite = new DatabaseSync(":memory:");
  for (const sql of MIGRATIONS) {
    sqlite.exec(sql);
  }
  return { sqlite, db: adapter(sqlite) };
}

describe("taskTypeFromRow", () => {
  it("maps snake_case rows to the entity", () => {
    const row: TaskTypeRow = {
      id: "health",
      name: "健康",
      parent_id: null,
      sort_order: 3,
      system_key: null,
      color: "green",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-02T00:00:00.000Z",
    };

    expect(taskTypeFromRow(row)).toEqual({
      id: "health",
      name: "健康",
      parentId: null,
      order: 3,
      systemKey: null,
      color: "green",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
    });
  });
});

describe("task type repository", () => {
  let sqlite: DatabaseSync;
  let db: SqlDatabase;

  beforeEach(() => {
    ({ sqlite, db } = freshDb());
  });

  it("lists the two built-in types after migration", async () => {
    const types = await listTaskTypes(db);
    expect(types.map((type) => [type.id, type.name, type.systemKey])).toEqual([
      ["voluntary", null, "voluntary"],
      ["forced", null, "forced"],
    ]);
  });

  it("creates nested types with the next sibling sort_order", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const run = await createTaskType(db, {
      name: "运动",
      parentId: health.id,
      color: "green",
    });
    const sleep = await createTaskType(db, {
      name: "睡眠",
      parentId: health.id,
    });

    expect(health.order).toBe(2);
    expect(run.order).toBe(0);
    expect(sleep.order).toBe(1);
    expect(run.parentId).toBe(health.id);
    expect(run.color).toBe("green");
  });

  it("rejects duplicate names under the same parent", async () => {
    const health = await createTaskType(db, { name: "健康" });
    await createTaskType(db, { name: "运动", parentId: health.id });

    await expect(
      createTaskType(db, { name: "运动", parentId: health.id }),
    ).rejects.toThrow("duplicate-name");
  });

  it("allows the same name under different parents", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const work = await createTaskType(db, { name: "工作" });

    await createTaskType(db, { name: "阅读", parentId: health.id });
    await expect(
      createTaskType(db, { name: "阅读", parentId: work.id }),
    ).resolves.toMatchObject({ parentId: work.id });
  });

  it("renames built-in types and restores the i18n name with null", async () => {
    await updateTaskType(db, "forced", { name: "工作" });
    expect(
      (await listTaskTypes(db)).find((type) => type.id === "forced")?.name,
    ).toBe("工作");

    await updateTaskType(db, "forced", { name: null });
    expect(
      (await listTaskTypes(db)).find((type) => type.id === "forced")?.name,
    ).toBeNull();
  });

  it("rejects moving a type under its own descendant", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const run = await createTaskType(db, {
      name: "运动",
      parentId: health.id,
    });

    await expect(
      updateTaskType(db, health.id, { parentId: run.id }),
    ).rejects.toThrow("cycle");
  });

  it("allows nesting built-in types", async () => {
    const health = await createTaskType(db, { name: "健康" });

    await updateTaskType(db, "forced", { parentId: health.id });

    expect(
      (await listTaskTypes(db)).find((type) => type.id === "forced")?.parentId,
    ).toBe(health.id);
  });

  it("reorders only the given siblings", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const run = await createTaskType(db, {
      name: "运动",
      parentId: health.id,
    });
    const sleep = await createTaskType(db, {
      name: "睡眠",
      parentId: health.id,
    });

    await reorderTaskTypes(db, health.id, [sleep.id, run.id]);

    const children = (await listTaskTypes(db))
      .filter((type) => type.parentId === health.id)
      .sort((a, b) => a.order - b.order);
    expect(children.map((type) => type.id)).toEqual([sleep.id, run.id]);
  });

  it("moves a type to another parent and renumbers both sides", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const run = await createTaskType(db, { name: "运动", parentId: health.id });
    const sleep = await createTaskType(db, {
      name: "睡眠",
      parentId: health.id,
    });
    const work = await createTaskType(db, { name: "工作" });

    await moveTaskType(db, sleep.id, work.id, 0);

    const types = await listTaskTypes(db);
    const moved = types.find((type) => type.id === sleep.id);
    expect(moved?.parentId).toBe(work.id);
    expect(moved?.order).toBe(0);
    expect(types.find((type) => type.id === run.id)?.order).toBe(0);
    expect(
      types
        .filter((type) => type.parentId === work.id)
        .map((type) => type.id),
    ).toEqual([sleep.id]);
  });

  it("rejects moving a type into its own descendant", async () => {
    const health = await createTaskType(db, { name: "健康" });
    const run = await createTaskType(db, { name: "运动", parentId: health.id });

    await expect(moveTaskType(db, health.id, run.id, 0)).rejects.toThrow(
      "cycle",
    );
  });

  it("moves built-in types like any other type", async () => {
    const health = await createTaskType(db, { name: "健康" });

    await moveTaskType(db, "voluntary", health.id, 0);

    expect(
      (await listTaskTypes(db)).find((type) => type.id === "voluntary")
        ?.parentId,
    ).toBe(health.id);
  });

  it("deletes empty built-in and custom types", async () => {
    await deleteTaskType(db, "voluntary");
    const health = await createTaskType(db, { name: "健康" });
    await deleteTaskType(db, health.id);

    const ids = (await listTaskTypes(db)).map((type) => type.id);
    expect(ids).not.toContain("voluntary");
    expect(ids).not.toContain(health.id);
  });

  it("refuses to delete the last type", async () => {
    await deleteTaskType(db, "voluntary");

    await expect(deleteTaskType(db, "forced")).rejects.toThrow("last-type");
  });

  it("refuses to delete non-empty or parent types", async () => {
    const health = await createTaskType(db, { name: "健康" });
    await createTaskType(db, { name: "运动", parentId: health.id });
    await expect(deleteTaskType(db, health.id)).rejects.toThrow("has-children");

    const work = await createTaskType(db, { name: "工作" });
    sqlite
      .prepare(
        "INSERT INTO tasks (id, name, category, type_id, sort_order, created_at, updated_at) " +
          "VALUES ('t1', '跑步', 'voluntary', ?, 0, '2026-11-01', '2026-11-01')",
      )
      .run(work.id);
    await expect(deleteTaskType(db, work.id)).rejects.toThrow("has-tasks");
  });

  it("deletes an empty custom type", async () => {
    const health = await createTaskType(db, { name: "健康" });

    await deleteTaskType(db, health.id);

    expect((await listTaskTypes(db)).some((type) => type.id === health.id)).toBe(
      false,
    );
  });
});
