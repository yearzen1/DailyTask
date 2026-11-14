import { useMemo } from "react";

import { logicalToday } from "../../domain/date";
import {
  buildDateAxis,
  groupTasks,
  type DateAxis,
  type GridGroups,
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
  /** rowKey|date → 五态投影，渲染时直接查表；rowKey 可能是历史名称段。 */
  states: Map<string, CellState>;
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

  for (const group of [groups.voluntary, groups.forced, groups.disabled]) {
    for (const row of group) {
      for (const date of axis.dates) {
        const state = isDateInNamePeriod(row.namePeriod, date)
          ? projectCell(
              row.task,
              date,
              checkins.get(checkinKey(row.task.id, date)),
              settings,
              today,
            )
          : "none";
        states.set(checkinKey(row.key, date), state);
      }
    }
  }

  return { today, tasks, axis, groups, settings, checkins, states };
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
