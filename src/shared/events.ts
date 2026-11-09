import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 全项目唯一允许 import @tauri-apps/api/event 的文件。
 * payload 只做失效信号，监听方收到后自己重查。
 */
export const Events = {
  checkinsChanged: "checkins:changed",
  tasksChanged: "tasks:changed",
  todosChanged: "todos:changed",
  settingsChanged: "settings:changed",
  widgetExpand: "widget:expand",
} as const;

export type EventSource = "main" | "widget";

export interface CheckinsChanged {
  date: string;
  source: EventSource;
}

export interface TasksChanged {
  source: EventSource;
}

export interface TodosChanged {
  source: EventSource;
}

export interface SettingsChanged {
  source: EventSource;
}

export interface WidgetExpand {
  source: EventSource;
}

export function currentSource(): EventSource {
  return getCurrentWindow().label === "widget" ? "widget" : "main";
}

export async function emitCheckinsChanged(
  payload: CheckinsChanged,
): Promise<void> {
  await emit(Events.checkinsChanged, payload satisfies CheckinsChanged);
}

export async function emitTasksChanged(payload: TasksChanged): Promise<void> {
  await emit(Events.tasksChanged, payload satisfies TasksChanged);
}

export async function emitTodosChanged(payload: TodosChanged): Promise<void> {
  await emit(Events.todosChanged, payload satisfies TodosChanged);
}

export async function emitSettingsChanged(
  payload: SettingsChanged,
): Promise<void> {
  await emit(Events.settingsChanged, payload satisfies SettingsChanged);
}

export async function emitWidgetExpand(payload: WidgetExpand): Promise<void> {
  await emit(Events.widgetExpand, payload satisfies WidgetExpand);
}

export function onCheckinsChanged(
  handler: (payload: CheckinsChanged) => void,
): Promise<UnlistenFn> {
  return listen<CheckinsChanged>(Events.checkinsChanged, (event) => {
    handler(event.payload);
  });
}

export function onTasksChanged(
  handler: (payload: TasksChanged) => void,
): Promise<UnlistenFn> {
  return listen<TasksChanged>(Events.tasksChanged, (event) => {
    handler(event.payload);
  });
}

export function onTodosChanged(
  handler: (payload: TodosChanged) => void,
): Promise<UnlistenFn> {
  return listen<TodosChanged>(Events.todosChanged, (event) => {
    handler(event.payload);
  });
}

export function onSettingsChanged(
  handler: (payload: SettingsChanged) => void,
): Promise<UnlistenFn> {
  return listen<SettingsChanged>(Events.settingsChanged, (event) => {
    handler(event.payload);
  });
}

export function onWidgetExpand(
  handler: (payload: WidgetExpand) => void,
): Promise<UnlistenFn> {
  return listen<WidgetExpand>(Events.widgetExpand, (event) => {
    handler(event.payload);
  });
}
