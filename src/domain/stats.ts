import { isApplicable } from "./applicability";
import { addDays } from "./date";
import { checkinKey } from "./keys";
import { projectCell } from "./settle";
import type { Checkin, Settings, Task } from "./types";

const MAX_LOOKBACK_DAYS = 3660;
const STATS_WINDOW = 30;

/** 统计窗口（闭区间）；用于把统计限制在一个名称段内。 */
export interface DateRange {
  start: string;
  end: string;
}

function earliestStart(task: Task): string | null {
  let earliest: string | null = null;
  for (const interval of task.intervals) {
    if (earliest === null || interval.start < earliest) {
      earliest = interval.start;
    }
  }
  return earliest;
}

/**
 * 当前连续完成天数。skipped 与 pending（含关闭自动结算后的过去空白）
 * 不中断也不计数；missed 立即中断。
 * range 用于名称分段：旧段以段结束日为终点，且不越过段起点。
 */
export function taskStreak(
  task: Task,
  checkins: Map<string, Checkin>,
  today: string,
  settings: Settings,
  range?: DateRange,
): number {
  const earliest = earliestStart(task);
  if (earliest === null) {
    return 0;
  }

  const from =
    range && range.start > earliest ? range.start : earliest;
  let date =
    range && range.end < today ? range.end : today;
  let streak = 0;
  for (let i = 0; i < MAX_LOOKBACK_DAYS && date >= from; i += 1) {
    if (isApplicable(task.intervals, date)) {
      const state = projectCell(
        task,
        date,
        checkins.get(checkinKey(task.id, date)),
        settings,
        today,
      );
      if (state === "done") {
        streak += 1;
      } else if (state === "missed") {
        break;
      }
    }
    date = addDays(date, -1);
  }
  return streak;
}

/**
 * 近 30 天完成率：分母只含 done + missed。
 * skipped、pending 与不适用日期都不进分母。
 * range 用于名称分段：窗口以段结束日为终点，且不越过段起点。
 */
export function completionRate30(
  task: Task,
  checkins: Map<string, Checkin>,
  today: string,
  settings: Settings,
  range?: DateRange,
): number {
  let done = 0;
  let missed = 0;
  const anchor = range && range.end < today ? range.end : today;

  for (let i = 0; i < STATS_WINDOW; i += 1) {
    const date = addDays(anchor, -i);
    if (range && date < range.start) {
      break;
    }
    if (!isApplicable(task.intervals, date)) {
      continue;
    }
    const state = projectCell(
      task,
      date,
      checkins.get(checkinKey(task.id, date)),
      settings,
      today,
    );
    if (state === "done") {
      done += 1;
    } else if (state === "missed") {
      missed += 1;
    }
  }

  const denominator = done + missed;
  return denominator === 0 ? 0 : done / denominator;
}
