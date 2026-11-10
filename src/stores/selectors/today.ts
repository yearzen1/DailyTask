import { format, parseISO } from "date-fns";
import { useMemo } from "react";

import { dateLocale } from "../../shared/i18n";

import {
  applicableTasks,
  currentInterval,
} from "../../domain/applicability";
import { diffDays, logicalToday } from "../../domain/date";
import { checkinKey } from "../../domain/keys";
import {
  combineProgress,
  dayProgress,
  projectCell,
  type CellState,
  type DayProgress,
} from "../../domain/settle";
import type { Checkin, Settings, Task, Todo } from "../../domain/types";
import { useCheckinsStore } from "../checkinsStore";
import { useSettingsStore } from "../settingsStore";
import { useTasksStore } from "../tasksStore";
import { useTodosStore } from "../todosStore";

export interface TodayTask {
  task: Task;
  state: CellState;
  /** 当天的自由值（次数 / 时长 / 文本），只展示不判定。 */
  value: string | null;
  /** 当前区间截止日距今天的天数；null = 无截止日期。0 = 今天截止。 */
  deadlineDays: number | null;
}

export interface CategoryStat {
  done: number;
  total: number;
}

export interface DueTodoItem {
  todo: Todo;
  overdueDays: number;
}

export interface TodayData {
  today: string;
  dateLabel: string;
  voluntary: TodayTask[];
  forced: TodayTask[];
  progress: DayProgress;
  voluntaryStat: CategoryStat;
  forcedStat: CategoryStat;
  todoStat: CategoryStat;
  overdueTodos: DueTodoItem[];
  todayTodos: DueTodoItem[];
  dueTodos: DueTodoItem[];
}

function statOf(rows: TodayTask[]): CategoryStat {
  const countable = rows.filter((row) => row.state !== "skipped");
  return {
    done: countable.filter((row) => row.state === "done").length,
    total: countable.length,
  };
}

/** 今日到期待办：逾期在前；当天完成的保留，次日自动移除。 */
export function dueTodosFor(
  todos: Todo[],
  today: string,
  settings: Settings,
): DueTodoItem[] {
  return todos
    .filter((todo) => {
      if (todo.dueDate === null || todo.dueDate > today) {
        return false;
      }
      if (!todo.done) {
        return true;
      }
      return (
        todo.completedAt !== null &&
        logicalToday(new Date(todo.completedAt), settings.dayStartHour) === today
      );
    })
    .map((todo) => ({
      todo,
      overdueDays: diffDays(today, todo.dueDate as string),
    }))
    .sort((a, b) =>
      (a.todo.dueDate as string).localeCompare(b.todo.dueDate as string),
    );
}

/** 待办分母按列表行数算，当天完成保留的行也计入。 */
export function todoStatOf(items: DueTodoItem[]): CategoryStat {
  return {
    done: items.filter((item) => item.todo.done).length,
    total: items.length,
  };
}

export function buildToday(
  tasks: Task[],
  checkins: Map<string, Checkin>,
  settings: Settings,
  todos: Todo[],
  now: Date,
): TodayData {
  const today = logicalToday(now, settings.dayStartHour);
  const rows: TodayTask[] = applicableTasks(tasks, today)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .map((task) => {
      const checkin = checkins.get(checkinKey(task.id, today));
      const interval = currentInterval(task.intervals, today);
      return {
        task,
        state: projectCell(task, today, checkin, settings, today),
        value: checkin?.value ?? null,
        deadlineDays:
          interval?.end == null ? null : diffDays(interval.end, today),
      };
    });

  const voluntary = rows.filter((row) => row.task.category === "voluntary");
  const forced = rows.filter((row) => row.task.category === "forced");

  // 当天完成的待办保留在列表里（打勾不消失），次日自动移除。
  const dueTodos = dueTodosFor(todos, today, settings);
  const todoStat = todoStatOf(dueTodos);

  return {
    today,
    dateLabel: format(parseISO(today), "MM/dd EEEE", {
      locale: dateLocale(settings.language),
    }),
    voluntary,
    forced,
    progress: combineProgress(
      dayProgress(tasks, checkins, today, settings, today),
      todoStat,
    ),
    voluntaryStat: statOf(voluntary),
    forcedStat: statOf(forced),
    todoStat,
    overdueTodos: dueTodos.filter((item) => item.overdueDays > 0),
    todayTodos: dueTodos.filter((item) => item.overdueDays === 0),
    dueTodos,
  };
}

export function useTodayData(): TodayData {
  const tasks = useTasksStore((state) => state.tasks);
  const checkins = useCheckinsStore((state) => state.byKey);
  const settings = useSettingsStore((state) => state.settings);
  const todos = useTodosStore((state) => state.todos);

  return useMemo(
    () => buildToday(tasks, checkins, settings, todos, new Date()),
    [tasks, checkins, settings, todos],
  );
}
