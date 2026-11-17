import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCheckinsStore } from "../stores/checkinsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskTypesStore } from "../stores/taskTypesStore";
import { useTasksStore } from "../stores/tasksStore";
import { useTodosStore } from "../stores/todosStore";
import { startCrossWindowSync } from "./sync";

type Source = "main" | "widget";

const handlers = vi.hoisted(() => ({
  checkins: null as
    | ((payload: { date: string; source: Source }) => void)
    | null,
  tasks: null as ((payload: { source: Source }) => void) | null,
  taskTypes: null as ((payload: { source: Source }) => void) | null,
  todos: null as ((payload: { source: Source }) => void) | null,
  settings: null as ((payload: { source: Source }) => void) | null,
}));

const stops = vi.hoisted(() => ({
  checkins: vi.fn(),
  tasks: vi.fn(),
  taskTypes: vi.fn(),
  todos: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("../shared/events", () => ({
  currentSource: () => "main" as Source,
  onCheckinsChanged: async (
    handler: (payload: { date: string; source: Source }) => void,
  ) => {
    handlers.checkins = handler;
    return stops.checkins;
  },
  onTasksChanged: async (handler: (payload: { source: Source }) => void) => {
    handlers.tasks = handler;
    return stops.tasks;
  },
  onTaskTypesChanged: async (
    handler: (payload: { source: Source }) => void,
  ) => {
    handlers.taskTypes = handler;
    return stops.taskTypes;
  },
  onTodosChanged: async (handler: (payload: { source: Source }) => void) => {
    handlers.todos = handler;
    return stops.todos;
  },
  onSettingsChanged: async (handler: (payload: { source: Source }) => void) => {
    handlers.settings = handler;
    return stops.settings;
  },
}));

describe("startCrossWindowSync", () => {
  beforeEach(() => {
    handlers.checkins = null;
    handlers.tasks = null;
    handlers.taskTypes = null;
    handlers.todos = null;
    handlers.settings = null;
    stops.checkins.mockClear();
    stops.tasks.mockClear();
    stops.taskTypes.mockClear();
    stops.todos.mockClear();
    stops.settings.mockClear();
  });

  it("reloads on the other window's events and drops its own", async () => {
    const reloadCheckins = vi.fn(async () => undefined);
    const reloadTasks = vi.fn(async () => undefined);
    const reloadTaskTypes = vi.fn(async () => undefined);
    const reloadTodos = vi.fn(async () => undefined);
    const reloadSettings = vi.fn(async () => undefined);
    useCheckinsStore.setState({ reload: reloadCheckins });
    useTasksStore.setState({ reload: reloadTasks });
    useTaskTypesStore.setState({ reload: reloadTaskTypes });
    useTodosStore.setState({ reload: reloadTodos });
    useSettingsStore.setState({ reload: reloadSettings });

    const stop = await startCrossWindowSync();

    handlers.checkins?.({ date: "2026-11-02", source: "main" });
    handlers.tasks?.({ source: "main" });
    handlers.taskTypes?.({ source: "main" });
    handlers.todos?.({ source: "main" });
    handlers.settings?.({ source: "main" });
    expect(reloadCheckins).not.toHaveBeenCalled();
    expect(reloadTasks).not.toHaveBeenCalled();
    expect(reloadTaskTypes).not.toHaveBeenCalled();
    expect(reloadTodos).not.toHaveBeenCalled();
    expect(reloadSettings).not.toHaveBeenCalled();

    handlers.checkins?.({ date: "2026-11-02", source: "widget" });
    handlers.tasks?.({ source: "widget" });
    handlers.taskTypes?.({ source: "widget" });
    handlers.todos?.({ source: "widget" });
    handlers.settings?.({ source: "widget" });
    expect(reloadCheckins).toHaveBeenCalledTimes(1);
    expect(reloadTasks).toHaveBeenCalledTimes(1);
    expect(reloadTaskTypes).toHaveBeenCalledTimes(1);
    expect(reloadTodos).toHaveBeenCalledTimes(1);
    expect(reloadSettings).toHaveBeenCalledTimes(1);

    stop();
    expect(stops.checkins).toHaveBeenCalledTimes(1);
    expect(stops.tasks).toHaveBeenCalledTimes(1);
    expect(stops.taskTypes).toHaveBeenCalledTimes(1);
    expect(stops.todos).toHaveBeenCalledTimes(1);
    expect(stops.settings).toHaveBeenCalledTimes(1);
  });
});
