import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type Task, type TaskType } from "../../../domain/types";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTaskTypesStore } from "../../../stores/taskTypesStore";
import { useTasksStore } from "../../../stores/tasksStore";
import Types from "./Types";

const NOW = new Date(2026, 10, 4, 9, 0, 0);

const originalCreate = useTaskTypesStore.getState().create;
const originalMove = useTaskTypesStore.getState().move;
const originalRemove = useTaskTypesStore.getState().remove;
const originalAssignType = useTasksStore.getState().assignType;

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
        type("voluntary", "自愿", null, 0, "voluntary"),
        type("forced", "被迫", null, 1, "forced"),
        type("health", "健康", "voluntary", 2),
        type("run", "跑步", "health", 0),
        type("work", "工作", "forced", 3),
      ],
      loaded: true,
      create: originalCreate,
      move: originalMove,
      remove: originalRemove,
    });
    useTasksStore.setState({
      tasks: [
        task("t1", "晨跑", "run", 0),
        task("t2", "开会", "work", 1),
        task("t3", "背单词", "voluntary", 2),
      ],
      loaded: true,
      assignType: originalAssignType,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useTaskTypesStore.setState({
      create: originalCreate,
      move: originalMove,
      remove: originalRemove,
    });
    useTasksStore.setState({ assignType: originalAssignType });
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

  it("adds multiple existing tasks and excludes the current subtree", async () => {
    const assignType = vi.fn(async () => undefined);
    useTasksStore.setState({ assignType });

    const { container } = render(<Types />);
    const row = container.querySelector('[data-type-row="health"]') as HTMLElement;

    fireEvent.click(row.firstElementChild as Element);
    fireEvent.click(
      container.querySelector('[data-dock-action="add-task"]') as Element,
    );

    const dialog = screen.getByRole("dialog", {
      name: "添加任务到「健康」",
    });
    expect(within(dialog).queryByText("晨跑")).not.toBeInTheDocument();
    expect(within(dialog).getByText("开会")).toBeInTheDocument();
    expect(within(dialog).getByText("背单词")).toBeInTheDocument();

    fireEvent.click(
      dialog.querySelector('[data-assign-task="t2"] input') as Element,
    );
    fireEvent.click(
      dialog.querySelector('[data-assign-task="t3"] input') as Element,
    );
    await act(async () => {
      fireEvent.click(
        dialog.querySelector("[data-assign-submit]") as Element,
      );
    });

    expect(assignType).toHaveBeenCalledWith(
      expect.arrayContaining(["t2", "t3"]),
      "health",
    );
  });

  it("moves a type by dragging it onto another type", () => {
    const move = vi.fn(async () => undefined);
    useTaskTypesStore.setState({ move });

    const { container } = render(<Types />);
    const source = container.querySelector(
      '[data-type-row="health"] > div',
    ) as HTMLElement;
    const target = container.querySelector(
      '[data-type-row="work"] > div',
    ) as HTMLElement;
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 50 });
    fireEvent.drop(target, { dataTransfer, clientY: 50 });

    expect(move).toHaveBeenCalledWith("health", "work", 0);
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

  it("treats built-in types like custom types", () => {
    const { container } = render(<Types />);
    const row = container.querySelector(
      '[data-type-row="voluntary"] > div',
    ) as HTMLElement;

    expect(row).toHaveAttribute("draggable", "true");
    fireEvent.click(row);
    expect(container.querySelector("[data-type-dock]")).toHaveTextContent(
      "自愿",
    );
  });

  it("deletes an empty built-in type", async () => {
    const remove = vi.fn(async () => undefined);
    useTaskTypesStore.setState({ remove });

    const { container } = render(<Types />);
    fireEvent.click(
      container.querySelector('[data-type-row="voluntary"] > div') as Element,
    );
    fireEvent.click(
      container.querySelector('[data-dock-action="delete"]') as Element,
    );

    const dialog = screen.getByRole("dialog", { name: "删除「自愿」" });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "确认删除" }),
      );
    });

    expect(remove).toHaveBeenCalledWith("voluntary", expect.anything());
  });

  it("disables deleting the last remaining type", () => {
    useTaskTypesStore.setState({
      types: [type("voluntary", "自愿", null, 0, "voluntary")],
    });

    const { container } = render(<Types />);

    expect(
      container.querySelector('[data-dock-action="delete"]'),
    ).toBeDisabled();
  });
});
