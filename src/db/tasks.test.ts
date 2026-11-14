import { describe, expect, it } from "vitest";

import type { SqlDatabase } from "../db/client";
import {
  createTask,
  deleteTask,
  intervalFromRow,
  listTasks,
  namePeriodFromRow,
  renameTask,
  reorderTasks,
  type IntervalRow,
  type NamePeriodRow,
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

const namePeriodRows: NamePeriodRow[] = [
  {
    id: "p1",
    task_id: "t1",
    name: "每天一个",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
  },
  {
    id: "p2",
    task_id: "t1",
    name: "每天两个",
    start_date: "2026-11-01",
    end_date: null,
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

describe("namePeriodFromRow", () => {
  it("maps snake_case row to the name period entity", () => {
    expect(namePeriodFromRow(namePeriodRows[1])).toEqual({
      id: "p2",
      taskId: "t1",
      name: "每天两个",
      start: "2026-11-01",
      end: null,
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

  it("uses the latest name period as the current name", () => {
    const task = taskFromRows(
      taskRow,
      intervalRows.map(intervalFromRow),
      namePeriodRows.map(namePeriodFromRow),
    );

    expect(task.name).toBe("每天两个");
    expect(task.namePeriods?.map((period) => period.id)).toEqual(["p1", "p2"]);
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
    expect(calls[2][2]).toBe("跑步");
    expect(calls[2][3]).toBe("2026-11-01");
    expect(calls[2][4]).toBeNull();
    expect(task.namePeriods?.[0].name).toBe("跑步");
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
      "task_name_periods",
      "task_intervals",
      "tasks",
    ]);
  });
});

describe("listTasks", () => {
  it("groups intervals and name periods by task_id", async () => {
    const db: SqlDatabase = {
      select: async <T>(query: string) => {
        if (query.includes("FROM tasks")) {
          return [taskRow] as T;
        }
        if (query.includes("FROM task_name_periods")) {
          return namePeriodRows as T;
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
    expect(tasks[0].name).toBe("每天两个");
    expect(tasks[0].namePeriods?.map((period) => period.id)).toEqual([
      "p1",
      "p2",
    ]);
  });
});

describe("renameTask", () => {
  const TODAY = "2026-11-10";

  function renameDb(
    periods: NamePeriodRow[],
    createdAt = "2026-10-01T00:00:00.000Z",
  ) {
    const calls: { query: string; values: unknown[] }[] = [];
    const db: SqlDatabase = {
      select: async <T>(query: string) => {
        if (query.includes("FROM task_name_periods")) {
          return periods as T;
        }
        return [{ created_at: createdAt }] as T;
      },
      execute: async (query, values = []) => {
        calls.push({ query, values });
        return { rowsAffected: 1 };
      },
    };
    return { db, calls };
  }

  it("closes the current period yesterday and opens a new one today", async () => {
    const { db, calls } = renameDb([
      {
        id: "p1",
        task_id: "t1",
        name: "每天一个",
        start_date: "2026-10-01",
        end_date: null,
      },
    ]);

    const periods = await renameTask(db, "t1", "每天两个", TODAY);

    expect(calls[0].values).toEqual(["2026-11-09", "t1", TODAY]);
    expect(calls[1].values[1]).toBe("t1");
    expect(calls[1].values[2]).toBe("每天两个");
    expect(calls[1].values[3]).toBe(TODAY);
    expect(calls[2].values[0]).toBe("每天两个");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ name: "每天一个", end: "2026-11-09" });
    expect(periods[1]).toMatchObject({ name: "每天两个", start: TODAY, end: null });
  });

  it("updates in place when the current period already starts today", async () => {
    const { db, calls } = renameDb([
      {
        id: "p2",
        task_id: "t1",
        name: "每天一个",
        start_date: TODAY,
        end_date: null,
      },
    ]);

    const periods = await renameTask(db, "t1", "每天两个", TODAY);

    expect(calls).toHaveLength(2);
    expect(calls[0].values).toEqual(["每天两个", "p2"]);
    expect(periods).toHaveLength(1);
    expect(periods[0].name).toBe("每天两个");
  });

  it("rewrites the current period when only fixing a typo", async () => {
    const { db, calls } = renameDb([
      {
        id: "p1",
        task_id: "t1",
        name: "每天一个",
        start_date: "2026-10-01",
        end_date: null,
      },
    ]);

    const periods = await renameTask(
      db,
      "t1",
      "每天一个俯卧撑",
      TODAY,
      "rewrite-current",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].values).toEqual(["每天一个俯卧撑", "p1"]);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      name: "每天一个俯卧撑",
      start: "2026-10-01",
      end: null,
    });
  });

  it("updates in place for a future-scheduled period", async () => {
    const { db, calls } = renameDb([
      {
        id: "p1",
        task_id: "t1",
        name: "旧名",
        start_date: "2026-12-01",
        end_date: null,
      },
    ]);

    const periods = await renameTask(db, "t1", "新名", TODAY);

    expect(calls).toHaveLength(2);
    expect(calls[0].values).toEqual(["新名", "p1"]);
    expect(periods).toHaveLength(1);
    expect(periods[0].name).toBe("新名");
  });

  it("updates in place for a task created today even if it started earlier", async () => {
    const createdAt = new Date(2026, 10, 10, 9, 0, 0).toISOString();
    const { db, calls } = renameDb(
      [
        {
          id: "p1",
          task_id: "t1",
          name: "每天一个",
          start_date: "2026-10-01",
          end_date: null,
        },
      ],
      createdAt,
    );

    const periods = await renameTask(db, "t1", "每天两个", TODAY);

    expect(calls).toHaveLength(2);
    expect(calls[0].values).toEqual(["每天两个", "p1"]);
    expect(periods).toHaveLength(1);
  });

  it("does nothing when the name is unchanged", async () => {
    const { db, calls } = renameDb([
      {
        id: "p1",
        task_id: "t1",
        name: "每天一个",
        start_date: "2026-10-01",
        end_date: null,
      },
    ]);

    const periods = await renameTask(db, "t1", "每天一个", TODAY);

    expect(calls).toHaveLength(0);
    expect(periods).toHaveLength(1);
  });
});
