import { useMemo } from "react";

import { findColumnAtOffset } from "./gridColumnLayout";

export const TASK_COL_WIDTH = 160;
/** 单次渲染的格子预算：DOM ≤ 2000 格（docs/reference/grid.md 第 3 节）。 */
export const RENDERED_CELL_BUDGET = 2000;
/** 可视区左右各留半屏 overscan；再多只是白建 DOM。 */
const OVERSCAN_SCREENS = 0.5;

export interface HorizontalWindow {
  /** 起始列（含）。 */
  start: number;
  /** 结束列（不含）。 */
  end: number;
  leftPad: number;
  rightPad: number;
}

/**
 * 横向虚拟化窗口：可视区 ±2 屏 overscan（±3 屏会突破 2k 格 DOM 预算）。
 * scrollLeft 是滚动容器的内容坐标；日期列 i 的内容坐标 = 任务列 + i * cellSize。
 */
export function computeHorizontalWindow(
  scrollLeft: number,
  viewportWidth: number,
  total: number,
  cellSize: number,
  taskColWidth = TASK_COL_WIDTH,
): HorizontalWindow {
  if (total <= 0) {
    return { start: 0, end: 0, leftPad: 0, rightPad: 0 };
  }

  const dateViewport = Math.max(0, viewportWidth - taskColWidth);
  const visible = Math.max(1, Math.ceil(dateViewport / cellSize));
  const overscan = visible * 2;
  const firstVisible = Math.floor(Math.max(0, scrollLeft) / cellSize);

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(total, firstVisible + visible + overscan);

  return {
    start,
    end,
    leftPad: start * cellSize,
    rightPad: (total - end) * cellSize,
  };
}

export function useHorizontalWindow(
  scrollLeft: number,
  viewportWidth: number,
  total: number,
  cellSize: number,
): HorizontalWindow {
  return useMemo(
    () => computeHorizontalWindow(scrollLeft, viewportWidth, total, cellSize),
    [scrollLeft, viewportWidth, total, cellSize],
  );
}

/**
 * 可变列宽版本：offsets 是列宽前缀和。
 *
 * 窗口 = 可视列 + 左右各半屏 overscan，再压到 `maxColumns`（按行数换算的格子预算）。
 * 可视列永远完整覆盖，贴边时省下的 overscan 自动补到另一侧。
 */
export function computeHorizontalWindowByOffsets(
  scrollLeft: number,
  viewportWidth: number,
  offsets: number[],
  taskColWidth = TASK_COL_WIDTH,
  maxColumns = Number.POSITIVE_INFINITY,
): HorizontalWindow {
  const total = offsets.length - 1;
  if (total <= 0) {
    return { start: 0, end: 0, leftPad: 0, rightPad: 0 };
  }

  const dateViewport = Math.max(0, viewportWidth - taskColWidth);
  const left = Math.max(0, scrollLeft);
  const firstVisible = findColumnAtOffset(offsets, left);
  const lastVisible = Math.min(
    total - 1,
    findColumnAtOffset(
      offsets,
      left + Math.max(0, dateViewport - 1),
    ),
  );
  const visibleCount = Math.max(1, lastVisible - firstVisible + 1);
  const budget = Math.max(visibleCount, maxColumns);
  const overscan = Math.max(
    0,
    Math.min(
      Math.ceil(visibleCount * OVERSCAN_SCREENS),
      budget - visibleCount,
    ),
  );
  const leftOverscan = Math.min(firstVisible, Math.ceil(overscan / 2));
  const rightOverscan = Math.min(
    total - (lastVisible + 1),
    overscan - leftOverscan,
  );

  const start = firstVisible - leftOverscan;
  const end = lastVisible + 1 + rightOverscan;

  return {
    start,
    end,
    leftPad: offsets[start],
    rightPad: offsets[total] - offsets[end],
  };
}

export function useHorizontalWindowByOffsets(
  scrollLeft: number,
  viewportWidth: number,
  offsets: number[],
  taskColWidth = TASK_COL_WIDTH,
  maxColumns?: number,
): HorizontalWindow {
  return useMemo(
    () =>
      computeHorizontalWindowByOffsets(
        scrollLeft,
        viewportWidth,
        offsets,
        taskColWidth,
        maxColumns,
      ),
    [scrollLeft, viewportWidth, offsets, taskColWidth, maxColumns],
  );
}

/** 打开时滚到今天，右侧留 4 天。 */
export function scrollLeftForToday(
  todayIndex: number,
  viewportWidth: number,
  cellSize: number,
  taskColWidth = TASK_COL_WIDTH,
  trailing = 4,
): number {
  const dateViewport = Math.max(0, viewportWidth - taskColWidth);
  const visible = Math.max(0, Math.floor(dateViewport / cellSize));
  return Math.max(0, (todayIndex - Math.max(visible - trailing, 0)) * cellSize);
}
