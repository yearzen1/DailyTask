import { fireEvent, render, screen } from "@testing-library/react";
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
import Stats from "./Stats";

const NOW = new Date(2026, 10, 10, 9, 0, 0);

function task(id: string, name: string, order: number): Task {
  return {
    id,
    name,
    category: order % 2 === 0 ? "voluntary" : "forced",
    intervals: [{ id: `${id}-i`, taskId: id, start: "2026-10-01", end: null }],
    order,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function done(taskId: string, date: string): Checkin {
  return {
    id: `${taskId}-${date}`,
    taskId,
    date,
    status: "done",
    value: null,
    note: null,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

describe("Stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
    useTasksStore.setState({
      loaded: true,
      tasks: [task("a", "跑步", 0), task("b", "开会", 1)],
    });
    useCheckinsStore.setState({
      loaded: true,
      byKey: new Map([
        [checkinKey("a", "2026-11-10"), done("a", "2026-11-10")],
        [checkinKey("a", "2026-11-09"), done("a", "2026-11-09")],
      ]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists each task with streak and 30-day rate", () => {
    const { container } = render(<Stats />);

    const rows = container.querySelectorAll("[data-stats-row]");
    expect(rows).toHaveLength(2);

    const running = container.querySelector(
      '[data-stats-row="a"]',
    ) as HTMLElement;
    expect(running).toHaveAttribute("data-streak", "2");
    expect(running).toHaveAttribute("data-rate", "7");
    expect(running).toHaveTextContent("2 天");
    expect(running).toHaveTextContent("7%");

    const meeting = container.querySelector(
      '[data-stats-row="b"]',
    ) as HTMLElement;
    expect(meeting).toHaveAttribute("data-streak", "0");
    expect(meeting).toHaveTextContent("—");
  });

  it("explains the denominator and shows an empty state without tasks", () => {
    const { container } = render(<Stats />);
    expect(
      screen.getByText(/每段名称独立统计/),
    ).toBeInTheDocument();

    useTasksStore.setState({ tasks: [] });
    container.remove();
    render(<Stats />);

    expect(screen.getByText("还没有任务，先去「任务管理」新建一个")).toBeInTheDocument();
  });

  it("keeps former name periods collapsed until expanded", () => {
    const renamed: Task = {
      ...task("a", "每天两个", 0),
      namePeriods: [
        {
          id: "p1",
          taskId: "a",
          name: "每天一个",
          start: "2026-10-01",
          end: "2026-10-31",
        },
        {
          id: "p2",
          taskId: "a",
          name: "每天两个",
          start: "2026-11-01",
          end: null,
        },
      ],
    };
    useTasksStore.setState({ tasks: [renamed] });

    const { container } = render(<Stats />);

    expect(container.querySelector('[data-stats-row="a"]')).toBeInTheDocument();
    expect(container.querySelector('[data-stats-row="a~p1"]')).toBeNull();
    expect(container.querySelector('[data-stats-row="a"]')).toHaveTextContent(
      "每天两个",
    );

    fireEvent.click(
      container.querySelector(
        '[data-name-history-toggle="a"]',
      ) as HTMLElement,
    );

    const former = container.querySelector('[data-stats-row="a~p1"]');
    expect(former).toBeInTheDocument();
    expect(former).toHaveTextContent("每天一个");
    expect(former).toHaveTextContent("10/01 – 10/31");
  });
});
