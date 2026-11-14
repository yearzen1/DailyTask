import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  type Checkin,
  type Task,
  type Todo,
} from "../domain/types";
import type { SqlDatabase } from "./client";
import { listCheckins, upsertCheckin } from "./checkins";
import { getSettings } from "./settings";
import { listTasks } from "./tasks";
import { listTodos } from "./todos";
import {
  buildExportBundle,
  exportData,
  importData,
  parseImportBundle,
} from "./transfer";

const NOW = new Date(2026, 10, 4, 9, 30, 0);

function task(id: string, order: number): Task {
  return {
    id,
    name: `任务${id}`,
    category: order % 2 === 0 ? "voluntary" : "forced",
    intervals: [
      { id: `${id}-1`, taskId: id, start: "2026-10-01", end: "2026-10-15" },
      { id: `${id}-2`, taskId: id, start: "2026-11-01", end: null },
    ],
    order,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function checkin(taskId: string, date: string): Checkin {
  return {
    id: `${taskId}-${date}`,
    taskId,
    date,
    status: "done",
    value: null,
    note: null,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

function todo(id: string, createdAt: string): Todo {
  return {
    id,
    title: id,
    dueDate: null,
    done: false,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("buildExportBundle", () => {
  it("uses JSON v2 with tasks, name periods and intervals split apart", () => {
    const bundle = buildExportBundle(
      [task("t1", 0)],
      [checkin("t1", "2026-11-02")],
      [todo("todo-b", "2026-10-02T00:00:00.000Z"), todo("todo-a", "2026-10-01T00:00:00.000Z")],
      DEFAULT_SETTINGS,
      NOW,
    );

    expect(bundle.version).toBe(2);
    expect(bundle.exportedAt).toBe(NOW.toISOString());
    expect(bundle.tasks).toEqual([
      {
        id: "t1",
        name: "任务t1",
        category: "voluntary",
        order: 0,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ]);
    expect(bundle.tasks[0]).not.toHaveProperty("intervals");
    expect(bundle.namePeriods).toEqual([
      {
        id: "t1",
        taskId: "t1",
        name: "任务t1",
        start: "2026-10-01",
        end: null,
      },
    ]);
    expect(bundle.intervals.map((interval) => interval.id)).toEqual([
      "t1-1",
      "t1-2",
    ]);
    expect(bundle.todos.map((item) => item.id)).toEqual(["todo-a", "todo-b"]);
    expect(bundle.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("sorts intervals, name periods and checkins by task then date", () => {
    const bundle = buildExportBundle(
      [task("b", 1), task("a", 0)],
      [checkin("a", "2026-11-02"), checkin("a", "2026-11-01"), checkin("b", "2026-11-02")],
      [],
      DEFAULT_SETTINGS,
      NOW,
    );

    expect(
      bundle.intervals.map((interval) => `${interval.taskId}:${interval.start}`),
    ).toEqual([
      "a:2026-10-01",
      "a:2026-11-01",
      "b:2026-10-01",
      "b:2026-11-01",
    ]);
    expect(
      bundle.namePeriods.map((period) => `${period.taskId}:${period.start}`),
    ).toEqual(["a:2026-10-01", "b:2026-10-01"]);
    expect(
      bundle.checkins.map((item) => `${item.taskId}:${item.date}`),
    ).toEqual(["a:2026-11-01", "a:2026-11-02", "b:2026-11-02"]);
  });
});

describe("parseImportBundle", () => {
  const valid = {
    version: 1,
    exportedAt: "2026-11-04T00:00:00.000Z",
    tasks: [],
    intervals: [],
    checkins: [],
    todos: [],
    settings: { gridZoom: 40 },
  };

  it("accepts a v1 bundle and sanitizes settings", () => {
    const bundle = parseImportBundle(JSON.stringify(valid));

    expect(bundle.version).toBe(1);
    expect(bundle.namePeriods).toEqual([]);
    expect(bundle.settings.gridZoom).toBe(40);
    expect(bundle.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("accepts a v2 bundle with explicit name periods", () => {
    const bundle = parseImportBundle(
      JSON.stringify({
        ...valid,
        version: 2,
        namePeriods: [
          {
            id: "p1",
            taskId: "t1",
            name: "跑步",
            start: "2026-10-01",
            end: null,
          },
        ],
      }),
    );

    expect(bundle.version).toBe(2);
    expect(bundle.namePeriods).toEqual([
      {
        id: "p1",
        taskId: "t1",
        name: "跑步",
        start: "2026-10-01",
        end: null,
      },
    ]);
  });

  it("rejects malformed JSON and unsupported versions", () => {
    expect(() => parseImportBundle("{")).toThrow("invalid-json");
    expect(() =>
      parseImportBundle(JSON.stringify({ ...valid, version: 3 })),
    ).toThrow("unsupported-version");
  });

  it("synthesizes one name period per task for v1 bundles", () => {
    const bundle = parseImportBundle(
      JSON.stringify({
        ...valid,
        tasks: [
          {
            id: "t1",
            name: "跑步",
            category: "voluntary",
            order: 0,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
        intervals: [
          {
            id: "i1",
            taskId: "t1",
            start: "2026-10-02",
            end: null,
          },
        ],
      }),
    );

    expect(bundle.namePeriods).toEqual([
      {
        id: "t1:name",
        taskId: "t1",
        name: "跑步",
        start: "2026-10-02",
        end: null,
      },
    ]);
  });

  it("rejects a bundle with broken entity fields", () => {
    expect(() =>
      parseImportBundle(
        JSON.stringify({
          ...valid,
          tasks: [{ id: "t1", name: "跑步", category: "other" }],
        }),
      ),
    ).toThrow("invalid-structure");
  });

  it("defaults everyDays to 1 for bundles written before the field existed", () => {
    const bundle = parseImportBundle(
      JSON.stringify({
        ...valid,
        intervals: [
          {
            id: "i1",
            taskId: "t1",
            start: "2026-10-01",
            end: null,
          },
        ],
      }),
    );

    expect(bundle.intervals[0].everyDays).toBe(1);
  });

  it("normalizes legacy recorded checkins to done", () => {
    const bundle = parseImportBundle(
      JSON.stringify({
        ...valid,
        checkins: [
          {
            id: "c1",
            taskId: "t1",
            date: "2026-11-02",
            status: "recorded",
            value: "3min",
            note: null,
            updatedAt: "2026-11-02T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(bundle.checkins[0]).toMatchObject({
      status: "done",
      value: "3min",
    });
  });
});

const MIGRATION = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/001_init.sql"),
  "utf8",
);
const MIGRATION_002 = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/002_checkin_value.sql"),
  "utf8",
);
const MIGRATION_003 = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/003_task_interval_every_days.sql"),
  "utf8",
);
const MIGRATION_004 = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/004_drop_recorded_status.sql"),
  "utf8",
);
const MIGRATION_005 = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/005_task_name_periods.sql"),
  "utf8",
);

function createDb(seed = true): SqlDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION);
  sqlite.exec(MIGRATION_002);
  sqlite.exec(MIGRATION_003);
  sqlite.exec(MIGRATION_004);
  sqlite.exec(MIGRATION_005);
  if (seed) {
    sqlite.exec(
      "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
        "VALUES ('t1', '跑步', 'voluntary', 0, '2026-10-01', '2026-10-01')",
    );
    sqlite.exec(
      "INSERT INTO task_intervals (id, task_id, start_date, end_date) " +
        "VALUES ('i1', 't1', '2026-10-01', NULL)",
    );
    sqlite.exec(
      "INSERT INTO task_name_periods (id, task_id, name, start_date, end_date) " +
        "VALUES ('p1', 't1', '跑步', '2026-10-01', NULL)",
    );
    sqlite.exec(
      "INSERT INTO todos (id, title, due_date, done, completed_at, created_at, updated_at) " +
        "VALUES ('local-todo', '本地待办', NULL, 0, NULL, '2026-10-01', '2026-10-01')",
    );
  }

  type BindValue = string | number | bigint | null | Uint8Array;

  return {
    select: async <T>(query: string, values: unknown[] = []) => {
      return sqlite.prepare(query).all(...(values as BindValue[])) as T;
    },
    execute: async (query: string, values: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...(values as BindValue[]));
      return { rowsAffected: Number(result.changes) };
    },
  };
}

describe("importData", () => {
  it("upserts by id and keeps local rows that the file does not contain", async () => {
    const db = createDb();
    await upsertCheckin(db, {
      taskId: "t1",
      date: "2026-11-01",
      status: "done",
    });

    const bundle = buildExportBundle(
      [
        {
          id: "t1",
          name: "晨跑",
          category: "voluntary",
          intervals: [
            { id: "i1", taskId: "t1", start: "2026-10-05", end: null },
            { id: "i3", taskId: "t1", start: "2026-11-01", end: null },
          ],
          order: 0,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-11-04T00:00:00.000Z",
        },
        {
          id: "t3",
          name: "阅读",
          category: "forced",
          intervals: [
            { id: "i4", taskId: "t3", start: "2026-11-02", end: null },
          ],
          order: 1,
          createdAt: "2026-11-02T00:00:00.000Z",
          updatedAt: "2026-11-02T00:00:00.000Z",
        },
      ],
      [
        { ...checkin("t1", "2026-11-01"), status: "missed" },
        checkin("t1", "2026-11-02"),
      ],
      [todo("imported-todo", "2026-10-02T00:00:00.000Z")],
      { ...DEFAULT_SETTINGS, gridZoom: 40 },
      new Date(2026, 10, 4, 9, 0, 0),
    );

    const counts = await importData(db, bundle);

    expect(counts).toEqual({
      tasks: 2,
      namePeriods: 2,
      intervals: 3,
      checkins: 2,
      todos: 1,
    });

    const tasks = await listTasks(db);
    expect(tasks.map((task) => task.name)).toEqual(["晨跑", "阅读"]);
    expect(tasks[0].namePeriods?.map((period) => period.name)).toEqual([
      "跑步",
      "晨跑",
    ]);
    expect(tasks[0].intervals.map((interval) => interval.id)).toEqual([
      "i1",
      "i3",
    ]);
    expect(tasks[0].intervals[0].start).toBe("2026-10-05");

    const checkins = await listCheckins(db);
    expect(checkins).toHaveLength(2);
    expect(
      checkins.find((item) => item.date === "2026-11-01")?.status,
    ).toBe("missed");

    const todos = await listTodos(db);
    expect(todos.map((item) => item.id).sort()).toEqual([
      "imported-todo",
      "local-todo",
    ]);

    expect((await getSettings(db)).gridZoom).toBe(40);
  });

  it("is idempotent when the same file is imported twice", async () => {
    const db = createDb();
    const bundle = buildExportBundle(
      [task("t1", 0)],
      [checkin("t1", "2026-11-02")],
      [todo("todo", "2026-10-01T00:00:00.000Z")],
      DEFAULT_SETTINGS,
      new Date(2026, 10, 4, 9, 0, 0),
    );

    await importData(db, bundle);
    await importData(db, bundle);

    expect(await listTasks(db)).toHaveLength(1);
    expect(await listCheckins(db)).toHaveLength(1);
    expect(await listTodos(db)).toHaveLength(2);
  });

  it("round-trips an export into a fresh database unchanged", async () => {
    const source = createDb();
    await upsertCheckin(source, {
      taskId: "t1",
      date: "2026-11-02",
      status: "done",
      note: "5 公里",
    });
    const now = new Date(2026, 10, 4, 9, 0, 0);
    const bundle = await exportData(source, now);

    const target = createDb(false);
    await importData(target, bundle);
    const restored = await exportData(target, now);

    expect(restored).toEqual(bundle);
  });
});
