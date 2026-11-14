import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import {
  buildDateAxis,
  groupTasks,
  type DateAxis,
  type GridGroups,
  type GridRow,
} from "../../domain/grid";
import { checkinKey } from "../../domain/keys";
import { isDateInNamePeriod } from "../../domain/names";
import { projectCell, type CellState } from "../../domain/settle";
import type { Checkin, Settings, Task } from "../../domain/types";
import { useCheckinsStore } from "../checkinsStore";
import { useDayNow } from "../dayStore";
import { useSettingsStore } from "../settingsStore";
import { useTasksStore } from "../tasksStore";

export interface GridData {
  today: string;
  tasks: Task[];
  axis: DateAxis;
  groups: GridGroups;
  settings: Settings;
  checkins: Map<string, Checkin>;
  /**
   * rowKey|date → 五态投影缓存。只有真正渲染到的格子才写入，
   * 挂载时不再做「行 × 全轴」的一次性投影。
   */
  states: Map<string, CellState>;
  /** 按需投影：命中缓存直接返回，未命中算一次并写回。 */
  cellState: (row: GridRow, date: string) => CellState;
}

export function buildGridData(
  tasks: Task[],
  checkins: Map<string, Checkin>,
  settings: Settings,
  now: Date,
): GridData {
  const today = logicalToday(now, settings.dayStartHour);
  const axis = buildDateAxis(tasks, today);
  const groups = groupTasks(tasks, today);
  const states = new Map<string, CellState>();

  const cellState = (row: GridRow, date: string): CellState => {
    const key = checkinKey(row.key, date);
    const cached = states.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const state = isDateInNamePeriod(row.namePeriod, date)
      ? projectCell(
          row.task,
          date,
          checkins.get(checkinKey(row.task.id, date)),
          settings,
          today,
        )
      : "none";
    states.set(key, state);
    return state;
  };

  return {
    today,
    tasks,
    axis,
    groups,
    settings,
    checkins,
    states,
    cellState,
  };
}

export function useGridData(): GridData {
  const tasks = useTasksStore((state) => state.tasks);
  const checkins = useCheckinsStore((state) => state.byKey);
  const settings = useSettingsStore((state) => state.settings);
  const now = useDayNow();

  return useMemo(
    () => buildGridData(tasks, checkins, settings, now),
    [tasks, checkins, settings, now],
  );
}
