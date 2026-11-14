import { act, fireEvent, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type Task } from "../../../domain/types";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useUiStore } from "../../../stores/uiStore";
import { gridCellRenderCount } from "./GridCell";
import TaskGrid from "./TaskGrid";

const NOW = new Date(2026, 10, 2, 9, 0, 0);
/** 文档 budgets：docs/reference/grid.md 第 3 节。 */
const MAX_CELLS = 2000;
const MAX_MOUNT_COMMITS = 2;
const WIDE_VIEWPORT = 1440;

function task(index: number): Task {
  return {
    id: `perf-${index}`,
    name: `任务${index}`,
    category: index % 2 === 0 ? "voluntary" : "forced",
    intervals: [
      {
        id: `perf-${index}-i`,
        taskId: `perf-${index}`,
        start: "2020-01-01",
        end: null,
      },
    ],
    order: index,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}

/** jsdom 里没有布局，clientWidth 恒为 0；这里伪装成真实窗口宽度。 */
function mockViewportWidth(width: number): () => void {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
      return;
    }
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  };
}

describe("TaskGrid 性能预算", () => {
  let restoreViewport: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      loaded: true,
      update: vi.fn(async () => undefined),
    });
    useUiStore.setState({
      gridFilter: { category: "all", taskId: null, from: null, to: null },
    });
    useTasksStore.setState({
      tasks: Array.from({ length: 21 }, (_, index) => task(index)),
      loaded: true,
      reorder: vi.fn(async () => undefined),
    });
    useCheckinsStore.setState({
      byKey: new Map(),
      loaded: true,
      setStatus: vi.fn(async () => undefined),
      setNote: vi.fn(async () => undefined),
      setValue: vi.fn(async () => undefined),
    });
  });

  afterEach(() => {
    restoreViewport();
    vi.useRealTimers();
  });

  it("keeps the cell DOM within budget on a 1440px viewport", () => {
    restoreViewport = mockViewportWidth(WIDE_VIEWPORT);
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector("[data-grid-scroller]") as HTMLElement;

    // 回到轴首，窗口最宽的位置（右侧全是未渲染列）。
    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const cells = container.querySelectorAll("[data-grid-cell]");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS);
  });

  it("keeps the cell DOM within budget in the middle of the axis", () => {
    restoreViewport = mockViewportWidth(WIDE_VIEWPORT);
    const { container } = render(<TaskGrid />);
    const scroller = container.querySelector("[data-grid-scroller]") as HTMLElement;

    scroller.scrollLeft = 600 * 32;
    fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const cells = container.querySelectorAll("[data-grid-cell]");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS);
  });

  it("commits at most twice while mounting", () => {
    restoreViewport = mockViewportWidth(WIDE_VIEWPORT);
    const commits: string[] = [];

    render(
      <Profiler
        id="task-grid"
        onRender={(_id, phase) => {
          commits.push(phase);
        }}
      >
        <TaskGrid />
      </Profiler>,
    );

    expect(commits.length).toBeGreaterThan(0);
    expect(commits.length).toBeLessThanOrEqual(MAX_MOUNT_COMMITS);
  });

  it("renders only the focused cell again when focus moves", () => {
    restoreViewport = mockViewportWidth(WIDE_VIEWPORT);
    const { container } = render(<TaskGrid />);
    const cells = Array.from(
      container.querySelectorAll<HTMLElement>("[data-grid-cell]"),
    );
    const target = cells[cells.length - 1];

    const before = gridCellRenderCount();
    act(() => {
      target.focus();
    });

    expect(gridCellRenderCount() - before).toBeLessThanOrEqual(2);
  });
});
