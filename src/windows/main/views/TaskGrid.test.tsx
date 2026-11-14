import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkinKey } from "../../../domain/keys";
import {
  DEFAULT_SETTINGS,
  type Checkin,
  type Task,
} from "../../../domain/types";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useUiStore } from "../../../stores/uiStore";
import TaskGrid from "./TaskGrid";

const NOW = new Date(2026, 10, 2, 9, 0, 0);
const TODAY = "2026-11-02";

function task(
  id: string,
  name: string,
  category: Task["category"],
  start: string,
  end: string | null,
  order: number,
): Task {
  return {
    id,
    name,
    category,
    intervals: [{ id: `${id}-i`, taskId: id, start, end }],
    order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function doneToday(): Checkin {
  return {
    id: "c1",
    taskId: "t1",
    date: TODAY,
    status: "done",
    value: null,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function skippedToday(): Checkin {
  return {
    id: "c2",
    taskId: "t2",
    date: TODAY,
    status: "skipped",
    value: null,
    note: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

describe("TaskGrid", () => {
  const setStatus = vi.fn(async () => undefined);
  const setNote = vi.fn(async () => undefined);
  const setValue = vi.fn(async () => undefined);
  const reorder = vi.fn(async () => undefined);
  const updateSettings = vi.fn(
    async (patch: Partial<typeof DEFAULT_SETTINGS>) => {
      void patch;
    },
  );

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    setStatus.mockClear();
    setNote.mockClear();
    setValue.mockClear();
    reorder.mockClear();
    updateSettings.mockClear();

    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      loaded: true,
      update: updateSettings,
    });
    useUiStore.setState({
      gridFilter: { category: "all", taskId: null, from: null, to: null },
    });
    useTasksStore.setState({
      tasks: [
        task("t1", "引体向上", "voluntary", "2026-10-28", null, 0),
        task("t2", "开会", "forced", "2026-10-01", null, 1),
        task("t3", "跳绳", "voluntary", "2026-09-01", "2026-10-01", 2),
      ],
      loaded: true,
      reorder,
    });
    useCheckinsStore.setState({
      byKey: new Map([[checkinKey("t1", TODAY), doneToday()]]),
      loaded: true,
      setStatus,
      setNote,
      setValue,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the three groups in order with the retired group collapsed", () => {
    const { container } = render(<TaskGrid />);

    const headers = Array.from(
      container.querySelectorAll("[data-group-header]"),
    ).map((element) => element.getAttribute("data-group-header"));
    expect(headers).toEqual(["voluntary", "forced", "disabled"]);

    expect(
      container.querySelector('[data-grid-row="t1"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-grid-row="t2"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-grid-row="t3"]'),
    ).not.toBeInTheDocument();
  });

  it("expands the retired group on demand", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.click(
      container.querySelector('[data-group-header="disabled"]') as Element,
    );

    expect(container.querySelector('[data-grid-row="t3"]')).toBeInTheDocument();
  });

  it("marks the today column in the header and body", () => {
    const { container } = render(<TaskGrid />);

    expect(
      container.querySelector(`[data-date-header="${TODAY}"]`),
    ).toHaveAttribute("data-today");

    const todayCell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    );
    expect(todayCell).toHaveAttribute("data-state", "done");
    expect(todayCell).toHaveAttribute("data-today");
  });

  it("keeps the today tint off cells that are skipped", () => {
    useCheckinsStore.setState({
      byKey: new Map([
        [checkinKey("t1", TODAY), doneToday()],
        [checkinKey("t2", TODAY), skippedToday()],
      ]),
    });
    const { container } = render(<TaskGrid />);

    const skipped = container.querySelector(
      `[data-task="t2"][data-date="${TODAY}"]`,
    );
    expect(skipped).toHaveAttribute("data-state", "skipped");
    expect(skipped).not.toHaveAttribute("data-today-tint");

    const done = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    );
    expect(done).toHaveAttribute("data-today-tint");
  });

  it("keeps the today tint off cells outside the interval", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.click(
      container.querySelector('[data-group-header="disabled"]') as Element,
    );

    const none = container.querySelector(
      `[data-task="t3"][data-date="${TODAY}"]`,
    );
    expect(none).toHaveAttribute("data-state", "none");
    expect(none).not.toHaveAttribute("data-today-tint");
  });

  it("only focuses a cell on click and never writes a check-in", () => {
    const { container } = render(<TaskGrid />);
    const cell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    ) as HTMLElement;

    cell.focus();
    fireEvent.click(cell);

    expect(setStatus).not.toHaveBeenCalled();
    expect(cell).toHaveFocus();
    expect(
      container.querySelector("[data-cell-editor]"),
    ).not.toBeInTheDocument();
  });

  it("keeps out-of-range cells grey and non-clickable", () => {
    const { container } = render(<TaskGrid />);

    const beforeStart = container.querySelector(
      '[data-task="t1"][data-date="2026-10-27"]',
    );
    expect(beforeStart).toHaveAttribute("data-state", "none");
    expect(beforeStart).toBeDisabled();
  });

  it("follows scrolling to swap the month pill", () => {
    const { container } = render(<TaskGrid />);
    expect(container).toHaveTextContent("2026 年 10 月");

    const scroller = container.querySelector(
      "[data-grid-scroller]",
    ) as HTMLElement;
    scroller.scrollLeft = 365 * 32;
    fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(container).toHaveTextContent("2026 年 11 月");
  });

  it("coalesces scroll events into one frame", () => {
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector(
      "[data-grid-scroller]",
    ) as HTMLElement;

    scroller.scrollLeft = 360 * 32;
    fireEvent.scroll(scroller);
    scroller.scrollLeft = 365 * 32;
    fireEvent.scroll(scroller);

    expect(container).toHaveTextContent("2026 年 10 月");
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(container).toHaveTextContent("2026 年 11 月");
  });

  it("stops at the right edge without drifting past the axis", () => {
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector(
      "[data-grid-scroller]",
    ) as HTMLElement;

    scroller.scrollLeft = 9_999_999;
    fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(
      container.querySelector("[data-grid-scroll]"),
    ).toHaveAttribute("data-grid-scroll", String(160 + 396 * 32 - 832));
    expect(
      container.querySelector('[data-date-header="2026-12-02"]'),
    ).toBeInTheDocument();
  });

  it("clamps a filter range that falls outside the axis", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.change(
      container.querySelector("[data-filter-from]") as Element,
      { target: { value: "2030-01-01" } },
    );
    fireEvent.change(container.querySelector("[data-filter-to]") as Element, {
      target: { value: "2030-01-02" },
    });

    expect(container.querySelectorAll("[data-date-header]")).toHaveLength(1);
    expect(
      container.querySelector('[data-date-header="2026-12-02"]'),
    ).toBeInTheDocument();
  });

  it("keeps Home at the nearest filtered edge when today is out of range", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.change(
      container.querySelector("[data-filter-from]") as Element,
      { target: { value: "2026-10-01" } },
    );
    fireEvent.change(container.querySelector("[data-filter-to]") as Element, {
      target: { value: "2026-10-10" },
    });

    fireEvent.keyDown(
      container.querySelector(
        '[data-task="t2"][data-date="2026-10-10"]',
      ) as Element,
      { key: "Home" },
    );

    expect(container.querySelector("[data-focused]")).toHaveAttribute(
      "data-date",
      "2026-10-10",
    );
    expect(container.querySelector("[data-grid-scroll]")).toHaveAttribute(
      "data-grid-scroll",
      "0",
    );
  });

  it("opens the cell editor from a judged cell and saves the note", () => {
    const { container } = render(<TaskGrid />);
    const noteButton = container.querySelector(
      `[data-note-button="t1|${TODAY}"]`,
    ) as HTMLElement;

    expect(noteButton).toBeInTheDocument();
    fireEvent.click(noteButton);
    expect(container.querySelector("[data-cell-editor]")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), {
      target: { value: "只做了 5 个" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(setNote).toHaveBeenCalledWith("t1", TODAY, "只做了 5 个");
    expect(
      container.querySelector("[data-cell-editor]"),
    ).not.toBeInTheDocument();
  });

  it("shows the value instead of the status symbol", () => {
    useCheckinsStore.setState({
      byKey: new Map([
        [checkinKey("t1", TODAY), { ...doneToday(), value: "3 组" }],
      ]),
    });

    const { container } = render(<TaskGrid />);
    const cell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    );

    expect(cell).toHaveTextContent("3 组");
    expect(cell).not.toHaveTextContent("✓");
    expect(cell).toHaveAttribute("data-value", "3 组");
  });

  it("widens a date column to its longest value and keeps the column uniform", () => {
    const long = "1234567890";
    useCheckinsStore.setState({
      byKey: new Map([
        [checkinKey("t1", TODAY), { ...doneToday(), value: long }],
        [
          checkinKey("t2", TODAY),
          { ...doneToday(), id: "c2", taskId: "t2", value: "1" },
        ],
      ]),
    });

    const { container } = render(<TaskGrid />);
    const longCell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    ) as HTMLElement;
    const shortCell = container.querySelector(
      `[data-task="t2"][data-date="${TODAY}"]`,
    ) as HTMLElement;
    const longWidth = (longCell.parentElement as HTMLElement).style.width;
    const shortWidth = (shortCell.parentElement as HTMLElement).style.width;

    expect(parseFloat(longWidth)).toBeGreaterThan(32);
    expect(shortWidth).toBe(longWidth);
    expect(longCell).toHaveTextContent(long);
    expect(longCell.querySelector("span")).not.toHaveClass("truncate");
  });

  it("caps a long value column at 320px and wraps the text", () => {
    useCheckinsStore.setState({
      byKey: new Map([
        [checkinKey("t1", TODAY), { ...doneToday(), value: "汉".repeat(200) }],
      ]),
    });

    const { container } = render(<TaskGrid />);
    const cell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    ) as HTMLElement;

    expect((cell.parentElement as HTMLElement).style.width).toBe("320px");
    expect(cell.querySelector("span")).toHaveClass("break-words");
  });

  it("widens the task column to the longest task name", () => {
    const longName = "这是一个很长的任务名称用于测试自适应列宽";
    useTasksStore.setState({
      tasks: useTasksStore
        .getState()
        .tasks.map((item) =>
          item.id === "t1" ? { ...item, name: longName } : item,
        ),
    });

    const { container } = render(<TaskGrid />);
    const nameCells = Array.from(
      container.querySelectorAll<HTMLElement>("[data-task-name]"),
    );
    const widths = nameCells.map((element) => element.style.width);

    expect(widths.length).toBeGreaterThan(0);
    expect(new Set(widths).size).toBe(1);
    expect(parseFloat(widths[0])).toBeGreaterThan(160);
    expect(parseFloat(widths[0])).toBeLessThanOrEqual(320);
    expect(nameCells[0]).toHaveTextContent(longName);
    expect(nameCells[0].querySelector("span")).not.toHaveClass("truncate");
  });

  it("keeps uniform narrow columns in overview mode", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, gridZoom: 16 },
      loaded: true,
      update: updateSettings,
    });
    useCheckinsStore.setState({
      byKey: new Map([
        [checkinKey("t1", TODAY), { ...doneToday(), value: "1234567890" }],
      ]),
    });

    const { container } = render(<TaskGrid />);
    const cell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    ) as HTMLElement;

    expect(container.querySelector('[data-mode="overview"]')).toBeInTheDocument();
    expect((cell.parentElement as HTMLElement).style.width).toBe("16px");
  });

  it("edits status, value and note from the right-click editor", async () => {
    const { container } = render(<TaskGrid />);
    const cell = container.querySelector(
      '[data-task="t2"][data-date="2026-11-03"]',
    ) as Element;

    fireEvent.contextMenu(cell);
    expect(container.querySelector("[data-cell-editor]")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    fireEvent.change(screen.getByLabelText("自由值"), {
      target: { value: "30 分钟" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), {
      target: { value: "只做了 20 分钟" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(setStatus).toHaveBeenCalledWith("t2", "2026-11-03", "skipped");
    expect(setValue).toHaveBeenCalledWith("t2", "2026-11-03", "30 分钟");
    expect(setNote).toHaveBeenCalledWith("t2", "2026-11-03", "只做了 20 分钟");
  });

  it("does not open the editor on an out-of-range cell", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.contextMenu(
      container.querySelector(
        '[data-task="t1"][data-date="2026-10-27"]',
      ) as Element,
    );

    expect(
      container.querySelector("[data-cell-editor]"),
    ).not.toBeInTheDocument();
  });

  it("only offers notes on cells that already have a record", () => {    const { container } = render(<TaskGrid />);

    expect(
      container.querySelector(`[data-note-button="t1|${TODAY}"]`),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-note-button="t1|2026-11-03"]'),
    ).not.toBeInTheDocument();
  });

  it("moves the focused cell with arrows and returns Home to today", () => {
    const { container } = render(<TaskGrid />);
    const todayCell = container.querySelector(
      `[data-task="t1"][data-date="${TODAY}"]`,
    ) as HTMLElement;

    expect(todayCell).toHaveAttribute("tabindex", "0");
    todayCell.focus();
    expect(todayCell).toHaveFocus();

    fireEvent.keyDown(todayCell, { key: "ArrowLeft" });
    const previousDay = container.querySelector(
      '[data-task="t1"][data-date="2026-11-01"]',
    ) as HTMLElement;
    expect(previousDay).toHaveFocus();

    fireEvent.keyDown(previousDay, { key: "ArrowDown" });
    const forcedRow = container.querySelector(
      '[data-task="t2"][data-date="2026-11-01"]',
    ) as HTMLElement;
    expect(forcedRow).toHaveFocus();

    fireEvent.keyDown(forcedRow, { key: "Home" });
    const todayForced = container.querySelector(
      `[data-task="t2"][data-date="${TODAY}"]`,
    ) as HTMLElement;
    expect(todayForced).toHaveFocus();

    fireEvent.keyDown(todayForced, { key: "Escape" });
    expect(container.querySelector("[data-focused]")).not.toBeInTheDocument();
  });

  it("switches between detail and overview modes", () => {
    const { container } = render(<TaskGrid />);
    expect(container.querySelector('[data-mode="detail"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(updateSettings).toHaveBeenCalledWith({ gridZoom: 16 });
  });

  it("returns to detail on an overview block click", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, gridZoom: 16 },
      update: updateSettings,
    });
    const { container } = render(<TaskGrid />);

    expect(container.querySelector('[data-mode="overview"]')).toBeInTheDocument();
    fireEvent.click(
      container.querySelector(
        `[data-task="t1"][data-date="${TODAY}"]`,
      ) as Element,
    );

    const patch = updateSettings.mock.calls.at(-1)?.[0];
    expect(patch?.gridZoom).toBe(32);
  });

  it("zooms with Ctrl + wheel and persists gridZoom", () => {
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector(
      "[data-grid-scroller]",
    ) as HTMLElement;

    fireEvent.wheel(scroller, { ctrlKey: true, deltaY: -100 });
    expect(updateSettings).toHaveBeenCalledWith({ gridZoom: 34 });

    fireEvent.wheel(scroller, { deltaY: -100 });
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

  it("scrolls horizontally with Shift + wheel without zooming", () => {
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector(
      "[data-grid-scroller]",
    ) as HTMLElement;
    const section = container.querySelector(
      "[data-grid-zoom]",
    ) as HTMLElement;
    const before = Number(section.dataset.gridScroll);

    fireEvent.wheel(scroller, { shiftKey: true, deltaY: 120 });

    expect(Number(section.dataset.gridScroll)).toBeGreaterThan(before);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("filters rows by category and by task", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.click(
      container.querySelector('[data-filter-category="forced"]') as Element,
    );
    expect(
      container.querySelector('[data-grid-row="t2"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-grid-row="t1"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-group-header="voluntary"]'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      container.querySelector('[data-filter-category="all"]') as Element,
    );
    fireEvent.change(container.querySelector("[data-filter-task]") as Element, {
      target: { value: "t2" },
    });
    expect(
      container.querySelector('[data-grid-row="t2"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-grid-row="t1"]'),
    ).not.toBeInTheDocument();
  });

  it("clips the date axis to the selected range and clears it", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.change(
      container.querySelector("[data-filter-from]") as Element,
      { target: { value: "2026-10-28" } },
    );
    fireEvent.change(
      container.querySelector("[data-filter-to]") as Element,
      { target: { value: "2026-11-02" } },
    );

    expect(
      container.querySelector('[data-date-header="2026-10-27"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-date-header="2026-10-28"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-date-header="2026-11-02"]'),
    ).toBeInTheDocument();

    fireEvent.click(
      container.querySelector("[data-filter-clear]") as Element,
    );
    expect(
      container.querySelector('[data-date-header="2026-10-27"]'),
    ).toBeInTheDocument();
  });

  it("shows an empty state when filters exclude every row", () => {
    const { container } = render(<TaskGrid />);

    fireEvent.change(container.querySelector("[data-filter-task]") as Element, {
      target: { value: "t2" },
    });
    fireEvent.click(
      container.querySelector('[data-filter-category="voluntary"]') as Element,
    );

    expect(screen.getByText("没有符合筛选的任务")).toBeInTheDocument();
    expect(
      screen.getByText("清除筛选后可以看到全部任务"),
    ).toBeInTheDocument();
  });

  it("shows the first-run hint when there are no tasks at all", () => {
    useTasksStore.setState({ tasks: [], loaded: true });
    useCheckinsStore.setState({ byKey: new Map(), loaded: true });

    const { container } = render(<TaskGrid />);

    expect(container.querySelector("[data-grid-empty]")).toBeInTheDocument();
    expect(
      screen.getByText("还没有任务，去「任务管理」新建一个"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("清除筛选后可以看到全部任务"),
    ).not.toBeInTheDocument();
  });

  it("keeps the card frame with a skeleton until stores hydrate", () => {
    useTasksStore.setState({ loaded: false });

    const { container } = render(<TaskGrid />);

    expect(screen.getByLabelText("正在加载任务表")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelectorAll("[data-grid-cell]")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "任务表" }),
    ).toBeInTheDocument();
  });

  it("keeps former name rows collapsed and counts tasks once", () => {
    useTasksStore.setState({
      loaded: true,
      tasks: [
        {
          ...task(
            "t1",
            "每天两个",
            "voluntary",
            "2026-10-01",
            null,
            0,
          ),
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

    const { container } = render(<TaskGrid />);

    const header = container.querySelector(
      '[data-group-header="voluntary"]',
    ) as HTMLElement;
    expect(header).toHaveTextContent("1");
    expect(container.querySelector('[data-grid-row="t1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-grid-row="t1~p1"]')).toBeNull();

    fireEvent.click(
      container.querySelector('[data-name-history-toggle="t1"]') as Element,
    );

    const oldRow = container.querySelector(
      '[data-grid-row="t1~p1"]',
    ) as HTMLElement;
    expect(oldRow).toBeInTheDocument();
    const label = oldRow.querySelector("[data-task-name]");
    expect(label).toHaveTextContent("每天一个");
    expect(label?.querySelector("span")).toHaveAttribute(
      "title",
      "10/01 – 10/31",
    );
    expect(
      oldRow.querySelector('[data-date="2026-11-02"]'),
    ).toHaveAttribute("data-state", "none");
    expect(
      oldRow.querySelector('[data-date="2026-10-15"]'),
    ).toHaveAttribute("data-state", "missed");
    expect(
      container.querySelector('[data-grid-row="t1"] [data-date="2026-10-15"]'),
    ).toHaveAttribute("data-state", "none");
  });

  it("reorders rows within the same group", () => {
    useTasksStore.setState({
      tasks: [
        task("t1", "引体向上", "voluntary", "2026-10-28", null, 0),
        task("t4", "阅读", "voluntary", "2026-10-01", null, 1),
        task("t2", "开会", "forced", "2026-10-01", null, 2),
        task("t3", "跳绳", "voluntary", "2026-09-01", "2026-10-01", 3),
      ],
      reorder,
    });
    const { container } = render(<TaskGrid />);
    const source = container.querySelector(
      '[data-grid-row="t1"]',
    ) as HTMLElement;
    const target = container.querySelector(
      '[data-grid-row="t4"]',
    ) as HTMLElement;

    fireEvent.dragStart(source.firstElementChild as Element);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(reorder).toHaveBeenCalledWith(["t4", "t1", "t2", "t3"]);
  });

  it("ignores a drop into another group", () => {
    const { container } = render(<TaskGrid />);
    const source = container.querySelector(
      '[data-grid-row="t1"]',
    ) as HTMLElement;
    const target = container.querySelector(
      '[data-grid-row="t2"]',
    ) as HTMLElement;

    fireEvent.dragStart(source.firstElementChild as Element);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(reorder).not.toHaveBeenCalled();
  });

  it("keeps the DOM windowed on a 1200-column axis", () => {
    useTasksStore.setState({
      tasks: Array.from({ length: 15 }, (_, index) =>
        task(
          `perf-${index}`,
          `任务${index}`,
          index % 2 === 0 ? "voluntary" : "forced",
          "2020-01-01",
          null,
          index,
        ),
      ),
    });
    useCheckinsStore.setState({ byKey: new Map(), setStatus, setNote });

    const { container } = render(<TaskGrid />);
    const cells = container.querySelectorAll("[data-grid-cell]");

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(2000);
  });
});
