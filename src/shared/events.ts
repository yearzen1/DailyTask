import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { CheckinStatus } from "../domain/types";

/**
 * 全项目唯一允许 import @tauri-apps/api/event 的文件。
 * payload 只做失效信号，监听方收到后自己重查。
 */
export const Events = {
  checkinsChanged: "checkins:changed",
  tasksChanged: "tasks:changed",
  taskTypesChanged: "task-types:changed",
  todosChanged: "todos:changed",
  settingsChanged: "settings:changed",
  widgetExpand: "widget:expand",
  widgetMenuAction: "widget:menu-action",
} as const;

export type EventSource = "main" | "widget";

export interface CheckinsChanged {
  date: string;
  source: EventSource;
}

export interface TasksChanged {
  source: EventSource;
}

export interface TaskTypesChanged {
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

/** 挂件菜单窗口点完一项后回传的动作；不是失效信号，但同样集中在这里收发。 */
export interface WidgetMenuAction {
  kind: "task" | "todo";
  id: string;
  action: "copy" | "status";
  status?: CheckinStatus | null;
  copied?: boolean;
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

export async function emitTaskTypesChanged(
  payload: TaskTypesChanged,
): Promise<void> {
  await emit(Events.taskTypesChanged, payload satisfies TaskTypesChanged);
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

export function onTaskTypesChanged(
  handler: (payload: TaskTypesChanged) => void,
): Promise<UnlistenFn> {
  return listen<TaskTypesChanged>(Events.taskTypesChanged, (event) => {
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

/** 挂件菜单在独立窗口里，点完一项由 Rust 转发到这里。 */
export function onWidgetMenuAction(
  handler: (payload: WidgetMenuAction) => void,
): Promise<UnlistenFn> {
  return listen<WidgetMenuAction>(Events.widgetMenuAction, (event) => {
    handler(event.payload);
  });
}
