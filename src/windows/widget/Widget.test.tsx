import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkinKey } from "../../domain/keys";
import {
  DEFAULT_SETTINGS,
  type Checkin,
  type CheckinStatus,
  type Settings,
  type Task,
  type TaskType,
  type Todo,
} from "../../domain/types";
import { useCheckinsStore } from "../../stores/checkinsStore";
import { useDayStore } from "../../stores/dayStore";
import { emitWidgetExpand } from "../../shared/events";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskTypesStore } from "../../stores/taskTypesStore";
import { useTasksStore } from "../../stores/tasksStore";
import { useTodosStore } from "../../stores/todosStore";
import { CAPSULE_SIDE_KEY, CAPSULE_STORAGE_KEY } from "./capsule";
import { Widget } from "./Widget";

const windowApi = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  outerPosition: vi.fn(async () => ({ x: 1480, y: 300 })),
  outerSize: vi.fn(async () => ({ width: 520, height: 720 })),
  setSize: vi.fn(async (size: { width: number; height: number }) => {
    void size;
  }),
  setPosition: vi.fn(async (position: { x: number; y: number }) => {
    void position;
  }),
}));

const menuApi = vi.hoisted(() => {
  const popup = vi.fn(async () => undefined);
  return {
    popup,
    itemNew: vi.fn(async (options: unknown) => options),
    menuNew: vi.fn(async (options: { items: unknown[] }) => ({
      options,
      popup,
    })),
  };
});

const invokeMock = vi.hoisted(() => vi.fn(async () => undefined));

const menuActionApi = vi.hoisted(() => ({
  handler: null as null | ((action: unknown) => void),
  unlisten: vi.fn(),
}));

