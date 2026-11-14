/**
 * 领域实体：与数据库行结构解耦，字段命名遵 docs/reference/tasks-and-intervals.md。
 * 这里只放类型与默认值，不放任何 IO 或业务计算。
 */

export type TaskCategory = "voluntary" | "forced";
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
};
