import { describe, expect, it } from "vitest";

import {
  applicableTasks,
  currentInterval,
  isApplicable,
} from "./applicability";
import type { Interval, Task } from "./types";

function interval(
  start: string,
  end: string | null,
  everyDays?: number,
): Interval {
  return {
    id: `${start}-${end ?? "open"}-${everyDays ?? 1}`,
    taskId: "t1",
    start,
    end,
    everyDays,
  };
}

function task(id: string, intervals: Interval[]): Task {
  return {
    id,
    name: id,
    category: "voluntary",
    intervals,
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("isApplicable", () => {
  it("covers start-1, start, end, end+1", () => {
    const intervals = [interval("2026-11-02", "2026-11-10")];

    expect(isApplicable(intervals, "2026-11-01")).toBe(false);
    expect(isApplicable(intervals, "2026-11-02")).toBe(true);
    expect(isApplicable(intervals, "2026-11-10")).toBe(true);
    expect(isApplicable(intervals, "2026-11-11")).toBe(false);
  });

  it("treats end = null as open ended", () => {
    const intervals = [interval("2026-11-02", null)];

    expect(isApplicable(intervals, "2026-11-02")).toBe(true);
    expect(isApplicable(intervals, "2030-01-01")).toBe(true);
    expect(isApplicable(intervals, "2026-11-01")).toBe(false);
  });

  it("only hits every N days anchored at the interval start", () => {
    const intervals = [interval("2026-11-02", "2026-11-12", 3)];

    expect(isApplicable(intervals, "2026-11-02")).toBe(true);
    expect(isApplicable(intervals, "2026-11-03")).toBe(false);
    expect(isApplicable(intervals, "2026-11-04")).toBe(false);
    expect(isApplicable(intervals, "2026-11-05")).toBe(true);
    expect(isApplicable(intervals, "2026-11-08")).toBe(true);
    expect(isApplicable(intervals, "2026-11-11")).toBe(true);
    expect(isApplicable(intervals, "2026-11-12")).toBe(false);
  });

  it("anchors each segment independently", () => {
    const intervals = [
      interval("2026-11-01", "2026-11-05", 2),
      interval("2026-11-10", null, 3),
    ];

    expect(isApplicable(intervals, "2026-11-03")).toBe(true);
    expect(isApplicable(intervals, "2026-11-04")).toBe(false);
    expect(isApplicable(intervals, "2026-11-10")).toBe(true);
    expect(isApplicable(intervals, "2026-11-13")).toBe(true);
    expect(isApplicable(intervals, "2026-11-14")).toBe(false);
  });

  it("supports multiple segments and leaves the gap inactive", () => {
    const intervals = [
      interval("2026-10-01", "2026-10-31"),
      interval("2026-11-05", null),
    ];

    expect(isApplicable(intervals, "2026-10-15")).toBe(true);
    expect(isApplicable(intervals, "2026-11-01")).toBe(false);
    expect(isApplicable(intervals, "2026-11-05")).toBe(true);
  });

  it("stays applicable when segments overlap", () => {
    const intervals = [
      interval("2026-11-01", "2026-11-10"),
      interval("2026-11-05", "2026-11-15"),
    ];

    expect(isApplicable(intervals, "2026-11-07")).toBe(true);
    expect(isApplicable(intervals, "2026-11-16")).toBe(false);
  });

  it("returns false for a task without intervals", () => {
    expect(isApplicable([], "2026-11-02")).toBe(false);
  });
});

describe("currentInterval", () => {
  it("returns the latest segment that applies on the date", () => {
    const intervals = [
      interval("2026-11-01", "2026-11-10"),
      interval("2026-11-05", "2026-11-15"),
    ];

    expect(currentInterval(intervals, "2026-11-07")?.start).toBe("2026-11-05");
  });

  it("returns null when no segment applies", () => {
    const intervals = [
      interval("2026-10-01", "2026-10-31"),
      interval("2026-11-05", null),
    ];

    expect(currentInterval(intervals, "2026-11-01")).toBeNull();
  });

  it("respects every N days when picking the current segment", () => {
    const intervals = [interval("2026-11-02", "2026-11-12", 3)];

    expect(currentInterval(intervals, "2026-11-03")).toBeNull();
    expect(currentInterval(intervals, "2026-11-05")?.start).toBe("2026-11-02");
  });
});

describe("applicableTasks", () => {
  it("filters tasks by interval coverage", () => {
    const tasks = [
      task("a", [interval("2026-11-01", null)]),
      task("b", [interval("2026-10-01", "2026-10-31")]),
    ];

    expect(applicableTasks(tasks, "2026-11-02").map((t) => t.id)).toEqual([
      "a",
    ]);
  });
});
