import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import type { SqlDatabase } from "./client";
import { listCheckins, upsertCheckin } from "./checkins";
import {
  appendInterval,
  closeOpenInterval,
  createTask,
  listTasks,
  renameTask,
  updateIntervalDates,
} from "./tasks";

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

/** 真实 SQLite：验证停用/重新启用只追加区间，历史区间与打卡行都不动。 */
function createDb(): SqlDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION);
  sqlite.exec(MIGRATION_002);
  sqlite.exec(MIGRATION_003);
  sqlite.exec(MIGRATION_004);
  sqlite.exec(MIGRATION_005);
  sqlite.exec(
    "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
      "VALUES ('t1', '跑步', 'voluntary', 0, '2026-10-01', '2026-10-01')",
  );
  sqlite.exec(
    "INSERT INTO task_intervals (id, task_id, start_date, end_date) " +
      "VALUES ('i1', 't1', '2026-10-01', NULL)",
  );

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

describe("interval history", () => {
  it("keeps earlier intervals and checkins when stopping and resuming", async () => {
    const db = createDb();
    await upsertCheckin(db, {
      taskId: "t1",
      date: "2026-10-15",
      status: "done",
      note: "只跑了 1km",
    });

    await closeOpenInterval(db, "t1", "2026-11-04");
    await appendInterval(db, "t1", "2026-11-10");

    const [task] = await listTasks(db);
    expect(task.intervals.map((interval) => interval.start)).toEqual([
      "2026-10-01",
      "2026-11-10",
    ]);
    expect(task.intervals[0].end).toBe("2026-11-04");
    expect(task.intervals[1].end).toBeNull();

    const checkins = await listCheckins(db);
    expect(checkins).toHaveLength(1);
    expect(checkins[0]).toMatchObject({
      taskId: "t1",
      date: "2026-10-15",
      status: "done",
      note: "只跑了 1km",
    });
  });

  it("closes the open interval once and reports zero rows afterwards", async () => {
    const db = createDb();

    expect(await closeOpenInterval(db, "t1", "2026-11-04")).toBe(1);
    expect(await closeOpenInterval(db, "t1", "2026-11-05")).toBe(0);

    const [task] = await listTasks(db);
    expect(task.intervals[0].end).toBe("2026-11-04");
  });

  it("editing the latest interval leaves the earlier segment untouched", async () => {
    const db = createDb();
    await closeOpenInterval(db, "t1", "2026-11-04");
    const second = await appendInterval(db, "t1", "2026-11-10", 3);

    await updateIntervalDates(db, second.id, "2026-11-12", "2026-12-01", 2);

    const [task] = await listTasks(db);
    expect(task.intervals).toEqual([
      expect.objectContaining({ id: "i1", start: "2026-10-01", end: "2026-11-04" }),
      expect.objectContaining({
        id: second.id,
        start: "2026-11-12",
        end: "2026-12-01",
        everyDays: 2,
      }),
    ]);
  });
});

describe("name period history", () => {
  it("keeps the old name and its own stats after renaming from today", async () => {
    const db = createDb();
    const created = await createTask(db, {
      name: "每天一个俯卧撑",
      category: "voluntary",
      startDate: "2026-10-01",
    });
    await upsertCheckin(db, {
      taskId: created.id,
      date: "2026-10-30",
      status: "done",
    });
    await upsertCheckin(db, {
      taskId: created.id,
      date: "2026-10-31",
      status: "done",
    });

    const periods = await renameTask(
      db,
      created.id,
      "每天两个俯卧撑",
      "2026-11-01",
    );

    expect(
      periods.map((period) => [period.name, period.start, period.end]),
    ).toEqual([
      ["每天一个俯卧撑", "2026-10-01", "2026-10-31"],
      ["每天两个俯卧撑", "2026-11-01", null],
    ]);

    const task = (await listTasks(db)).find((item) => item.id === created.id);
    expect(task?.name).toBe("每天两个俯卧撑");
    expect(task?.namePeriods?.map((period) => period.name)).toEqual([
      "每天一个俯卧撑",
      "每天两个俯卧撑",
    ]);

    // 打卡仍然挂在原任务上，数量不变。
    const checkins = await listCheckins(db);
    expect(
      checkins.filter((checkin) => checkin.taskId === created.id),
    ).toHaveLength(2);
  });
});
