import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type Task, type TaskType } from "../../../domain/types";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTaskTypesStore } from "../../../stores/taskTypesStore";
import { useTasksStore } from "../../../stores/tasksStore";
import Types from "./Types";

const NOW = new Date(2026, 10, 4, 9, 0, 0);

const originalCreate = useTaskTypesStore.getState().create;

function type(
  id: string,
  name: string | null,
  parentId: string | null,
  order: number,
  systemKey: TaskType["systemKey"] = null,
): TaskType {
  return {
    id,
    name,
    parentId,
    order,
    systemKey,
    color: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function task(id: string, name: string, typeId: string, order: number): Task {
  return {
    id,
    name,
    typeId,
    category: "voluntary",
    intervals: [
      { id: `${id}-i`, taskId: id, start: "2026-11-01", end: null },
    ],
    order,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

describe("Types", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      loaded: true,
    });
    useTaskTypesStore.setState({
      types: [
        type("health", "健康", "voluntary", 0),
        type("run", "跑步", "health", 0),
      ],
      loaded: true,
      create: originalCreate,
    });
    useTasksStore.setState({
      tasks: [task("t1", "晨跑", "run", 0)],
      loaded: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useTaskTypesStore.setState({ create: originalCreate });
  });

  it("renders the tree and hides children when a parent is collapsed", () => {
    const { container } = render(<Types />);

    expect(container.querySelector('[data-type-row="voluntary"]')).toBeInTheDocument();
    expect(container.querySelector('[data-type-row="health"]')).toBeInTheDocument();
    expect(container.querySelector('[data-type-row="run"]')).toBeInTheDocument();

    fireEvent.click(
      container.querySelector('[data-type-collapse="health"]') as Element,
    );

    expect(container.querySelector('[data-type-row="health"]')).toBeInTheDocument();
    expect(container.querySelector('[data-type-row="run"]')).not.toBeInTheDocument();
  });

  it("adds a task with the type preselected", () => {
    const { container } = render(<Types />);
    const row = container.querySelector('[data-type-row="run"]') as HTMLElement;

    fireEvent.click(
      within(row).getByRole("button", { name: "＋任务" }),
    );

    const dialog = screen.getByRole("dialog", { name: "新建任务" });
    expect(
      within(dialog).getByLabelText("类型"),
    ).toHaveValue("run");
  });

  it("creates a custom type under the selected parent", async () => {
    const created = type("sleep", "睡眠", "health", 1);
    const create = vi.fn(async () => created);
    useTaskTypesStore.setState({ create });

    const { container } = render(<Types />);
    fireEvent.click(
      container.querySelector("[data-types-new]") as Element,
    );

    const dialog = screen.getByRole("dialog", { name: "新建类型" });
    fireEvent.change(within(dialog).getByLabelText("类型名称"), {
      target: { value: "睡眠" },
    });
    fireEvent.change(within(dialog).getByLabelText("上级类型"), {
      target: { value: "health" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "睡眠", parentId: "health" }),
    );
  });

  it("does not allow deleting built-in types", () => {
    const { container } = render(<Types />);

    expect(
      container.querySelector(
        '[data-type-row="voluntary"] [data-type-action="delete"]',
      ),
    ).toBeDisabled();
  });
});
