import { describe, expect, it } from "vitest";

import type { SqlDatabase } from "../db/client";
import {
  createTask,
  deleteTask,
  intervalFromRow,
  listTasks,
  reorderTasks,
  type IntervalRow,
  type TaskRow,
  taskFromRows,
} from "./tasks";

const taskRow: TaskRow = {
  id: "t1",
  name: "跑步",
  category: "voluntary",
  sort_order: 2,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
};

const intervalRows: IntervalRow[] = [
  {
    id: "i1",
    task_id: "t1",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
    every_days: 1,
  },
  {
    id: "i2",
    task_id: "t1",
    start_date: "2026-11-05",
    end_date: null,
    every_days: 3,
  },
];

describe("intervalFromRow", () => {
  it("maps snake_case row to entity and keeps open end as null", () => {
    expect(intervalFromRow(intervalRows[1])).toEqual({
      id: "i2",
      taskId: "t1",
      start: "2026-11-05",
      end: null,
      everyDays: 3,
    });
  });
});

describe("taskFromRows", () => {
  it("maps sort_order to order and keeps multi-segment intervals", () => {
    const task = taskFromRows(
      taskRow,
      intervalRows.map(intervalFromRow),
    );

    expect(task.order).toBe(2);
    expect(task.createdAt).toBe("2026-11-01T00:00:00.000Z");
    expect(task.intervals).toHaveLength(2);
    expect(task.intervals[0].end).toBe("2026-10-31");
  });
});

describe("createTask", () => {
  it("stores the deadline on the first interval", async () => {
    const calls: unknown[][] = [];
    const db: SqlDatabase = {
      select: async <T>() => [{ next: 0 }] as T,
      execute: async (_query, values = []) => {
        calls.push(values);
        return { rowsAffected: 1 };
      },
    };

    const task = await createTask(db, {
      name: "跑步",
      category: "voluntary",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });

    expect(task.intervals[0].end).toBe("2026-11-30");
    expect(calls[1][3]).toBe("2026-11-30");
  });

  it("leaves the interval open when no deadline is given", async () => {
    const calls: unknown[][] = [];
    const db: SqlDatabase = {
      select: async <T>() => [{ next: 0 }] as T,
      execute: async (_query, values = []) => {
        calls.push(values);
        return { rowsAffected: 1 };
      },
    };

    const task = await createTask(db, {
      name: "跑步",
      category: "voluntary",
      startDate: "2026-11-01",
    });

    expect(task.intervals[0].end).toBeNull();
    expect(calls[1][3]).toBeNull();
  });
});

describe("reorderTasks", () => {
  it("writes sequential sort_order values in the given order", async () => {
    const calls: unknown[][] = [];
    const db: SqlDatabase = {
      select: async <T>() => [] as T,
      execute: async (_query, values = []) => {
        calls.push(values);
        return { rowsAffected: 1 };
      },
    };

    await reorderTasks(db, ["t2", "t1", "t3"]);

    expect(calls.map((values) => [values[0], values[2]])).toEqual([
      [0, "t2"],
      [1, "t1"],
      [2, "t3"],
    ]);
  });
});

describe("deleteTask", () => {
  it("removes checkins, intervals and the task in cascade-safe order", async () => {
    const queries: string[] = [];
    const db: SqlDatabase = {
      select: async <T>() => [] as T,
      execute: async (query) => {
        queries.push(query);
        return { rowsAffected: 1 };
      },
    };

    await deleteTask(db, "t1");

    expect(queries.map((query) => query.split(" ")[2])).toEqual([
      "checkins",
      "task_intervals",
      "tasks",
    ]);
  });
});

describe("listTasks", () => {
  it("groups intervals by task_id", async () => {
    const db: SqlDatabase = {
      select: async <T>(query: string) => {
        if (query.includes("FROM tasks")) {
          return [taskRow] as T;
        }
        return intervalRows as T;
      },
      execute: async () => ({ rowsAffected: 0 }),
    };

    const tasks = await listTasks(db);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].intervals.map((interval) => interval.id)).toEqual([
      "i1",
      "i2",
    ]);
  });
});
