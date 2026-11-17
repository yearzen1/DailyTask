/**
 * 领域实体：与数据库行结构解耦，字段命名遵 docs/reference/tasks-and-intervals.md。
 * 这里只放类型与默认值，不放任何 IO 或业务计算。
 */

import { DEFAULT_MANAGE_COLUMN_WIDTHS } from "./manageColumns";

export type TaskCategory = "voluntary" | "forced";

/** 类型调色板 key；内置类型缺省用绿 / 蓝灰。 */
export type TaskTypeColor =
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "red"
  | "teal"
  | "pink"
  | "gray";

/**
 * 任务类型：可嵌套的树。内置「自愿 / 被迫」id 固定为 voluntary / forced，
 * name 为 null 时显示跟随界面语言。
 */
export interface TaskType {
  id: string;
  name: string | null;
  parentId: string | null;
  /** 同级排序，只在同一 parent 下比较。 */
  order: number;
  systemKey: TaskCategory | null;
  color: TaskTypeColor | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 打卡状态只有三种判定；值（value）是独立附加字段。
 * 没有判定时写值会自动记为 done。
 */
export type CheckinStatus = "done" | "missed" | "skipped";
export type CellState = CheckinStatus | "pending" | "none";
export type Theme = "light" | "dark" | "system";
export type Language = "system" | "zh-CN" | "en";
export type ResolvedLanguage = "zh-CN" | "en";

/** 启用区间；end 为 null 表示至今有效。 */
export interface Interval {
  id: string;
  taskId: string;
  start: string;
  end: string | null;
  /** 每 N 天一次；1 = 每天。以 start 为第 1 天，缺省按 1 处理。 */
  everyDays?: number;
}

/** 名称段：任务名在某段时间内的取值；end 为 null 表示至今有效。 */
export interface NamePeriod {
  id: string;
  taskId: string;
  name: string;
  start: string;
  end: string | null;
}

export interface Task {
  id: string;
  /** 当前名字；有 namePeriods 时以最新名称段为准。 */
  name: string;
  /** 所属类型 id；缺省（旧测试数据）时回退 category。 */
  typeId?: string;
  /** 类型根节点缓存：voluntary / forced。只用于兼容旧数据。 */
  category: TaskCategory;
  intervals: Interval[];
  /**
   * 名称历史。缺省（旧测试数据）按 task.name 生成一段覆盖全历史。
   * 顺序不保证，使用方通过 domain/names 读取。
   */
  namePeriods?: NamePeriod[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Checkin {
  id: string;
  taskId: string;
  date: string;
  status: CheckinStatus;
  /** 自由值：次数 / 时长 / 任意文本。只附加在判定上；没有判定时写值会记为 done。 */
  value: string | null;
  note: string | null;
  updatedAt: string;
}

export interface Todo {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: Theme;
  language: Language;
  gridZoom: number;
  autoSettleMissed: boolean;
  dayStartHour: number;
  alwaysOnTop: boolean;
  autoLaunch: boolean;
  /** 侧边栏顺序；空数组表示使用默认顺序。 */
  navOrder: string[];
  /** 任务管理列宽，6 个百分比，和 100。 */
  manageColumnWidths: number[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "system",
  gridZoom: 32,
  autoSettleMissed: true,
  dayStartHour: 4,
  alwaysOnTop: true,
  autoLaunch: false,
  navOrder: [],
  manageColumnWidths: [...DEFAULT_MANAGE_COLUMN_WIDTHS],
};
