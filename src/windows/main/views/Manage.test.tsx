import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type Interval, type Task } from "../../../domain/types";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import Manage from "./Manage";

const NOW = new Date(2026, 10, 4, 9, 0, 0);

function withIntervals(taskId: string, change: (task: Task) => Task["intervals"]) {
  useTasksStore.setState({
    tasks: useTasksStore
      .getState()
      .tasks.map((task) =>
        task.id === taskId ? { ...task, intervals: change(task) } : task,
      ),
  });
}

const closeInterval = vi.fn(async (taskId: string, endDate: string) => {
  withIntervals(taskId, (task) =>
    task.intervals.map((interval) =>
      interval.end === null ? { ...interval, end: endDate } : interval,
    ),
  );
});

const appendInterval = vi.fn(
  async (
    taskId: string,
    startDate: string,
    everyDays = 1,
  ): Promise<void> => {
    const interval: Interval = {
      id: `${taskId}-new`,
      taskId,
      start: startDate,
      end: null,
      everyDays,
    };
    withIntervals(taskId, (task) => [...task.intervals, interval]);
  },
);

const update = vi.fn(
  async (
    taskId: string,
    patch: { category?: Task["category"]; order?: number },
  ) => {
    useTasksStore.setState({
      tasks: useTasksStore
        .getState()
        .tasks.map((task) =>
          task.id === taskId ? { ...task, ...patch } : task,
        ),
    });
  },
);

const rename = vi.fn(async (taskId: string, name: string) => {
  useTasksStore.setState({
    tasks: useTasksStore
      .getState()
      .tasks.map((task) => (task.id === taskId ? { ...task, name } : task)),
  });
});

const updateInterval = vi.fn(
  async (
    intervalId: string,
    patch: { start: string; end: string | null; everyDays?: number },
  ) => {
    useTasksStore.setState({
      tasks: useTasksStore.getState().tasks.map((task) => ({
        ...task,
        intervals: task.intervals.map((interval) =>
          interval.id === intervalId ? { ...interval, ...patch } : interval,
        ),
      })),
    });
  },
);

const remove = vi.fn(async (taskId: string) => {
  useTasksStore.setState({
    tasks: useTasksStore.getState().tasks.filter((task) => task.id !== taskId),
  });
});

const create = vi.fn(
  async (input: {
    name: string;
    category: Task["category"];
    startDate: string;
    endDate?: string | null;
    everyDays?: number;
  }) => {
    const created: Task = {
      id: "created",
      name: input.name,
      category: input.category,
      intervals: [
        {
          id: "created-i",
          taskId: "created",
          start: input.startDate,
          end: input.endDate ?? null,
          everyDays: input.everyDays ?? 1,
        },
      ],
      order: 99,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    };
    useTasksStore.setState({
      tasks: [...useTasksStore.getState().tasks, created],
    });
    return created;
  },
);

