import { describe, expect, it } from "vitest";

import type { Checkin, Task } from "../domain/types";
import {
  AUTO_COLUMN_MAX_WIDTH,
  buildColumnOffsets,
  buildDateColumnWidths,
  buildTaskColumnWidth,
  findColumnAtOffset,
  scrollLeftForColumn,
  TASK_COLUMN_MIN_WIDTH,
  TASK_FONT_SIZE_DETAIL,
} from "./gridColumnLayout";

function checkin(taskId: string, date: string, value: string): Checkin {
  return {
    id: `${taskId}-${date}`,
    taskId,
    date,
    status: "done",
    value,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function task(id: string, name: string): Task {
  return {
    id,
    name,
    category: "voluntary",
    intervals: [
      { id: `${id}-i`, taskId: id, start: "2026-01-01", end: null },
    ],
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildDateColumnWidths", () => {
  it("uses the longest value in each column and keeps empty columns at base size", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];
    const widths = buildDateColumnWidths(
      dates,
      [
        checkin("t1", dates[0], "1234567890"),
        checkin("t2", dates[0], "1"),
        checkin("t1", dates[1], "x".repeat(20)),
      ],
      32,
    );

    // 10 个数字 ≈ 74px + 10px 留白（12px 字号）。
    expect(widths[0]).toBeCloseTo(84.4);
    // 20 个小写 ASCII 字符 ≈ 132px + 10px 留白。
    expect(widths[1]).toBeCloseTo(142);
    expect(widths[2]).toBe(32);
  });

  it("never shrinks below the zoom size and caps at 320px", () => {
    const dates = ["2026-11-01"];
    const shortWidths = buildDateColumnWidths(
      dates,
      [checkin("t1", dates[0], "1")],
      44,
    );
    expect(shortWidths[0]).toBe(44);

    const longWidths = buildDateColumnWidths(
      dates,
      [checkin("t1", dates[0], "汉".repeat(200))],
      32,
    );
    expect(longWidths[0]).toBe(AUTO_COLUMN_MAX_WIDTH);
  });

  it("ignores values outside the current date axis", () => {
    const widths = buildDateColumnWidths(
      ["2026-11-01"],
      [checkin("t1", "2026-10-01", "1234567890")],
      32,
    );
    expect(widths[0]).toBe(32);
  });
});

describe("buildTaskColumnWidth", () => {
  it("starts at 160px for short names", () => {
    expect(
      buildTaskColumnWidth([task("t1", "开会")], TASK_FONT_SIZE_DETAIL),
    ).toBe(TASK_COLUMN_MIN_WIDTH);
  });

  it("widens for long names and caps at 320px", () => {
    const long = buildTaskColumnWidth(
      [task("t1", "这是一个很长的任务名称用于检查任务列自适应宽度")],
      TASK_FONT_SIZE_DETAIL,
    );
    expect(long).toBeGreaterThan(TASK_COLUMN_MIN_WIDTH);
    expect(long).toBeLessThanOrEqual(AUTO_COLUMN_MAX_WIDTH);

    const capped = buildTaskColumnWidth(
      [task("t1", "汉".repeat(200))],
      TASK_FONT_SIZE_DETAIL,
    );
    expect(capped).toBe(AUTO_COLUMN_MAX_WIDTH);
  });
});

describe("column offsets", () => {
  const offsets = buildColumnOffsets([10, 20, 30]);

  it("builds a prefix sum with a trailing total", () => {
    expect(offsets).toEqual([0, 10, 30, 60]);
  });

  it("finds the column at an offset and clamps both ends", () => {
    expect(findColumnAtOffset(offsets, -1)).toBe(0);
    expect(findColumnAtOffset(offsets, 0)).toBe(0);
    expect(findColumnAtOffset(offsets, 9)).toBe(0);
    expect(findColumnAtOffset(offsets, 10)).toBe(1);
    expect(findColumnAtOffset(offsets, 29)).toBe(1);
    expect(findColumnAtOffset(offsets, 30)).toBe(2);
    expect(findColumnAtOffset(offsets, 60)).toBe(2);
    expect(findColumnAtOffset(offsets, 9_999)).toBe(2);
  });

  it("keeps today visible with trailing columns on variable widths", () => {
    const widths = [100, 100, 100, 200, 100, 100, 100, 100, 100, 100];
    const variable = buildColumnOffsets(widths);
    const target = scrollLeftForColumn(6, variable, 832, 160, 2);

    expect(target).toBeLessThanOrEqual(variable[6]);
    expect(variable[7] - target + 200).toBeLessThanOrEqual(672);
  });

  it("never scrolls before the axis start", () => {
    expect(scrollLeftForColumn(2, buildColumnOffsets([32, 32, 32]), 832, 160)).toBe(0);
  });
});
