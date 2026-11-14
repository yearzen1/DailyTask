import { describe, expect, it } from "vitest";

import { checkinKey } from "./keys";
import { completionRate30, taskStreak } from "./stats";
import type { Checkin, CheckinStatus, Interval, Settings, Task } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const settings: Settings = { ...DEFAULT_SETTINGS };
const TODAY = "2026-11-10";

function makeTask(start = "2026-10-01", end: string | null = null): Task {
  const interval: Interval = { id: "i1", taskId: "t1", start, end };
  return {
    id: "t1",
    name: "跑步",
    category: "voluntary",
    intervals: [interval],
    order: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function withCheckins(
  entries: [string, CheckinStatus][],
): Map<string, Checkin> {
  const map = new Map<string, Checkin>();
  for (const [date, status] of entries) {
    map.set(checkinKey("t1", date), {
      id: `c-${date}`,
      taskId: "t1",
      date,
      status,
      value: null,
      note: null,
      updatedAt: `${date}T00:00:00.000Z`,
    });
  }
  return map;
}

describe("taskStreak", () => {
  it("counts consecutive done days up to yesterday when today is pending", () => {
    const checkins = withCheckins([
      ["2026-11-09", "done"],
      ["2026-11-08", "done"],
      ["2026-11-07", "done"],
    ]);

    expect(taskStreak(makeTask(), checkins, TODAY, settings)).toBe(3);
  });

  it("includes today when it is already done", () => {
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-11-09", "done"],
    ]);

    expect(taskStreak(makeTask(), checkins, TODAY, settings)).toBe(2);
  });

  it("breaks on a missed day", () => {
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-11-08", "done"],
    ]);

    expect(taskStreak(makeTask(), checkins, TODAY, settings)).toBe(1);
  });

  it("does not count or break on skipped days", () => {
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-11-09", "skipped"],
      ["2026-11-08", "done"],
    ]);

    expect(taskStreak(makeTask(), checkins, TODAY, settings)).toBe(2);
  });

  it("skips non-applicable gaps between segments", () => {
    const off = { ...settings, autoSettleMissed: false };
    const task: Task = {
      ...makeTask("2026-10-01", "2026-10-05"),
      intervals: [
        { id: "i1", taskId: "t1", start: "2026-10-01", end: "2026-10-05" },
        { id: "i2", taskId: "t1", start: "2026-11-05", end: null },
      ],
    };
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-10-05", "done"],
    ]);

    // 11-05..11-09 与 10-06..10-31 都不可用，不中断也不计数。
    expect(taskStreak(task, checkins, TODAY, off)).toBe(2);
  });

  it("keeps the streak open for past blanks when auto settle is off", () => {
    const off = { ...settings, autoSettleMissed: false };
    const checkins = withCheckins([
      ["2026-11-09", "done"],
      ["2026-11-07", "done"],
    ]);

    expect(taskStreak(makeTask(), checkins, TODAY, off)).toBe(2);
  });

  it("does not count or break on off-cycle days", () => {
    const task: Task = {
      ...makeTask("2026-11-02"),
      intervals: [
        { id: "i1", taskId: "t1", start: "2026-11-02", end: null, everyDays: 2 },
      ],
    };
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-11-08", "done"],
      ["2026-11-06", "done"],
    ]);

    expect(taskStreak(task, checkins, TODAY, settings)).toBe(3);  });

  it("returns 0 for a task without intervals", () => {
    expect(
      taskStreak(
        { ...makeTask(), intervals: [] },
        new Map(),
        TODAY,
        settings,
      ),
    ).toBe(0);
  });

  it("stops a historical name period at its end date", () => {
    const checkins = withCheckins([
      ["2026-10-30", "done"],
      ["2026-10-31", "done"],
      ["2026-11-01", "done"],
      ["2026-11-10", "done"],
    ]);

    expect(
      taskStreak(makeTask(), checkins, TODAY, settings, {
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    ).toBe(2);
  });

  it("does not count dates outside the current name period", () => {
    const off = { ...settings, autoSettleMissed: false };
    const checkins = withCheckins([
      ["2026-10-31", "done"],
      ["2026-11-01", "done"],
      ["2026-11-10", "done"],
    ]);

    // 10-31 属于旧段，不能计入当前段的连续天数。
    expect(
      taskStreak(makeTask(), checkins, TODAY, off, {
        start: "2026-11-01",
        end: TODAY,
      }),
    ).toBe(2);
  });
});

describe("completionRate30", () => {
  it("uses done + missed as the denominator and ignores skipped", () => {
    const checkins = withCheckins([
      ["2026-11-10", "done"],
      ["2026-11-09", "done"],
      ["2026-11-08", "missed"],
      ["2026-11-07", "skipped"],
    ]);

    // 30 天窗口内：2 done + 1 显式 missed + 26 个投影 missed = 29。
    const rate = completionRate30(makeTask(), checkins, TODAY, settings);

    expect(rate).toBeCloseTo(2 / 29);
  });

  it("ignores days outside the 30 day window", () => {
    const checkins = withCheckins([
      ["2026-10-01", "missed"],
      ["2026-11-10", "done"],
    ]);
    const task = makeTask("2026-10-01", "2026-10-02");

    // 区间只覆盖 10-01/10-02，均在窗口外。
    expect(completionRate30(task, checkins, TODAY, settings)).toBe(0);
  });

  it("ignores off-cycle days in the denominator", () => {
    const task: Task = {
      ...makeTask("2026-10-12"),
      intervals: [
        { id: "i1", taskId: "t1", start: "2026-10-12", end: null, everyDays: 3 },
      ],
    };
    const checkins = withCheckins([["2026-11-08", "done"]]);

    // 30 天窗口内命中 10 天：1 done + 9 投影 missed。
    expect(completionRate30(task, checkins, TODAY, settings)).toBeCloseTo(
      1 / 10,
    );
  });

  it("returns 0 when there is nothing to settle", () => {
    expect(
      completionRate30(
        makeTask("2026-11-11"),
        new Map(),
        TODAY,
        settings,
      ),
    ).toBe(0);
  });

  it("limits the denominator to a historical name period", () => {
    const checkins = withCheckins([
      ["2026-10-30", "done"],
      ["2026-10-31", "done"],
      ["2026-11-01", "done"],
      ["2026-11-10", "done"],
    ]);

    // 10-02..10-31：2 done + 28 投影 missed。
    expect(
      completionRate30(makeTask(), checkins, TODAY, settings, {
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    ).toBeCloseTo(2 / 30);
  });

  it("anchors the 30 day window at the current period start", () => {
    const checkins = withCheckins([
      ["2026-10-31", "done"],
      ["2026-11-01", "done"],
      ["2026-11-02", "done"],
      ["2026-11-09", "done"],
      ["2026-11-10", "done"],
    ]);

    // 11-01..11-10：4 done + 6 投影 missed。
    expect(
      completionRate30(makeTask(), checkins, TODAY, settings, {
        start: "2026-11-01",
        end: TODAY,
      }),
    ).toBeCloseTo(4 / 10);
  });
});
