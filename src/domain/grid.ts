import { isApplicable } from "./applicability";
import { addDays, diffDays, range } from "./date";
import { namePeriodsOf } from "./names";
import type { NamePeriod, Task } from "./types";

/** 保底一年历史 + 未来 30 天，覆盖「整年概览」与临时补打卡。 */
export const GRID_PAST_DAYS = 365;
export const GRID_FUTURE_DAYS = 30;
/** 1000 列性能目标的上限，超出时只从左侧截断，今天始终保留。 */
export const GRID_MAX_COLUMNS = 1200;

export interface DateAxis {
  start: string;
  end: string;
  dates: string[];
  todayIndex: number;
}

/**
 * 日期轴（docs/reference/grid.md）：
 * start = min(最早区间启用日, today − 365)
 * end   = max(today + 30, 最晚区间启用日)
 * 超过 1200 列时从左侧截断，保证今天和未来 30 天在轴内。
 */
export function buildDateAxis(tasks: Task[], today: string): DateAxis {
  let start = addDays(today, -GRID_PAST_DAYS);
  let end = addDays(today, GRID_FUTURE_DAYS);

  for (const task of tasks) {
    for (const interval of task.intervals) {
      if (interval.start < start) {
        start = interval.start;
      }
      if (interval.start > end) {
        end = interval.start;
      }
    }
  }

  if (diffDays(end, start) + 1 > GRID_MAX_COLUMNS) {
    start = addDays(end, -(GRID_MAX_COLUMNS - 1));
  }

  return {
    start,
    end,
    dates: range(start, end),
    todayIndex: diffDays(today, start),
  };
}

export interface GridRow {
  /** 名称段标识；当前段复用 task.id，历史段为 task.id~period.id。 */
  key: string;
  task: Task;
  namePeriod: NamePeriod;
  /** 该段显示的名字。 */
  name: string;
  /** 是否为当前（最新）名称段。 */
  current: boolean;
  /** 已停用：历史可见，但格子不可点。 */
  disabled: boolean;
}

export interface GridGroups {
  voluntary: GridRow[];
  forced: GridRow[];
  disabled: GridRow[];
}

/**
 * 今天不再适用、且所有区间都已结束 → 已停用。
 * 只排到未来再启用的任务不算停用，仍留在原分类里。
 */
export function isRetired(task: Task, today: string): boolean {
  if (task.intervals.length === 0) {
    return true;
  }
  return (
    !isApplicable(task.intervals, today) &&
    task.intervals.every((interval) => interval.end !== null && interval.end < today)
  );
}

export function groupTasks(tasks: Task[], today: string): GridGroups {
  const sorted = [...tasks].sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );
  const groups: GridGroups = { voluntary: [], forced: [], disabled: [] };

  for (const task of sorted) {
    const retired = isRetired(task, today);
    const group = retired
      ? groups.disabled
      : task.category === "voluntary"
        ? groups.voluntary
        : groups.forced;

    // 当前名称段在最上面，历史段按时间倒序紧随其后。
    const periods = namePeriodsOf(task);
    const ordered = [
      periods[periods.length - 1],
      ...periods.slice(0, -1).reverse(),
    ];
    ordered.forEach((period, index) => {
      const current = index === 0;
      group.push({
        key: current ? task.id : `${task.id}~${period.id}`,
        task,
        namePeriod: period,
        name: period.name,
        current,
        disabled: retired,
      });
    });
  }

  return groups;
}

/** 月份带的分隔刻度：每个自然月的第一天。 */
export function monthTicks(dates: string[]): { key: string; index: number }[] {
  const ticks: { key: string; index: number }[] = [];
  let last = "";
  dates.forEach((date, index) => {
    const key = date.slice(0, 7);
    if (key !== last) {
      ticks.push({ key, index });
      last = key;
    }
  });
  return ticks;
}
