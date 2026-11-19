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

function task(
  id: string,
  name: string,
  typeId: string,
  order: number,
  interval: { start: string; end: string | null } = {
    start: "2026-11-01",
    end: null,
  },
): Task {
  return {
    id,
    name,
    typeId,
    category: "voluntary",
    intervals: [{ id: `${id}-i`, taskId: id, ...interval }],
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

  it("shows a top-level type name once in the dock", () => {
    const { container } = render(<Types />);
    const dock = container.querySelector("[data-type-dock]") as HTMLElement;

    expect(dock).toHaveTextContent("自愿");
    expect(dock.textContent?.match(/自愿/g)).toHaveLength(1);
  });

  it("shows ancestors in the breadcrumb and the type name once", () => {
    const { container } = render(<Types />);
    fireEvent.click(
      container.querySelector('[data-type-row="run"] > div') as Element,
    );

    const dock = container.querySelector("[data-type-dock]") as HTMLElement;
    expect(dock).toHaveTextContent("自愿 / 健康");
    expect(dock.querySelector("h2")).toHaveTextContent("跑步");
    expect(dock.textContent?.match(/跑步/g)).toHaveLength(1);
  });

  it("renders selectable dock tasks with a checkbox and an icon", () => {
    const { container } = render(<Types />);
    const list = container.querySelector(
      "[data-type-task-list]",
    ) as HTMLElement;

    expect(list).toHaveClass("overflow-y-auto");
    const rows = Array.from(list.querySelectorAll("li"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelector('input[type="checkbox"]')).not.toBeNull();
      expect(row.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("caps the dock height so the tree stays visible", () => {
    const { container } = render(<Types />);

    expect(container.querySelector("[data-type-dock]")).toHaveClass(
      "max-h-[45%]",
    );
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

  it("hides disabled tasks from the add-task dialog", () => {
    useTasksStore.setState({
      tasks: [
        task("t1", "晨跑", "run", 0),
        task("t2", "开会", "work", 1),
        task("t3", "背单词", "voluntary", 2),
        task("t4", "旧任务", "voluntary", 3, {
          start: "2026-10-01",
          end: "2026-10-31",
        }),
        task("t5", "未来任务", "voluntary", 4, {
          start: "2026-12-01",
          end: null,
        }),
      ],
    });

    const { container } = render(<Types />);
    const row = container.querySelector('[data-type-row="health"]') as HTMLElement;

    fireEvent.click(row.firstElementChild as Element);
    fireEvent.click(
      container.querySelector('[data-dock-action="add-task"]') as Element,
    );

    const dialog = screen.getByRole("dialog", {
      name: "添加任务到「健康」",
    });
    expect(within(dialog).queryByText("旧任务")).not.toBeInTheDocument();
    expect(within(dialog).getByText("未来任务")).toBeInTheDocument();
  });

  it("enables move-out after selecting a single dock task", () => {
    const { container } = render(<Types />);

    fireEvent.click(
      container.querySelector('[data-dock-task-check="t3"]') as Element,
    );

    const moveOut = container.querySelector(
      '[data-dock-action="move-out"]',
    ) as HTMLButtonElement;
    expect(moveOut).toBeEnabled();
    expect(moveOut).toHaveTextContent("移出 1 个");
  });

  it("moves selected dock tasks out to another type", async () => {
    const assignType = vi.fn(async () => undefined);
    useTasksStore.setState({
      assignType,
      tasks: [
        ...useTasksStore.getState().tasks,
        task("t4", "阅读", "voluntary", 3),
      ],
    });

    const { container } = render(<Types />);
    const dock = container.querySelector("[data-type-dock]") as HTMLElement;

    fireEvent.click(
      dock.querySelector("[data-dock-select-all]") as Element,
    );
    fireEvent.click(
      dock.querySelector('[data-dock-action="move-out"]') as Element,
    );

    const dialog = screen.getByRole("dialog", {
      name: "移出「自愿」的任务",
    });
    const select = dialog.querySelector(
      '[data-type-picker="move-out"]',
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "forced",
      "work",
    ]);

    fireEvent.change(select, { target: { value: "work" } });
    await act(async () => {
      fireEvent.click(
        dialog.querySelector("[data-move-out-submit]") as Element,
      );
    });

    expect(assignType).toHaveBeenCalledWith(["t3", "t4"], "work");
  });

  it("disables moving tasks out when no target type exists", () => {
    useTaskTypesStore.setState({
      types: [type("voluntary", "自愿", null, 0, "voluntary")],
    });

    const { container } = render(<Types />);

    expect(
      container.querySelector('[data-dock-action="move-out"]'),
    ).toBeDisabled();
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
