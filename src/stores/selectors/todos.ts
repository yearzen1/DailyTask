import { endOfWeek, parseISO } from "date-fns";
import { useMemo } from "react";

import { diffDays, formatDate, logicalToday } from "../../domain/date";
import type { Todo } from "../../domain/types";
import { useSettingsStore } from "../settingsStore";
import { useTodosStore } from "../todosStore";

export type TodoGroupKey =
  | "overdue"
  | "today"
  | "thisWeek"
  | "later"
  | "done";

export interface TodoItem {
  todo: Todo;
  /** 逾期天数；非逾期为 0。 */
  overdueDays: number;
  /** 距离截止日的天数；仅未完成且 dueDate > today 时有值。 */
  daysLeft: number | null;
}

export interface TodoGroup {
  key: TodoGroupKey;
  items: TodoItem[];
}

export interface TodoGroupsData {
  today: string;
  groups: TodoGroup[];
  /** 未完成待办总数，用于标题计数。 */
  pendingCount: number;
}

const GROUP_ORDER: TodoGroupKey[] = [
  "overdue",
  "today",
  "thisWeek",
  "later",
  "done",
];

function byDueDate(a: TodoItem, b: TodoItem): number {
  const left = a.todo.dueDate;
  const right = b.todo.dueDate;
  if (left === right) {
    return a.todo.createdAt.localeCompare(b.todo.createdAt);
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

/**
 * 四分组 + 已完成（Requirements §4.4）：
 * 逾期 = 截止日 < 今天；今天 = 截止日 = 今天；
 * 本周 = 本周日及以前；其余（含无截止日）= 以后。
 */
export function buildTodoGroups(todos: Todo[], today: string): TodoGroupsData {
  const weekEnd = formatDate(
    endOfWeek(parseISO(today), { weekStartsOn: 1 }),
  );
  const buckets: Record<TodoGroupKey, TodoItem[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    done: [],
  };

  for (const todo of todos) {
    if (todo.done) {
      buckets.done.push({ todo, overdueDays: 0, daysLeft: null });
      continue;
    }
    if (!todo.dueDate) {
      buckets.later.push({ todo, overdueDays: 0, daysLeft: null });
      continue;
    }
    if (todo.dueDate < today) {
      buckets.overdue.push({
        todo,
        overdueDays: diffDays(today, todo.dueDate),
        daysLeft: null,
      });
    } else if (todo.dueDate === today) {
      buckets.today.push({ todo, overdueDays: 0, daysLeft: null });
    } else if (todo.dueDate <= weekEnd) {
      buckets.thisWeek.push({
        todo,
        overdueDays: 0,
        daysLeft: diffDays(todo.dueDate, today),
      });
    } else {
      buckets.later.push({
        todo,
        overdueDays: 0,
        daysLeft: diffDays(todo.dueDate, today),
      });
    }
  }

  buckets.overdue.sort(byDueDate);
  buckets.today.sort(byDueDate);
  buckets.thisWeek.sort(byDueDate);
  buckets.later.sort(byDueDate);
  buckets.done.sort(
    (a, b) =>
      (b.todo.completedAt ?? b.todo.updatedAt).localeCompare(
        a.todo.completedAt ?? a.todo.updatedAt,
      ),
  );

  return {
    today,
    groups: GROUP_ORDER.map((key) => ({ key, items: buckets[key] })),
    pendingCount: todos.filter((todo) => !todo.done).length,
  };
}

export function useTodoGroups(): TodoGroupsData {
  const todos = useTodosStore((state) => state.todos);
  const settings = useSettingsStore((state) => state.settings);

  return useMemo(
    () => buildTodoGroups(todos, logicalToday(new Date(), settings.dayStartHour)),
    [todos, settings.dayStartHour],
  );
}
