import type { Checkin } from "../domain/types";
import { measureTextWidth } from "./textWidth";

/** 自动列宽上限：超过后格子内换行。 */
export const AUTO_COLUMN_MAX_WIDTH = 320;
/** 左侧任务列最小宽度，保持原有视觉基准。 */
export const TASK_COLUMN_MIN_WIDTH = 160;
/** 自由值字号（详细模式）。 */
export const VALUE_FONT_SIZE = 10;
/** 任务名字号：详细 12px / 概览 11px。 */
export const TASK_FONT_SIZE_DETAIL = 12;
export const TASK_FONT_SIZE_OVERVIEW = 11;

/** 自由值左右留白，避免文字贴边。 */
const VALUE_HORIZONTAL_PADDING = 10;
/** 任务列的圆点、间距、拖拽手柄和左右内边距。 */
const TASK_HORIZONTAL_CHROME = 46;

/**
 * 日期列宽：同一列取该列所有自由值里最宽的一个。
 * baseSize 是缩放最小宽度；maxWidth 是自动加宽上限。
 */
export function buildDateColumnWidths(
  dates: string[],
  checkins: Iterable<Checkin>,
  baseSize: number,
  maxWidth = AUTO_COLUMN_MAX_WIDTH,
): number[] {
  const indexByDate = new Map<string, number>();
  dates.forEach((date, index) => indexByDate.set(date, index));

  const widest = new Array<number>(dates.length).fill(0);
  for (const checkin of checkins) {
    if (!checkin.value) {
      continue;
    }
    const index = indexByDate.get(checkin.date);
    if (index === undefined) {
      continue;
    }
    const required =
      measureTextWidth(checkin.value, VALUE_FONT_SIZE) +
      VALUE_HORIZONTAL_PADDING;
    if (required > widest[index]) {
      widest[index] = required;
    }
  }

  return widest.map((required) =>
    Math.max(baseSize, Math.min(maxWidth, required)),
  );
}

/** 任务列宽：所有任务名（含历史名称段）取最宽，160px 起步、320px 封顶。 */
export function buildTaskColumnWidth(
  tasks: Iterable<{ name: string }>,
  fontSize: number,
  minWidth = TASK_COLUMN_MIN_WIDTH,
  maxWidth = AUTO_COLUMN_MAX_WIDTH,
): number {
  let widest = 0;
  for (const task of tasks) {
    const required =
      measureTextWidth(task.name, fontSize) + TASK_HORIZONTAL_CHROME;
    if (required > widest) {
      widest = required;
    }
  }
  return Math.max(minWidth, Math.min(maxWidth, widest));
}

/** 列宽前缀和：offsets[i] 是第 i 列左边界，offsets[n] 是总宽。 */
export function buildColumnOffsets(widths: number[]): number[] {
  const offsets = new Array<number>(widths.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < widths.length; index += 1) {
    offsets[index + 1] = offsets[index] + widths[index];
  }
  return offsets;
}

/**
 * 找到横坐标 x 所在的列。x 落在最后一列右侧时夹到最后一列。
 * offsets 必须是 buildColumnOffsets 生成的 n + 1 个元素。
 */
export function findColumnAtOffset(
  offsets: number[],
  x: number,
): number {
  const total = offsets.length - 1;
  if (total <= 0) {
    return 0;
  }
  if (x <= 0) {
    return 0;
  }
  if (x >= offsets[total]) {
    return total - 1;
  }

  let low = 0;
  let high = total - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= x) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * 让第 index 列进入视口，右侧优先保留 trailing 列。
 * 与旧的等宽 `scrollLeftForToday` 保持同样的「打开即定位今天」语义。
 */
export function scrollLeftForColumn(
  index: number,
  offsets: number[],
  viewportWidth: number,
  taskColumnWidth: number,
  trailing = 4,
): number {
  const total = offsets.length - 1;
  if (total <= 0) {
    return 0;
  }

  const target = Math.min(total - 1, Math.max(0, index));
  const dateViewport = Math.max(0, viewportWidth - taskColumnWidth);
  const trailingEnd = Math.min(total, target + 1 + trailing);
  const trailingWidth = offsets[trailingEnd] - offsets[target + 1];

  let start = target;
  while (
    start > 0 &&
    offsets[target + 1] - offsets[start - 1] + trailingWidth <= dateViewport
  ) {
    start -= 1;
  }

  return offsets[start];
}
