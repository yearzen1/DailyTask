import { describe, expect, it } from "vitest";

import { checkinKey } from "../../domain/keys";
import type { Checkin, CheckinStatus, Task, Todo } from "../../domain/types";
import { DEFAULT_SETTINGS } from "../../domain/types";
import { buildToday } from "./today";

const NOW = new Date(2026, 10, 2, 9, 0, 0);
const TODAY = "2026-11-02";

function task(
  id: string,
  name: string,
  category: "voluntary" | "forced",
  order: number,
  start = "2026-11-01",
  end: string | null = null,
): Task {
  return {
    id,
    name,
    category,
    intervals: [{ id: `i-${id}`, taskId: id, start, end }],
    order,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function checkin(id: string, status: CheckinStatus): Checkin {
  return {
    id: `c-${id}`,
    taskId: id,
    date: TODAY,
    status,
    value: null,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function todo(
  id: string,
  dueDate: string | null,
  done = false,
  completedAt = done ? new Date(2026, 10, 2, 9, 0, 0).toISOString() : null,
): Todo {
  return {
    id,
    title: id,
    dueDate,
    done,
    completedAt,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

const tasks = [
  task("v1", "跑步", "voluntary", 1),
  task("v2", "背单词", "voluntary", 0),
  task("f1", "开会", "forced", 2),
  task("old", "已停用", "voluntary", 3, "2026-10-01", "2026-10-31"),
];

const checkins = new Map<string, Checkin>();
checkins.set(checkinKey("v1", TODAY), checkin("v1", "done"));
checkins.set(checkinKey("v2", TODAY), checkin("v2", "skipped"));

describe("buildToday", () => {
  it("splits applicable tasks by category and keeps order", () => {
    const data = buildToday(tasks, checkins, DEFAULT_SETTINGS, [], NOW);

    expect(data.voluntary.map((row) => row.task.id)).toEqual(["v2", "v1"]);
    expect(data.forced.map((row) => row.task.id)).toEqual(["f1"]);
    expect(data.today).toBe(TODAY);
    expect(data.dateLabel).toContain("11/02");
  });

  it("computes days left from the current interval's deadline", () => {
    const data = buildToday(
      [
        task("future", "未来截止", "voluntary", 0, "2026-11-01", "2026-11-05"),
        task("today", "今天截止", "voluntary", 1, "2026-11-01", TODAY),
        task("open", "一直有效", "voluntary", 2),
      ],
      new Map(),
      DEFAULT_SETTINGS,
      [],
      NOW,
    );

    expect(data.voluntary.map((row) => row.deadlineDays)).toEqual([3, 0, null]);
  });

  it("excludes skipped tasks from the category denominator", () => {
    const data = buildToday(tasks, checkins, DEFAULT_SETTINGS, [], NOW);

    expect(data.voluntaryStat).toEqual({ done: 1, total: 1 });
    expect(data.forcedStat).toEqual({ done: 0, total: 1 });
    expect(data.todoStat).toEqual({ done: 0, total: 0 });
    expect(data.progress).toMatchObject({
      done: 1,
      pending: 1,
      skipped: 1,
      applicable: 3,
    });
  });

  it("groups overdue and today todos, keeping ones completed today", () => {
    const todos = [
      todo("future", "2026-11-05"),
      todo("done", TODAY, true),
      todo(
        "stale-done",
        "2026-10-30",
        true,
        new Date(2026, 10, 1, 9, 0, 0).toISOString(),
      ),
      todo("today", TODAY),
      todo("overdue", "2026-10-31"),
      todo("no-date", null),
    ];

    const data = buildToday(tasks, checkins, DEFAULT_SETTINGS, todos, NOW);

    expect(data.overdueTodos.map((item) => item.todo.id)).toEqual(["overdue"]);
    expect(data.overdueTodos[0].overdueDays).toBe(2);
    expect(data.todayTodos.map((item) => item.todo.id)).toEqual([
      "done",
      "today",
    ]);
    expect(data.dueTodos.map((item) => item.todo.id)).toEqual([
      "overdue",
      "done",
      "today",
    ]);
    expect(data.todoStat).toEqual({ done: 1, total: 3 });
    expect(data.progress).toMatchObject({
      done: 2,
      pending: 3,
      skipped: 1,
      applicable: 6,
      ratio: 0.4,
    });
  });
});
