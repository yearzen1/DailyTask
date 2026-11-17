import { getSettings } from "../db/settings";
import type { SqlDatabase } from "../db/client";
import { listCheckins } from "../db/checkins";
import { listTaskTypes } from "../db/taskTypes";
import { listTasks } from "../db/tasks";
import { listTodos } from "../db/todos";
import type {
  Checkin,
  Settings,
  Task,
  TaskType,
  Todo,
} from "../domain/types";
import { getDb } from "../db/client";

export interface AppData {
  settings: Settings;
  tasks: Task[];
  taskTypes: TaskType[];
  checkins: Checkin[];
  todos: Todo[];
}

/**
 * 串行加载：settings 必须先到位，logicalToday 才知道 dayStartHour；
 * 其余按 tasks → taskTypes → checkins → todos 装载，全部就绪前不渲染业务视图。
 */
export async function loadAppData(db: SqlDatabase): Promise<AppData> {
  const settings = await getSettings(db);
  const tasks = await listTasks(db);
  const taskTypes = await listTaskTypes(db);
  const checkins = await listCheckins(db);
  const todos = await listTodos(db);
  return { settings, tasks, taskTypes, checkins, todos };
}

export async function initApp(): Promise<AppData> {
  return loadAppData(await getDb());
}
