import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

const MIGRATIONS = [
  "001_init.sql",
  "002_checkin_value.sql",
  "003_task_interval_every_days.sql",
  "004_drop_recorded_status.sql",
].map((name) =>
  readFileSync(resolve(process.cwd(), "src-tauri/migrations", name), "utf8"),
);

const MIGRATION_005 = readFileSync(
  resolve(process.cwd(), "src-tauri/migrations/005_task_name_periods.sql"),
  "utf8",
);

function legacyDb(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  for (const sql of MIGRATIONS) {
    sqlite.exec(sql);
  }
  return sqlite;
}

describe("005_task_name_periods", () => {
  it("backfills one period per task from the earliest interval start", () => {
    const sqlite = legacyDb();
    sqlite.exec(
      "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
        "VALUES ('t1', '跑步', 'voluntary', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')",
    );
    sqlite.exec(
      "INSERT INTO task_intervals (id, task_id, start_date, end_date, every_days) " +
        "VALUES ('i1', 't1', '2026-10-05', NULL, 1), ('i2', 't1', '2026-11-01', NULL, 1)",
    );

    sqlite.exec(MIGRATION_005);

    const rows = sqlite
      .prepare(
        "SELECT task_id, name, start_date, end_date FROM task_name_periods ORDER BY start_date",
      )
      .all();

    expect(rows).toEqual([
      {
        task_id: "t1",
        name: "跑步",
        start_date: "2026-10-05",
        end_date: null,
      },
    ]);
  });

  it("falls back to the creation date when a task has no intervals", () => {
    const sqlite = legacyDb();
    sqlite.exec(
      "INSERT INTO tasks (id, name, category, sort_order, created_at, updated_at) " +
        "VALUES ('t1', '阅读', 'forced', 0, '2026-09-20T00:00:00.000Z', '2026-09-20T00:00:00.000Z')",
    );

    sqlite.exec(MIGRATION_005);

    expect(
      sqlite
        .prepare(
          "SELECT name, start_date, end_date FROM task_name_periods WHERE task_id = 't1'",
        )
        .get(),
    ).toEqual({ name: "阅读", start_date: "2026-09-20", end_date: null });
  });
});
