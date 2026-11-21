import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetMenuWindow } from "./WidgetMenuWindow";

const holder = vi.hoisted(() => ({
  payload: null as unknown,
}));

const invokeMock = vi.hoisted(() =>
  vi.fn(async (command: string) => {
    if (command === "read_widget_menu") {
      return holder.payload;
    }
    return undefined;
  }),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const PAYLOAD = {
  kind: "task",
  id: "t1",
  name: "跑步",
  current: "done",
  theme: "light",
  labels: {
    menu: "任务操作",
    copy: "复制名字",
    status: "今日状态",
    done: "已完成",
    missed: "未完成",
    skipped: "今天不做",
    unskip: "取消",
    clear: "清除",
    close: "关闭菜单",
  },
  anchor: { x: 1700, y: 400 },
  widget: { x: 1600, y: 300, width: 260, height: 360 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
};

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

let rectSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  holder.payload = PAYLOAD;
  invokeMock.mockClear();
  document.documentElement.dataset.theme = "light";
  rectSpy = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 0,
      width: 196,
      height: 220,
      top: 0,
      left: 0,
      right: 196,
      bottom: 220,
      toJSON: () => ({}),
    } as DOMRect);
});

afterEach(() => {
  rectSpy.mockRestore();
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as { clipboard?: Clipboard }).clipboard;
  }
});

async function renderMenu(name = PAYLOAD.name) {
  render(<WidgetMenuWindow />);
  return screen.findByText(name);
}

describe("WidgetMenuWindow", () => {
  it("renders the menu and reports its measured size for placement", async () => {
    await renderMenu();

    expect(screen.getByRole("menu", { name: "任务操作" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "复制名字" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("place_widget_menu", {
        x: 1396 - 12,
        y: 388 - 12,
        width: 196 + 24,
        height: 220 + 24,
      }),
    );
  });

  it("marks the current status and hides it from other rows", async () => {
    await renderMenu();

    const done = screen.getByRole("menuitem", { name: /已完成/ });
    expect(done).toHaveTextContent("✓");
    expect(screen.getByRole("menuitem", { name: /未完成/ })).not.toHaveTextContent(
      "✓",
    );
  });

  it("sends the chosen status back to the widget", async () => {
    await renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /未完成/ }));

    expect(invokeMock).toHaveBeenCalledWith("widget_menu_action", {
      action: {
        kind: "task",
        id: "t1",
        action: "status",
        status: "missed",
      },
    });
  });

  it("turns 今天不做 into 取消 when the task is already skipped", async () => {
    holder.payload = { ...PAYLOAD, current: "skipped" };
    await renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /取消/ }));

    expect(invokeMock).toHaveBeenCalledWith("widget_menu_action", {
      action: {
        kind: "task",
        id: "t1",
        action: "status",
        status: null,
      },
    });
  });

  it("copies the name in the focused menu window and reports the result", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "复制名字" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("跑步");
    expect(invokeMock).toHaveBeenCalledWith("widget_menu_action", {
      action: {
        kind: "task",
        id: "t1",
        action: "copy",
        copied: true,
      },
    });
  });

  it("closes on Escape and from the close button", async () => {
    await renderMenu();
    invokeMock.mockClear();

    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => undefined);
    expect(invokeMock).toHaveBeenCalledWith("close_widget_menu");

    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "关闭菜单" }));
    await act(async () => undefined);
    expect(invokeMock).toHaveBeenCalledWith("close_widget_menu");
  });

  it("renders a todo menu with copy only", async () => {
    holder.payload = {
      ...PAYLOAD,
      kind: "todo",
      id: "买猫粮",
      name: "买猫粮",
      current: null,
      labels: { ...PAYLOAD.labels, menu: "待办操作" },
    };
    await renderMenu("买猫粮");

    expect(screen.getByRole("menu", { name: "待办操作" })).toBeInTheDocument();
    expect(screen.queryByText("今日状态")).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
});
