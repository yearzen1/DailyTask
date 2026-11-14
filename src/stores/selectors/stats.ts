import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import { namePeriodsOf } from "../../domain/names";
import { completionRate30, taskStreak } from "../../domain/stats";
import type {
  Checkin,
  NamePeriod,
  Settings,
  Task,
} from "../../domain/types";
import { useCheckinsStore } from "../checkinsStore";
import { useDayNow } from "../dayStore";
import { useSettingsStore } from "../settingsStore";
import { useTasksStore } from "../tasksStore";

export interface TaskStat {
  /** 名称段标识；当前段复用 task.id，历史段为 task.id~period.id。 */
  key: string;
  task: Task;
  namePeriod: NamePeriod;
  /** 该段显示的名字。 */
  name: string;
  /** 是否为当前（最新）名称段。 */
  current: boolean;
  /** 该名称段的连续完成天数；skipped 不中断也不计数。 */
  streak: number;
  /** 该名称段的近 30 天完成率（0–1），分母只含 done + missed。 */
  rate: number;
}

export interface StatsData {
  today: string;
  rows: TaskStat[];
}

/**
 * 统计口径见 docs/reference/domain-functions.md：
 * skipped 不进分母，也不中断 streak；每个名称段独立统计，
 * 旧段以段结束日为终点。
 */
export function buildStats(
  tasks: Task[],
  checkins: Map<string, Checkin>,
  settings: Settings,
  now: Date,
): StatsData {
  const today = logicalToday(now, settings.dayStartHour);
  const rows = [...tasks]
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .flatMap((task) => {
      const periods = namePeriodsOf(task);
      const ordered = [
        periods[periods.length - 1],
        ...periods.slice(0, -1).reverse(),
      ];
      return ordered.map((period, index) => {
        const current = index === 0;
        const range = {
          start: period.start,
          end: period.end ?? today,
        };
        return {
          key: current ? task.id : `${task.id}~${period.id}`,
          task,
          namePeriod: period,
          name: period.name,
          current,
          streak: taskStreak(task, checkins, today, settings, range),
          rate: completionRate30(task, checkins, today, settings, range),
        };
      });
    });

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
