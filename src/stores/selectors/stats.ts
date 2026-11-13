import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import { completionRate30, taskStreak } from "../../domain/stats";
import type { Checkin, Settings, Task } from "../../domain/types";
import { useCheckinsStore } from "../checkinsStore";
import { useDayNow } from "../dayStore";
import { useSettingsStore } from "../settingsStore";
import { useTasksStore } from "../tasksStore";

export interface TaskStat {
  task: Task;
  /** 当前连续完成天数；skipped 不中断也不计数。 */
  streak: number;
  /** 近 30 天完成率（0–1），分母只含 done + missed。 */
  rate: number;
}

export interface StatsData {
  today: string;
  rows: TaskStat[];
}

/** 统计口径见 docs/reference/domain-functions.md：skipped 不进分母，也不中断 streak。 */
export function buildStats(
  tasks: Task[],
  checkins: Map<string, Checkin>,
  settings: Settings,
  now: Date,
): StatsData {
  const today = logicalToday(now, settings.dayStartHour);
  const rows = [...tasks]
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .map((task) => ({
      task,
      streak: taskStreak(task, checkins, today, settings),
      rate: completionRate30(task, checkins, today, settings),
    }));

  return { today, rows };
}

export function useStats(): StatsData {
  const tasks = useTasksStore((state) => state.tasks);
  const checkins = useCheckinsStore((state) => state.byKey);
  const settings = useSettingsStore((state) => state.settings);
  const now = useDayNow();

  return useMemo(
    () => buildStats(tasks, checkins, settings, now),
    [tasks, checkins, settings, now],
  );
}
