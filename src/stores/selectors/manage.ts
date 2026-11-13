import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import type { Task } from "../../domain/types";
import { useDayNow } from "../dayStore";
import { useSettingsStore } from "../settingsStore";
import { useTasksStore } from "../tasksStore";

export type ManageStatus =
  | "active"
  | "scheduled"
  | "endingToday"
  | "endingLater"
  | "disabled";

export interface ManageRow {
  task: Task;
  status: ManageStatus;
  /** 最新一段区间的起止日期。 */
  start: string;
  end: string | null;
  /** 最新一段区间的间隔天数；1 = 每天。 */
  everyDays: number;
  /** 是否还有未结束（end = null）的区间；决定操作列给「停用」还是「重新启用」。 */
  hasOpen: boolean;
  intervalCount: number;
}

/**
 * 任务管理表（Requirements §4.5）：一行一个任务，显示最新区间的起止；
 * 多段区间只展示最后一段，用「N 段」提示历史段仍保留。
 */
export function buildManageRows(tasks: Task[], today: string): ManageRow[] {
  return [...tasks]
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .map((task) => {
      const sorted = [...task.intervals].sort((a, b) =>
        a.start.localeCompare(b.start),
      );
      const latest = sorted[sorted.length - 1] ?? null;
      const hasOpen = task.intervals.some((interval) => interval.end === null);
      const end = latest?.end ?? null;

      let status: ManageStatus;
      if (!latest) {
        status = "disabled";
      } else if (!hasOpen) {
        // 停用日期含当天：end === today 表示今天仍生效、明天起停用。
        if (end === null) {
          status = "disabled";
        } else if (end < today) {
          status = "disabled";
        } else if (end === today) {
          status = "endingToday";
        } else {
          status = "endingLater";
        }
      } else if (latest.start > today) {
        status = "scheduled";
      } else {
        status = "active";
      }

      return {
        task,
        status,
        start: latest?.start ?? "",
        end,
        everyDays: latest?.everyDays ?? 1,
        hasOpen,
        intervalCount: task.intervals.length,
      };
    });
}

export function useManageRows(): { today: string; rows: ManageRow[] } {
  const tasks = useTasksStore((state) => state.tasks);
  const settings = useSettingsStore((state) => state.settings);
  const now = useDayNow();

  return useMemo(
    () => {
      const today = logicalToday(now, settings.dayStartHour);
      return { today, rows: buildManageRows(tasks, today) };
    },
    [tasks, settings.dayStartHour, now],
  );
}
