import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  currentSource,
  emitCheckinsChanged,
  emitSettingsChanged,
  emitTaskTypesChanged,
  emitTasksChanged,
  emitTodosChanged,
  emitWidgetExpand,
  Events,
  onCheckinsChanged,
  type CheckinsChanged,
  type SettingsChanged,
  type TaskTypesChanged,
  type TasksChanged,
  type TodosChanged,
  type WidgetExpand,
} from "./events";

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    handler({ payload: { date: "2026-11-02", source: "widget" } });
    return () => undefined;
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "widget" }),
}));

describe("events", () => {
  beforeEach(() => {
    vi.mocked(emit).mockClear();
    vi.mocked(listen).mockClear();
  });

  it("emits the event name and typed payload", async () => {
    await emitCheckinsChanged({ date: "2026-11-02", source: "main" });

    expect(emit).toHaveBeenCalledWith(Events.checkinsChanged, {
      date: "2026-11-02",
      source: "main",
    });
  });

  it("forwards the payload to the listener", async () => {
    const handler = vi.fn();

    await onCheckinsChanged(handler);

    expect(listen).toHaveBeenCalledWith(
      Events.checkinsChanged,
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith({
      date: "2026-11-02",
      source: "widget",
    });
  });

  it("derives source from the current window label", () => {
    expect(currentSource()).toBe("widget");
    expect(getCurrentWindow().label).toBe("widget");
  });

  it("keeps one unique name per event", () => {
    const names = Object.values(Events);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      "checkins:changed",
      "tasks:changed",
      "task-types:changed",
      "todos:changed",
      "settings:changed",
      "widget:expand",
    ]);
  });

  it("emits every event with a source-only invalidation payload", async () => {
    await emitTasksChanged({ source: "main" });
    await emitTaskTypesChanged({ source: "widget" });
    await emitTodosChanged({ source: "widget" });
    await emitSettingsChanged({ source: "main" });
    await emitWidgetExpand({ source: "main" });

    expect(emit).toHaveBeenNthCalledWith(1, Events.tasksChanged, {
      source: "main",
    });
    expect(emit).toHaveBeenNthCalledWith(2, Events.taskTypesChanged, {
      source: "widget",
    });
    expect(emit).toHaveBeenNthCalledWith(3, Events.todosChanged, {
      source: "widget",
    });
    expect(emit).toHaveBeenNthCalledWith(4, Events.settingsChanged, {
      source: "main",
    });
    expect(emit).toHaveBeenNthCalledWith(5, Events.widgetExpand, {
      source: "main",
    });
  });

  it("keeps the payload contract at compile time", () => {
    expectTypeOf<CheckinsChanged>().toEqualTypeOf<{
      date: string;
      source: "main" | "widget";
    }>();
    expectTypeOf<TasksChanged>().toEqualTypeOf<{
      source: "main" | "widget";
    }>();
    expectTypeOf<TaskTypesChanged>().toEqualTypeOf<{
      source: "main" | "widget";
    }>();
    expectTypeOf<TodosChanged>().toEqualTypeOf<{
      source: "main" | "widget";
    }>();
    expectTypeOf<SettingsChanged>().toEqualTypeOf<{
      source: "main" | "widget";
    }>();
    expectTypeOf<WidgetExpand>().toEqualTypeOf<{
      source: "main" | "widget";
    }>();
  });
});
