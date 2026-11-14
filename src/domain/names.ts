import type { NamePeriod, Task } from "./types";

/**
 * 名称段读取（docs/reference/tasks-and-intervals.md）：
 * 有 namePeriods 时以它为准；旧数据/测试数据没有时，用 task.name 合成一段覆盖全历史。
 */

function earliestIntervalStart(task: Task): string | null {
  let earliest: string | null = null;
  for (const interval of task.intervals) {
    if (earliest === null || interval.start < earliest) {
      earliest = interval.start;
    }
  }
  return earliest;
}

/** 兼容没有名称段的旧数据：一段从最早区间（或创建日）开始，至今有效。 */
export function fallbackNamePeriod(task: Task): NamePeriod {
  return {
    id: task.id,
    taskId: task.id,
    name: task.name,
    start: earliestIntervalStart(task) ?? task.createdAt.slice(0, 10),
    end: null,
  };
}

/** 按开始日期升序返回全部名称段。 */
export function namePeriodsOf(task: Task): NamePeriod[] {
  const periods =
    task.namePeriods && task.namePeriods.length > 0
      ? [...task.namePeriods]
      : [fallbackNamePeriod(task)];
  return periods.sort(
    (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
  );
}

/** 最新一段，也就是“当前名字”。 */
export function currentNamePeriod(task: Task): NamePeriod {
  const periods = namePeriodsOf(task);
  return periods[periods.length - 1];
}

export function currentName(task: Task): string {
  return currentNamePeriod(task).name;
}

/** 闭区间判断：start ≤ date ≤ (end ?? +∞)。 */
export function isDateInNamePeriod(period: NamePeriod, date: string): boolean {
  return (
    date >= period.start && (period.end === null || date <= period.end)
  );
}

/**
 * 某一天显示的名字。日期落在段外时退回最近的段，
 * 保证今日页/挂件在异常数据下也有名字可显示。
 */
export function nameOn(task: Task, date: string): string {
  const periods = namePeriodsOf(task);
  for (const period of periods) {
    if (isDateInNamePeriod(period, date)) {
      return period.name;
    }
  }
  return date < periods[0].start
    ? periods[0].name
    : periods[periods.length - 1].name;
}
