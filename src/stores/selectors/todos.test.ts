import { describe, expect, it } from "vitest";

import type { Todo } from "../../domain/types";
import { buildTodoGroups } from "./todos";

const TODAY = "2026-11-04"; // 周三，本周日 = 2026-11-08

function todo(
  id: string,
  dueDate: string | null,
  options: { done?: boolean; createdAt?: string; completedAt?: string } = {},
): Todo {
  const createdAt = options.createdAt ?? "2026-10-01T00:00:00.000Z";
  return {
    id,
    title: `待办${id}`,
    dueDate,
    done: options.done ?? false,
    completedAt: options.completedAt ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

function ids(data: ReturnType<typeof buildTodoGroups>, key: string) {
  return data.groups
    .find((group) => group.key === key)
    ?.items.map((item) => item.todo.id);
}

describe("buildTodoGroups", () => {
  it("splits overdue, today, this week and later", () => {
    const data = buildTodoGroups(
      [
        todo("overdue", "2026-11-01"),
        todo("today", "2026-11-04"),
        todo("friday", "2026-11-06"),
        todo("sunday", "2026-11-08"),
        todo("next-week", "2026-11-09"),
        todo("no-date", null),
      ],
      TODAY,
    );

    expect(ids(data, "overdue")).toEqual(["overdue"]);
    expect(ids(data, "today")).toEqual(["today"]);
    expect(ids(data, "thisWeek")).toEqual(["friday", "sunday"]);
    expect(ids(data, "later")).toEqual(["next-week", "no-date"]);
  });

  it("counts overdue days from the logical today", () => {
    const data = buildTodoGroups([todo("late", "2026-10-31")], TODAY);
    const overdue = data.groups.find((group) => group.key === "overdue");

    expect(overdue?.items[0].overdueDays).toBe(4);
  });

  it("counts days left only for future due dates", () => {
    const data = buildTodoGroups(
      [
        todo("friday", "2026-11-06"),
        todo("later", "2026-11-20"),
        todo("today", "2026-11-04"),
        todo("overdue", "2026-11-01"),
        todo("done", "2026-11-20", { done: true }),
        todo("no-date", null),
      ],
      TODAY,
    );
    const find = (key: string, id: string) =>
      data.groups
        .find((group) => group.key === key)
        ?.items.find((item) => item.todo.id === id);

    expect(find("thisWeek", "friday")?.daysLeft).toBe(2);
    expect(find("later", "later")?.daysLeft).toBe(16);
    expect(find("today", "today")?.daysLeft).toBeNull();
    expect(find("overdue", "overdue")?.daysLeft).toBeNull();
    expect(find("done", "done")?.daysLeft).toBeNull();
    expect(find("later", "no-date")?.daysLeft).toBeNull();
  });

  it("keeps completed todos out of the overdue math", () => {
    const data = buildTodoGroups(
      [
        todo("done-late", "2026-10-01", {
          done: true,
          completedAt: "2026-10-02T00:00:00.000Z",
        }),
        todo("open-late", "2026-10-01"),
      ],
      TODAY,
    );

    expect(ids(data, "overdue")).toEqual(["open-late"]);
    expect(ids(data, "done")).toEqual(["done-late"]);
    expect(data.pendingCount).toBe(1);
  });

  it("sorts dated todos before undated ones and newest completions first", () => {
    const data = buildTodoGroups(
      [
        todo("later-b", "2026-12-01"),
        todo("later-a", "2026-11-20"),
        todo("later-none", null, { createdAt: "2026-01-01T00:00:00.000Z" }),
        todo("done-old", null, {
          done: true,
          completedAt: "2026-10-01T00:00:00.000Z",
        }),
        todo("done-new", null, {
          done: true,
          completedAt: "2026-11-01T00:00:00.000Z",
        }),
      ],
      TODAY,
    );

    expect(ids(data, "later")).toEqual(["later-a", "later-b", "later-none"]);
    expect(ids(data, "done")).toEqual(["done-new", "done-old"]);
  });

  it("always returns the five groups in display order", () => {
    const data = buildTodoGroups([], TODAY);

    expect(data.groups.map((group) => group.key)).toEqual([
      "overdue",
      "today",
      "thisWeek",
      "later",
      "done",
    ]);
  });
});
