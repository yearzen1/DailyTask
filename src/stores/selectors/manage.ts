import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import {
  DEFAULT_TASK_TYPES,
  flattenTypeTree,
  resolveTaskTypeId,
  resolveTaskTypes,
} from "../../domain/taskTypes";
import type { Task, TaskType } from "../../domain/types";
import { useDayNow } from "../dayStore";
import { useSettingsStore } from "../settingsStore";
import { useTaskTypesStore } from "../taskTypesStore";
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
  /** 叶子类型；旧数据回退到内置类型。 */
  type: TaskType;
  /** 从根到叶的完整路径，用于悬停显示与筛选。 */
  typePath: TaskType[];
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
export function buildManageRows(
  tasks: Task[],
  today: string,
  types: readonly TaskType[] = DEFAULT_TASK_TYPES,
): ManageRow[] {
  const tree = resolveTaskTypes(types);
  const pathById = new Map(
    flattenTypeTree(tree).map((node) => [node.type.id, node.path]),
  );
  const fallback = new Map(tree.map((type) => [type.id, type]));

  return [...tasks]
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .map((task) => {
      const typeId = resolveTaskTypeId(task);
      const path =
        pathById.get(typeId) ??
        pathById.get(task.category) ?? [fallback.get(task.category) as TaskType];
      const type = path[path.length - 1];
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
        type,
        typePath: path,
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
  const types = useTaskTypesStore((state) => state.types);
  const settings = useSettingsStore((state) => state.settings);
  const now = useDayNow();

  return useMemo(
    () => {
      const today = logicalToday(now, settings.dayStartHour);
      return { today, rows: buildManageRows(tasks, today, types) };
    },
    [tasks, types, settings.dayStartHour, now],
  );
}