function task(
  id: string,
  name: string,
  category: Task["category"],
  order: number,
  intervals: { start: string; end: string | null }[],
): Task {
  return {
    id,
    name,
    category,
    intervals: intervals.map((interval, index) => ({
      id: `${id}-${index}`,
      taskId: id,
      ...interval,
    })),
    order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("Manage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    create.mockClear();
    closeInterval.mockClear();
    appendInterval.mockClear();
    update.mockClear();
    rename.mockClear();
    updateInterval.mockClear();
    remove.mockClear();

    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
    useTasksStore.setState({
      loaded: true,
      create,
      closeInterval,
      appendInterval,
      update,
      rename,
      updateInterval,
      remove,
      tasks: [
        task("t1", "跑步", "voluntary", 0, [
          { start: "2026-09-01", end: "2026-10-01" },
          { start: "2026-10-16", end: null },
        ]),
        task("t2", "开会", "forced", 1, [
          { start: "2026-10-01", end: null },
        ]),
        task("t3", "跳绳", "voluntary", 2, [
          { start: "2026-09-01", end: "2026-10-01" },
        ]),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders every task with category, dates and status", () => {
    const { container } = render(<Manage />);

    const rows = container.querySelectorAll("[data-manage-row]");
    expect(rows).toHaveLength(3);

    const running = container.querySelector(
      '[data-manage-row="t1"]',
    ) as HTMLElement;
    expect(running).toHaveTextContent("跑步");
    expect(running).toHaveTextContent("自愿");
    expect(running).toHaveTextContent("10/16");
    expect(running).toHaveTextContent("进行中");
    expect(running).toHaveTextContent("2 段");

    expect(
      container.querySelector('[data-manage-row="t2"]'),
    ).toHaveTextContent("被迫");

    const retired = container.querySelector(
      '[data-manage-row="t3"]',
    ) as HTMLElement;
    expect(retired).toHaveAttribute("data-status", "disabled");
    expect(retired).toHaveTextContent("已停用");
    expect(retired).toHaveTextContent("10/01");
  });

  it("shows an empty state without tasks", () => {
    useTasksStore.setState({ tasks: [], loaded: true });

    render(<Manage />);

    expect(screen.getByText("还没有任务")).toBeInTheDocument();
  });

  it("creates a task with today as the default start date", () => {
    const { container } = render(<Manage />);

    fireEvent.click(container.querySelector("[data-manage-new]") as Element);
    expect(screen.getByRole("dialog", { name: "新建任务" })).toBeInTheDocument();
    expect(container.querySelector("[data-new-start]")).toHaveValue(
      "2026-11-04",
    );

    fireEvent.change(container.querySelector("[data-new-name]") as Element, {
      target: { value: "阅读" },
    });
    fireEvent.click(
      container.querySelector('[data-category-option="forced"]') as Element,
    );
    fireEvent.click(container.querySelector("[data-new-submit]") as Element);

    expect(create).toHaveBeenCalledWith({
      name: "阅读",
      category: "forced",
      startDate: "2026-11-04",
      endDate: null,
      everyDays: 1,
    });
    expect(
      container.querySelector('[data-manage-row="created"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates a task with an optional deadline", () => {
    const { container } = render(<Manage />);

    fireEvent.click(container.querySelector("[data-manage-new]") as Element);
    fireEvent.change(container.querySelector("[data-new-name]") as Element, {
      target: { value: "阅读" },
    });
    fireEvent.change(container.querySelector("[data-new-end]") as Element, {
      target: { value: "2026-11-30" },
    });
    fireEvent.click(container.querySelector("[data-new-submit]") as Element);

    expect(create).toHaveBeenCalledWith({
      name: "阅读",
      category: "voluntary",
      startDate: "2026-11-04",
      endDate: "2026-11-30",
      everyDays: 1,
    });
  });

  it("rejects a deadline earlier than the start date", () => {
    const { container } = render(<Manage />);

    fireEvent.click(container.querySelector("[data-manage-new]") as Element);
    fireEvent.change(container.querySelector("[data-new-name]") as Element, {
      target: { value: "阅读" },
    });
    fireEvent.change(container.querySelector("[data-new-end]") as Element, {
      target: { value: "2026-11-01" },
    });

    expect(screen.getByText("截止日期不能早于启用日期")).toBeInTheDocument();
    expect(container.querySelector("[data-new-submit]")).toBeDisabled();
  });

  it("creates and edits a task with an every-N-days interval", () => {
    const { container } = render(<Manage />);

    fireEvent.click(container.querySelector("[data-manage-new]") as Element);
    fireEvent.change(container.querySelector("[data-new-name]") as Element, {
      target: { value: "健身" },
    });
    fireEvent.change(
      container.querySelector('[data-every-days="new"]') as Element,
      { target: { value: "3" } },
    );
    fireEvent.click(container.querySelector("[data-new-submit]") as Element);

    expect(create).toHaveBeenCalledWith({
      name: "健身",
      category: "voluntary",
      startDate: "2026-11-04",
      endDate: null,
      everyDays: 3,
    });
    expect(
      container.querySelector('[data-manage-row="created"]'),
    ).toHaveTextContent("每 3 天");

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t1"] [data-manage-action="edit"]',
      ) as Element,
    );
    expect(container.querySelector('[data-every-days="edit"]')).toHaveValue(1);
    fireEvent.change(
      container.querySelector('[data-every-days="edit"]') as Element,
      { target: { value: "2" } },
    );
    fireEvent.click(container.querySelector("[data-edit-submit]") as Element);

    expect(updateInterval).toHaveBeenCalledWith("t1-1", {
      start: "2026-10-16",
      end: null,
      everyDays: 2,
    });
  });

  it("blocks blank names and closes on cancel", () => {    const { container } = render(<Manage />);

    fireEvent.click(container.querySelector("[data-manage-new]") as Element);
    expect(container.querySelector("[data-new-submit]")).toBeDisabled();

    fireEvent.click(container.querySelector("[data-new-cancel]") as Element);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("stops a task from today and rejects earlier dates", () => {
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t2"] [data-manage-action="stop"]',
      ) as Element,
    );
    expect(container.querySelector('[data-interval-dialog="stop"]')).toBeInTheDocument();
    expect(container.querySelector("[data-interval-date]")).toHaveValue(
      "2026-11-04",
    );

    fireEvent.change(container.querySelector("[data-interval-date]") as Element, {
      target: { value: "2026-11-03" },
    });
    expect(container.querySelector("[data-interval-submit]")).toBeDisabled();
    expect(container.querySelector("[data-interval-error]")).toBeInTheDocument();

    fireEvent.change(container.querySelector("[data-interval-date]") as Element, {
      target: { value: "2026-11-05" },
    });
    fireEvent.click(container.querySelector("[data-interval-submit]") as Element);

    expect(closeInterval).toHaveBeenCalledWith("t2", "2026-11-05");
    expect(
      container.querySelector('[data-manage-row="t2"]'),
    ).toHaveTextContent("11/05");
  });

  it("re-enables a retired task and shows the second interval", () => {
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t3"] [data-manage-action="resume"]',
      ) as Element,
    );
    fireEvent.click(container.querySelector("[data-interval-submit]") as Element);

    expect(appendInterval).toHaveBeenCalledWith("t3", "2026-11-04", 1);
    const row = container.querySelector('[data-manage-row="t3"]') as HTMLElement;
    expect(row).toHaveTextContent("2 段");
    expect(row).toHaveAttribute("data-status", "active");
  });

  it("shows re-enable and 今日为止 for a task stopped today", () => {
    useTasksStore.setState({
      tasks: [
        task("t5", "晨跑", "voluntary", 0, [
          { start: "2026-10-01", end: "2026-11-04" },
        ]),
      ],
    });
    const { container } = render(<Manage />);

    const row = container.querySelector('[data-manage-row="t5"]') as HTMLElement;
    expect(row).toHaveAttribute("data-status", "endingToday");
    expect(row).toHaveTextContent("今日为止");
    expect(
      row.querySelector('[data-manage-action="resume"]'),
    ).toBeInTheDocument();
    expect(
      row.querySelector('[data-manage-action="stop"]'),
    ).not.toBeInTheDocument();
  });

  it("defaults the re-enable date to the day after the last end", () => {
    useTasksStore.setState({
      tasks: [
        task("t5", "晨跑", "voluntary", 0, [
          { start: "2026-10-01", end: "2026-11-04" },
        ]),
      ],
    });
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t5"] [data-manage-action="resume"]',
      ) as Element,
    );

    expect(container.querySelector("[data-interval-date]")).toHaveValue(
      "2026-11-05",
    );
  });

  it("keeps the dialog open and reports a failed stop", async () => {
    closeInterval.mockRejectedValueOnce(new Error("no-open-interval"));
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t2"] [data-manage-action="stop"]',
      ) as Element,
    );
    fireEvent.click(container.querySelector("[data-interval-submit]") as Element);
    await act(async () => undefined);

    expect(container.querySelector("[data-interval-error]")).toHaveTextContent(
      "操作失败",
    );
    expect(container.querySelector('[data-interval-dialog="stop"]')).toBeInTheDocument();
  });

  it("edits the latest interval and keeps earlier segments read-only", () => {
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t1"] [data-manage-action="edit"]',
      ) as Element,
    );

    expect(container.querySelector("[data-edit-start]")).toHaveValue(
      "2026-10-16",
    );
    expect(container.querySelector("[data-edit-open]")).toBeChecked();
    expect(container.querySelector("[data-edit-end]")).toBeDisabled();
    expect(
      container.querySelector("[data-edit-end]")?.closest("[data-date-field]"),
    ).toHaveClass("min-w-0");
    expect(screen.getByText("09/01 – 10/01")).toBeInTheDocument();

    fireEvent.change(container.querySelector("[data-edit-name]") as Element, {
      target: { value: "晨跑" },
    });
    fireEvent.change(container.querySelector("[data-edit-start]") as Element, {
      target: { value: "2026-10-20" },
    });
    fireEvent.click(container.querySelector("[data-edit-submit]") as Element);

    expect(rename).toHaveBeenCalledWith(
      "t1",
      "晨跑",
      "2026-11-04",
      "from-today",
    );
    expect(update).not.toHaveBeenCalled();
    expect(updateInterval).toHaveBeenCalledWith("t1-1", {
      start: "2026-10-20",
      end: null,
      everyDays: 1,
    });
    expect(
      container.querySelector('[data-manage-row="t1"]'),
    ).toHaveTextContent("晨跑");
  });

  it("shows name history and rewrites the current name in typo mode", () => {
    useTasksStore.setState({
      loaded: true,
      tasks: [
        {
          ...task("t1", "每天两个", "voluntary", 0, [
            { start: "2026-10-01", end: null },
          ]),
          namePeriods: [
            {
              id: "p1",
              taskId: "t1",
              name: "每天一个",
              start: "2026-10-01",
              end: "2026-10-31",
            },
            {
              id: "p2",
              taskId: "t1",
              name: "每天两个",
              start: "2026-11-01",
              end: null,
            },
          ],
        },
      ],
    });

    const { container } = render(<Manage />);
    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t1"] [data-manage-action="edit"]',
      ) as Element,
    );

    expect(screen.getByText("每天一个")).toBeInTheDocument();
    expect(container.querySelector('[data-name-history="p1"]')).toHaveTextContent(
      "10/01 – 10/31",
    );
    expect(screen.getByText(/改名从今天起生效/)).toBeInTheDocument();

    fireEvent.change(container.querySelector("[data-edit-name]") as Element, {
      target: { value: "每天两个俯卧撑" },
    });
    fireEvent.click(
      container.querySelector("[data-edit-name-typo]") as Element,
    );
    fireEvent.click(container.querySelector("[data-edit-submit]") as Element);

    expect(rename).toHaveBeenCalledWith(
      "t1",
      "每天两个俯卧撑",
      "2026-11-04",
      "rewrite-current",
    );
  });

  it("rejects an end before the start and an overlapping start", () => {
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t1"] [data-manage-action="edit"]',
      ) as Element,
    );
    fireEvent.click(container.querySelector("[data-edit-open]") as Element);
    fireEvent.change(container.querySelector("[data-edit-start]") as Element, {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(container.querySelector("[data-edit-end]") as Element, {
      target: { value: "2026-11-01" },
    });

    expect(screen.getByText("截止日期不能早于启用日期")).toBeInTheDocument();
    expect(container.querySelector("[data-edit-submit]")).toBeDisabled();

    fireEvent.change(container.querySelector("[data-edit-start]") as Element, {
      target: { value: "2026-10-01" },
    });
    expect(
      screen.getByText("启用日期必须晚于上一段结束日"),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-edit-submit]")).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("deletes a task only after confirmation", async () => {
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t2"] [data-manage-action="delete"]',
      ) as Element,
    );
    expect(screen.getByRole("dialog", { name: "删除「开会」" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "启用区间、名称历史与全部打卡记录会一并删除",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "取消" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t2"] [data-manage-action="delete"]',
      ) as Element,
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await act(async () => undefined);

    expect(remove).toHaveBeenCalledWith("t2", expect.anything());
    expect(
      container.querySelector('[data-manage-row="t2"]'),
    ).not.toBeInTheDocument();
  });

  it("keeps the delete dialog open when removal fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    remove.mockRejectedValueOnce(new Error("database is locked"));
    const { container } = render(<Manage />);

    fireEvent.click(
      container.querySelector(
        '[data-manage-row="t2"] [data-manage-action="delete"]',
      ) as Element,
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await act(async () => undefined);

    expect(document.querySelector("[data-confirm-delete-error]")).toHaveTextContent(
      "删除失败",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
