import { isApplicable } from "./applicability";
import { addDays, diffDays, range } from "./date";
import { namePeriodsOf } from "./names";
import {
  DEFAULT_TASK_TYPES,
  descendantTypeIds,
  flattenTypeTree,
  resolveTaskTypeId,
  resolveTaskTypes,
  sortedTasksByType,
} from "./taskTypes";
import type { NamePeriod, Task, TaskType } from "./types";

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
  /** 兼容旧视图 / 旧测试：两个内置根类型下的全部行。 */
  voluntary: GridRow[];
  forced: GridRow[];
  disabled: GridRow[];
  /** 类型树展开顺序；父组折叠由 UI 处理。 */
  typeGroups: GridTypeGroup[];
}

export interface GridTypeGroup {
  /** 类型 id；已停用组固定为 `disabled`。 */
  key: string;
  type: TaskType | null;
  depth: number;
  path: TaskType[];
  /** 直属任务行；子类型行在后续 group 里。 */
  rows: GridRow[];
  /** 整棵子树的任务数（已停用组为停用任务数）。 */
  count: number;
  disabled: boolean;
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

export function groupTasks(
  tasks: Task[],
  today: string,
  types: readonly TaskType[] = DEFAULT_TASK_TYPES,
): GridGroups {
  const tree = resolveTaskTypes(types);
  const flat = flattenTypeTree(tree);
  const known = new Set(flat.map((node) => node.type.id));
  const sorted = sortedTasksByType(tasks, tree);
  const directRows = new Map<string, GridRow[]>();
  const activeGroup = new Map<string, string>();
  const disabled: GridRow[] = [];

  for (const task of sorted) {
    const retired = isRetired(task, today);
    const rawId = resolveTaskTypeId(task);
    const groupId = known.has(rawId) ? rawId : task.category;
    if (!retired) {
      activeGroup.set(task.id, groupId);
    }

    // 当前名称段在最上面，历史段按时间倒序紧随其后。
    const periods = namePeriodsOf(task);
    const ordered = [
      periods[periods.length - 1],
      ...periods.slice(0, -1).reverse(),
    ];
    const rows = ordered.map((period, index) => {
      const current = index === 0;
      return {
        key: current ? task.id : `${task.id}~${period.id}`,
        task,
        namePeriod: period,
        name: period.name,
        current,
        disabled: retired,
      };
    });

    if (retired) {
      disabled.push(...rows);
      continue;
    }
    const list = directRows.get(groupId);
    if (list) {
      list.push(...rows);
    } else {
      directRows.set(groupId, rows);
    }
  }

  const typeGroups: GridTypeGroup[] = [];
  for (const node of flat) {
    const subtree = descendantTypeIds(tree, node.type.id);
    let count = 0;
    for (const groupId of activeGroup.values()) {
      if (subtree.has(groupId)) {
        count += 1;
      }
    }
    if (count === 0) {
      continue;
    }
    typeGroups.push({
      key: node.type.id,
      type: node.type,
      depth: node.depth,
      path: node.path,
      rows: directRows.get(node.type.id) ?? [],
      count,
      disabled: false,
    });
  }

  const voluntary: GridRow[] = [];
  const forced: GridRow[] = [];
  for (const group of typeGroups) {
    if (group.path[0]?.systemKey === "forced") {
      forced.push(...group.rows);
    } else {
      voluntary.push(...group.rows);
    }
  }

  typeGroups.push({
    key: "disabled",
    type: null,
    depth: 0,
    path: [],
    rows: disabled,
    count: new Set(disabled.map((row) => row.task.id)).size,
    disabled: true,
  });

  return { voluntary, forced, disabled, typeGroups };
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