const monitorApi = vi.hoisted(() => ({
  currentMonitor: vi.fn(async () => ({
    size: { width: 1920, height: 1080 },
    position: { x: 0, y: 0 },
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1040 },
    },
    scaleFactor: 2,
  })),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowApi,
  currentMonitor: monitorApi.currentMonitor,
  PhysicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

vi.mock("@tauri-apps/api/menu", () => ({
  MenuItem: { new: menuApi.itemNew },
  Menu: { new: menuApi.menuNew },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("../../shared/events", () => ({
  emitWidgetExpand: vi.fn(async () => undefined),
  onWidgetMenuAction: vi.fn(
    async (handler: (action: unknown) => void) => {
      menuActionApi.handler = handler;
      return menuActionApi.unlisten;
    },
  ),
}));

const NOW = new Date(2026, 10, 2, 9, 0, 0);
const TODAY = "2026-11-02";
const originalSetStatus = useCheckinsStore.getState().setStatus;
const originalSetValue = useCheckinsStore.getState().setValue;
const originalSetDone = useTodosStore.getState().setDone;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function task(
  id: string,
  name: string,
  category: "voluntary" | "forced",
  order: number,
): Task {
  return {
    id,
    name,
    category,
    intervals: [{ id: `i-${id}`, taskId: id, start: "2026-11-01", end: null }],
    order,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function checkin(id: string, status: CheckinStatus): Checkin {
  return {
    id: `c-${id}`,
    taskId: id,
    date: TODAY,
    status,
    value: null,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function todo(id: string, dueDate: string): Todo {
  return {
    id,
    title: id,
    dueDate,
    done: false,
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function seedStores() {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  useTaskTypesStore.setState({ types: [] });
  useTasksStore.setState({
    tasks: [
      task("t1", "跑步", "voluntary", 0),
      task("t2", "开会", "forced", 1),
      task("t3", "背单词", "voluntary", 2),
      task("t4", "交周报", "forced", 3),
    ],
  });
  useCheckinsStore.setState({
    byKey: new Map([
      [checkinKey("t2", TODAY), checkin("t2", "done")],
      [checkinKey("t3", TODAY), checkin("t3", "skipped")],
      [checkinKey("t4", TODAY), checkin("t4", "missed")],
    ]),
  });
  useTodosStore.setState({
    todos: [todo("交房租", "2026-10-31"), todo("买猫粮", TODAY)],
  });
}

describe("Widget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(emitWidgetExpand).mockClear();
    windowApi.setAlwaysOnTop.mockClear();
    windowApi.hide.mockClear();
    windowApi.outerPosition.mockClear();
    windowApi.outerSize.mockClear();
    windowApi.setSize.mockClear();
    windowApi.setPosition.mockClear();
    monitorApi.currentMonitor.mockClear();
    menuApi.popup.mockClear();
    menuApi.itemNew.mockClear();
    menuApi.menuNew.mockClear();
    invokeMock.mockClear();
    menuActionApi.handler = null;
    menuActionApi.unlisten.mockClear();
    localStorage.removeItem(CAPSULE_STORAGE_KEY);
    localStorage.removeItem(CAPSULE_SIDE_KEY);
    useDayStore.setState({ now: null });
    seedStores();
  });

  afterEach(() => {
    vi.useRealTimers();
    useCheckinsStore.setState({ setStatus: originalSetStatus });
    useCheckinsStore.setState({ setValue: originalSetValue });
    useTodosStore.setState({ setDone: originalSetDone });
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it("renders the full today content: progress, groups, all tasks and todos", () => {
    render(<Widget />);

    expect(screen.getByText(/今日 · 11\/02/)).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText(/还剩 3 项/)).toBeInTheDocument();

    // 两个分组与组内计数。
    expect(screen.getByText("自愿")).toBeInTheDocument();
    expect(screen.getByText("被迫")).toBeInTheDocument();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    // 待办计入总完成率，并在汇总区和组头显示 x/n。
    expect(screen.getByText(/待办 0 \/ 2/)).toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "切换 跑步 状态" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "切换 交周报 状态" }),
    ).toBeInTheDocument();
    // 已跳过 / 已完成的行照样显示，也都能点击切换。
    expect(screen.getByText("背单词")).toBeInTheDocument();
    expect(screen.getByText("开会")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "切换 背单词 状态" }),
    ).toBeInTheDocument();

    expect(screen.getByText("今日到期待办")).toBeInTheDocument();
    expect(screen.getByText("交房租")).toBeInTheDocument();
    expect(screen.getByText("逾期 2 天")).toBeInTheDocument();
    expect(screen.getByText("买猫粮")).toBeInTheDocument();
    expect(screen.getByText("今天")).toBeInTheDocument();
  });

  it("rolls over to the next day without any click", () => {
    render(<Widget />);
    expect(screen.getByText(/今日 · 11\/02/)).toBeInTheDocument();
    expect(screen.getByText("买猫粮")).toBeInTheDocument();

    act(() => {
      useDayStore
        .getState()
        .sync(new Date(2026, 10, 3, 9, 0, 0), DEFAULT_SETTINGS.dayStartHour);
    });

    expect(screen.getByText(/今日 · 11\/03/)).toBeInTheDocument();
    expect(screen.getByText("逾期 1 天")).toBeInTheDocument();
  });

  it("does not render task deadlines in the widget", () => {
    useTasksStore.setState({
      tasks: [
        {
          ...task("t1", "跑步", "voluntary", 0),
          intervals: [
            { id: "i1", taskId: "t1", start: "2026-11-01", end: "2026-11-05" },
          ],
        },
        {
          ...task("t2", "最后一天", "forced", 1),
          intervals: [
            { id: "i2", taskId: "t2", start: "2026-11-01", end: TODAY },
          ],
        },
        task("t3", "一直有效", "voluntary", 2),
      ],
    });

    const { container } = render(<Widget />);

    expect(screen.queryByText(/还差/)).not.toBeInTheDocument();
    expect(screen.queryByText("今天截止")).not.toBeInTheDocument();
    expect(container.querySelector("[data-deadline-days]")).not.toBeInTheDocument();
  });

  it("renders every task and todo without the old 4/2 caps", () => {
    useTasksStore.setState({
      tasks: [
        task("a1", "任务 1", "voluntary", 0),
        task("a2", "任务 2", "voluntary", 1),
        task("a3", "任务 3", "voluntary", 2),
        task("a4", "任务 4", "forced", 3),
        task("a5", "任务 5", "forced", 4),
        task("a6", "任务 6", "forced", 5),
      ],
    });
    useCheckinsStore.setState({ byKey: new Map() });
    useTodosStore.setState({
      todos: [
        todo("待办 1", "2026-10-30"),
        todo("待办 2", "2026-10-31"),
        todo("待办 3", TODAY),
        todo("待办 4", TODAY),
      ],
    });

    render(<Widget />);

    for (const name of ["任务 1", "任务 2", "任务 3", "任务 4", "任务 5", "任务 6"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    for (const name of ["待办 1", "待办 2", "待办 3", "待办 4"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText("0 / 4")).toBeInTheDocument();
    expect(screen.queryByText(/还有 \d+ 项/)).not.toBeInTheDocument();

    // 全部内容都挂在同一个滚动容器里。
    const scroller = document.querySelector("[data-widget-scroll]");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toContain("overflow-y-auto");
  });

  it("wraps long task names and hands the full name to the menu window", async () => {
    const longName = "这是一个非常长的任务名称用于验证挂件换行显示";
    useTasksStore.setState({
      tasks: [task("t1", longName, "voluntary", 0)],
    });
    useCheckinsStore.setState({ byKey: new Map() });

    render(<Widget />);

    const name = screen.getByText(longName);
    expect(name).toHaveClass("wrap-anywhere");
    expect(name).not.toHaveClass("truncate");

    const row = name.closest('[role="button"]') as HTMLElement;
    expect(row).toHaveClass("min-h-[26px]");
    expect(row).not.toHaveClass("h-[26px]");

    await act(async () => {
      fireEvent.contextMenu(
        screen.getByRole("button", { name: `切换 ${longName} 状态` }),
      );
    });

    expect(invokeMock).toHaveBeenCalledWith("open_widget_menu", {
      payload: expect.objectContaining({
        kind: "task",
        id: "t1",
        name: longName,
      }),
    });
  });

  it("collapses the three sections from their headers", () => {
    render(<Widget />);

    const voluntary = screen.getByRole("button", { name: "折叠自愿" });
    expect(voluntary).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(voluntary);
    expect(voluntary).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("跑步")).not.toBeInTheDocument();
    expect(screen.getByText("开会")).toBeInTheDocument();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();

    const todos = screen.getByRole("button", { name: "折叠今日到期待办" });
    expect(todos).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("[data-todo-bar]")).not.toBeNull();
    fireEvent.click(todos);
    expect(todos).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("交房租")).not.toBeInTheDocument();
    expect(screen.queryByText("买猫粮")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    // 折叠后仍保留黄色竖条。
    expect(document.querySelector("[data-todo-bar]")).not.toBeNull();
  });

  it("collapses a parent type and hides its child type", () => {
    const types: TaskType[] = [
      {
        id: "health",
        name: "健康",
        parentId: "voluntary",
        order: 0,
        systemKey: null,
        color: null,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "run",
        name: "跑步",
        parentId: "health",
        order: 0,
        systemKey: null,
        color: null,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ];
    useTaskTypesStore.setState({ types });
    useTasksStore.setState({
      tasks: [
        { ...task("p1", "体检", "voluntary", 0), typeId: "health" },
        { ...task("c1", "晨跑", "voluntary", 1), typeId: "run" },
      ],
    });

    render(<Widget />);
    expect(screen.getByText("体检")).toBeInTheDocument();
    expect(screen.getByText("晨跑")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "折叠健康" }));

    expect(screen.queryByText("体检")).not.toBeInTheDocument();
    expect(screen.queryByText("跑步")).not.toBeInTheDocument();
    expect(screen.queryByText("晨跑")).not.toBeInTheDocument();
  });

  it("expands every section again after returning from the capsule", async () => {
    render(<Widget />);

    fireEvent.click(screen.getByRole("button", { name: "折叠自愿" }));
    expect(screen.queryByText("跑步")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起挂件" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: /展开挂件/ }));
    await act(async () => undefined);

    expect(screen.getByText("跑步")).toBeInTheDocument();
  });

  it("completes a due todo when its row is clicked", () => {
    const setDone = vi.fn(async () => undefined);
    useTodosStore.setState({ setDone });

    render(<Widget />);

    fireEvent.click(screen.getByRole("button", { name: "完成 买猫粮" }));

    expect(setDone).toHaveBeenCalledWith("买猫粮", true);
  });

  it("keeps a todo completed today visible and lets it be unchecked", () => {
    const setDone = vi.fn(async () => undefined);
    useTodosStore.setState({
      setDone,
      todos: [
        todo("交房租", "2026-10-31"),
        todo("买猫粮", TODAY),
        {
          ...todo("已完成待办", TODAY),
          done: true,
          completedAt: new Date(2026, 10, 2, 9, 0, 0).toISOString(),
        },
      ],
    });

    render(<Widget />);

    expect(screen.getByText("已完成待办")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "取消完成 已完成待办" }),
    );

    expect(setDone).toHaveBeenCalledWith("已完成待办", false);
  });

  it("shows a value and edits it inline", () => {
    const setStatus = vi.fn(async () => undefined);
    const setValue = vi.fn(async () => undefined);
    useCheckinsStore.setState({
      setStatus,
      setValue,
      byKey: new Map([
        [checkinKey("t1", TODAY), { ...checkin("t1", "done"), value: "3 组" }],
      ]),
    });

    render(<Widget />);

    expect(screen.getByText("3 组")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "编辑 跑步 的记录值" }),
    );

    const input = screen.getByRole("textbox", {
      name: "编辑 跑步 的记录值",
    });
    fireEvent.change(input, { target: { value: "5 组" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(setValue).toHaveBeenCalledWith("t1", TODAY, "5 组");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("cycles task status on click", () => {
    const setStatus = vi.fn(async () => undefined);
    useCheckinsStore.setState({ setStatus });
    render(<Widget />);

    fireEvent.click(screen.getByRole("button", { name: "切换 跑步 状态" }));
    expect(setStatus).toHaveBeenCalledWith("t1", TODAY, "done");

    fireEvent.click(screen.getByRole("button", { name: "切换 开会 状态" }));
    expect(setStatus).toHaveBeenCalledWith("t2", TODAY, "missed");

    fireEvent.click(screen.getByRole("button", { name: "切换 背单词 状态" }));
    expect(setStatus).toHaveBeenCalledWith("t3", TODAY, "done");

    fireEvent.click(screen.getByRole("button", { name: "切换 交周报 状态" }));
    expect(setStatus).toHaveBeenCalledWith("t4", TODAY, null);
  });

  it("opens the separate menu window for tasks and todos", async () => {
    render(<Widget />);
    await act(async () => undefined);

    await act(async () => {
      fireEvent.contextMenu(
        screen.getByRole("button", { name: "切换 跑步 状态" }),
      );
    });

    expect(invokeMock).toHaveBeenCalledWith("open_widget_menu", {
      payload: expect.objectContaining({
        kind: "task",
        id: "t1",
        name: "跑步",
        current: null,
        labels: expect.objectContaining({
          copy: "复制名字",
          status: "今日状态",
          done: "已完成",
          missed: "未完成",
        }),
      }),
    });

    await act(async () => {
      fireEvent.contextMenu(screen.getByText("买猫粮"));
    });

    expect(invokeMock).toHaveBeenLastCalledWith("open_widget_menu", {
      payload: expect.objectContaining({
        kind: "todo",
        id: "买猫粮",
        name: "买猫粮",
        current: null,
      }),
    });
    // 菜单不在挂件窗口里渲染，窗口内不应出现 menu 角色。
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("applies the status chosen in the separate menu window", async () => {
    const setStatus = vi.fn(async () => undefined);
    useCheckinsStore.setState({ setStatus });
    render(<Widget />);
    await act(async () => undefined);

    act(() => {
      menuActionApi.handler?.({
        kind: "task",
        id: "t1",
        action: "status",
        status: "missed",
      });
    });
    expect(setStatus).toHaveBeenCalledWith("t1", TODAY, "missed");

    act(() => {
      menuActionApi.handler?.({
        kind: "task",
        id: "t2",
        action: "status",
        status: null,
      });
    });
    expect(setStatus).toHaveBeenCalledWith("t2", TODAY, null);

    // 待办菜单只回传复制，不写打卡。
    setStatus.mockClear();
    act(() => {
      menuActionApi.handler?.({
        kind: "todo",
        id: "买猫粮",
        action: "status",
        status: "done",
      });
    });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("shows the copy result reported by the menu window", async () => {
    render(<Widget />);
    await act(async () => undefined);

    act(() => {
      menuActionApi.handler?.({
        kind: "task",
        id: "t1",
        action: "copy",
        copied: true,
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("已复制");

    act(() => {
      menuActionApi.handler?.({
        kind: "task",
        id: "t1",
        action: "copy",
        copied: false,
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("复制失败");
  });

  it("closes the separate menu when the widget scrolls", async () => {
    render(<Widget />);
    await act(async () => undefined);
    invokeMock.mockClear();

    const scroller = document.querySelector("[data-widget-scroll]") as HTMLElement;
    fireEvent.scroll(scroller);
    await act(async () => undefined);

    expect(invokeMock).toHaveBeenCalledWith("close_widget_menu");
  });

  it("asks the main window to expand and collapses the widget", async () => {
    render(<Widget />);

    fireEvent.click(screen.getByRole("button", { name: "展开主窗口" }));

    expect(emitWidgetExpand).toHaveBeenCalledWith({ source: "widget" });
    await act(async () => undefined);
    expect(windowApi.hide).not.toHaveBeenCalled();
    expect(windowApi.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 192, height: 72 }),
    );
    expect(
      screen.getByRole("button", { name: /展开挂件/ }),
    ).toBeInTheDocument();
  });

  it("collapses to a right-edge capsule and expands on click", async () => {
    render(<Widget />);

    fireEvent.click(screen.getByRole("button", { name: "收起挂件" }));
    await act(async () => undefined);

    // 200% DPI：96×36 逻辑像素 → 192×72 物理像素，贴右边。
    expect(windowApi.setSize.mock.calls.at(-1)?.[0]).toMatchObject({
      width: 192,
      height: 72,
    });
    expect(windowApi.setPosition.mock.calls.at(-1)?.[0]).toMatchObject({
      x: 1920 - 192,
      y: 300,
    });
    expect(localStorage.getItem(CAPSULE_STORAGE_KEY)).toBe("1");
    expect(
      screen.getByRole("button", { name: /展开挂件/ }),
    ).toHaveAttribute("data-widget-side", "right");

    fireEvent.click(screen.getByRole("button", { name: /展开挂件/ }));
    await act(async () => undefined);

    expect(windowApi.setSize.mock.calls.at(-1)?.[0]).toMatchObject({
      width: 520,
      height: 720,
    });
    expect(localStorage.getItem(CAPSULE_STORAGE_KEY)).toBe("0");
    expect(
      screen.queryByRole("button", { name: /展开挂件/ }),
    ).not.toBeInTheDocument();
  });

  it("opens a native capsule menu with expand and hide", async () => {
    localStorage.setItem(CAPSULE_STORAGE_KEY, "1");
    render(<Widget />);
    await act(async () => undefined);

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /展开挂件/ }),
    );
    await act(async () => undefined);

    expect(menuApi.itemNew).toHaveBeenCalledTimes(2);
    const items = menuApi.itemNew.mock.calls.map(
      ([options]) => options as { text: string; action: () => void },
    );
    expect(items.map((item) => item.text)).toEqual(["展开", "隐藏挂件"]);
    expect(menuApi.popup).toHaveBeenCalled();
  });

  it("expands or hides the widget from the capsule menu", async () => {
    localStorage.setItem(CAPSULE_STORAGE_KEY, "1");
    render(<Widget />);
    await act(async () => undefined);

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /展开挂件/ }),
    );
    await act(async () => undefined);

    const items = menuApi.itemNew.mock.calls.map(
      ([options]) => options as { action: () => void },
    );
    items[0].action();
    await act(async () => undefined);
    expect(localStorage.getItem(CAPSULE_STORAGE_KEY)).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "收起挂件" }));
    await act(async () => undefined);

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /展开挂件/ }),
    );
    await act(async () => undefined);

    const hideItem = menuApi.itemNew.mock.calls
      .map(([options]) => options as { action: () => void })
      .at(-1) as { action: () => void };
    hideItem.action();
    await act(async () => undefined);

    expect(invokeMock).toHaveBeenCalledWith("hide_widget");
  });

  it("restores the capsule on the saved side", async () => {
    localStorage.setItem(CAPSULE_STORAGE_KEY, "1");
    localStorage.setItem(CAPSULE_SIDE_KEY, "left");
    render(<Widget />);
    await act(async () => undefined);

    expect(windowApi.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 192, height: 72 }),
    );
    expect(windowApi.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 300 }),
    );
    expect(
      screen.getByRole("button", { name: /展开挂件/ }),
    ).toHaveAttribute("data-widget-side", "left");
  });

  it("drags the capsule instead of expanding when the pointer moves", async () => {
    render(<Widget />);
    fireEvent.click(screen.getByRole("button", { name: "收起挂件" }));

    const capsule = screen.getByRole("button", { name: /展开挂件/ });
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        screenX: { value: x },
        screenY: { value: y },
        clientX: { value: x },
        clientY: { value: y },
        button: { value: 0 },
        pointerId: { value: 1 },
      });
      return event;
    };

    fireEvent(capsule, pointer("pointerdown", 100, 100));
    await act(async () => undefined);
    fireEvent(capsule, pointer("pointermove", 220, 100));

    expect(windowApi.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1600, y: 300 }),
    );

    fireEvent(capsule, pointer("pointerup", 220, 100));
    await act(async () => undefined);
    fireEvent.click(capsule);

    // 拖动后的 click 不应触发展开。
    expect(
      screen.getByRole("button", { name: /展开挂件/ }),
    ).toBeInTheDocument();
  });

  it("toggles always-on-top without a minimize action", async () => {
    vi.useRealTimers();
    const update = vi.fn(async (patch: Partial<Settings>) => {
      useSettingsStore.setState({
        settings: { ...useSettingsStore.getState().settings, ...patch },
      });
    });
    useSettingsStore.setState({ update });

    render(<Widget />);

    await waitFor(() =>
      expect(windowApi.setAlwaysOnTop).toHaveBeenCalledWith(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "取消置顶" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ alwaysOnTop: false }),
    );
    await waitFor(() =>
      expect(windowApi.setAlwaysOnTop).toHaveBeenCalledWith(false),
    );

    expect(
      screen.queryByRole("button", { name: "最小化挂件" }),
    ).not.toBeInTheDocument();
    expect(windowApi.hide).not.toHaveBeenCalled();
  });

  it("shows an empty state when nothing is scheduled", () => {
    useTasksStore.setState({ tasks: [] });
    useCheckinsStore.setState({ byKey: new Map() });
    useTodosStore.setState({ todos: [] });

    render(<Widget />);

    expect(screen.getByText(/今天没有任务/)).toBeInTheDocument();
    expect(screen.getByText("今天没有需要打卡的任务")).toBeInTheDocument();
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
  });
});
