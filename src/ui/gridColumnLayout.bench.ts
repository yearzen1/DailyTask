import { bench, describe } from "vitest";

import type { Checkin } from "../domain/types";
import { buildColumnOffsets, buildDateColumnWidths } from "./gridColumnLayout";
import { computeHorizontalWindowByOffsets } from "./useHorizontalWindow";

/** 396 天（365 历史 + 31 未来），与真实日期轴同量级。 */
const dates = Array.from({ length: 396 }, (_, index) => {
  const day = new Date(Date.UTC(2025, 10, 1 + index));
  return day.toISOString().slice(0, 10);
});

const checkins = new Map<string, Checkin>();
dates.forEach((date, index) => {
  checkins.set(`${index}`, {
    id: `c${index}`,
    taskId: `t${index % 20}`,
    date,
    status: "done",
    value: `${index % 97} 分钟`,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  });
});

const widths = dates.map(() => 32);
const offsets = buildColumnOffsets(widths);

describe("任务表列计算", () => {
  bench("396 列 × 396 个自由值求列宽", () => {
    buildDateColumnWidths(dates, checkins.values(), 32);
  });

  bench("1200 列窗口计算（含预算）", () => {
    const wide = buildColumnOffsets(new Array<number>(1200).fill(32));
    computeHorizontalWindowByOffsets(600 * 32, 1440, wide, 160, 95);
  });

  bench("396 列前缀和", () => {
    buildColumnOffsets(widths);
  });

  bench("列命中测试", () => {
    computeHorizontalWindowByOffsets(300 * 32, 1440, offsets, 160, 95);
  });
});
