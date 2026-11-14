import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "../db/client";
import { upsertCheckin } from "../db/checkins";
import { setSetting } from "../db/settings";
import { createTask } from "../db/tasks";
import { createTodo } from "../db/todos";
import { loadAppData } from "./init";

const MIGRATION = [
  "001_init.sql",
  "002_checkin_value.sql",
  "003_task_interval_every_days.sql",
  "004_drop_recorded_status.sql",
  "005_task_name_periods.sql",
]
  .map((name) =>
    readFileSync(resolve(process.cwd(), "src-tauri/migrations", name), "utf8"),
  )
  .join("\n");

type BindValue = string | number | bigint | null | Uint8Array;

let tempDir: string | null = null;

function openDb(file: string, migrate: boolean): { db: SqlDatabase; close: () => void } {
  const sqlite = new DatabaseSync(file);
  if (migrate) {
    sqlite.exec(MIGRATION);
  }

  return {
    db: {
      select: async <T>(query: string, values: unknown[] = []) =>
        sqlite.prepare(query).all(...(values as BindValue[])) as T,
      execute: async (query: string, values: unknown[] = []) => {
        const result = sqlite.prepare(query).run(...(values as BindValue[]));
        return { rowsAffected: Number(result.changes) };
      },
    },
    close: () => sqlite.close(),
  };
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("restart persistence", () => {
  it("loads tasks, checkins, todos and settings back after reopening the DB", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "dailytask-"));
    const file = join(tempDir, "dailytask.db");

    const first = openDb(file, true);
    const task = await createTask(first.db, {
      name: "跑步",
      category: "voluntary",
      startDate: "2026-11-01",
    });
    await upsertCheckin(first.db, {
      taskId: task.id,
      date: "2026-11-02",
      status: "skipped",
    });
    await createTodo(first.db, {
      title: "交房租",
      dueDate: "2026-11-03",
    });
    await setSetting(first.db, "dayStartHour", 5);
    first.close();

    const second = openDb(file, false);
    const data = await loadAppData(second.db);
    second.close();

    expect(data.tasks).toEqual([
      expect.objectContaining({ id: task.id, name: "跑步" }),
    ]);
    expect(data.checkins).toEqual([
      expect.objectContaining({
        taskId: task.id,
        date: "2026-11-02",
        status: "skipped",
      }),
    ]);
    expect(data.todos).toEqual([
      expect.objectContaining({ title: "交房租", dueDate: "2026-11-03" }),
    ]);
    expect(data.settings.dayStartHour).toBe(5);
  });
});
