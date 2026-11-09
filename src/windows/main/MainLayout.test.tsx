import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../domain/types";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { useUpdateStore } from "../../stores/updateStore";
import { MainLayout } from "./MainLayout";
import { NAV_ORDER_KEY } from "./navOrder";

const navOrder = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-nav-item]")].map((element) =>
    element.getAttribute("data-nav-item"),
  );

describe("MainLayout", () => {
  const updateSettings = vi.fn(async () => undefined);

  beforeEach(() => {
    useUiStore.setState({ view: "today" });
    useUpdateStore.setState({ available: null });
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      loaded: true,
      update: updateSettings,
    });
    updateSettings.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches between all six views", () => {
    render(<MainLayout />);

    expect(screen.getByRole("heading", { name: "今日" })).toBeInTheDocument();

    for (const [label, heading] of [
      ["任务表", "任务表"],
      ["待办", "待办"],
      ["任务管理", "任务管理"],
      ["统计", "统计"],
      ["设置", "设置"],
      ["今日", "今日"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("marks the active nav item", () => {
    render(<MainLayout />);

    fireEvent.click(screen.getByRole("button", { name: "统计" }));

    expect(screen.getByRole("button", { name: "统计" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a red dot on settings when an update is available", () => {
    useUpdateStore.setState({
      available: { version: "0.1.1", notes: null },
    });
    const { container } = render(<MainLayout />);

    expect(container.querySelector("[data-update-dot]")).toBeInTheDocument();
  });

  it("reorders nav items by dragging and remembers the order", () => {
    const { container } = render(<MainLayout />);
    const nav = container.querySelector("nav");
    if (!nav) {
      throw new Error("nav not found");
    }
    nav.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 228,
        height: 228,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const settings = screen.getByRole("button", { name: "设置" });
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
      });
      return event;
    };

    fireEvent(settings, pointer("pointerdown", 190));
    fireEvent(settings, pointer("pointermove", 100));
    fireEvent(settings, pointer("pointermove", 10));
    fireEvent(settings, pointer("pointerup", 10));

    const expected = ["settings", "today", "grid", "todos", "manage", "stats"];
    expect(navOrder(container)).toEqual(expected);
    expect(JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "[]")).toEqual(
      expected,
    );
    expect(updateSettings).toHaveBeenCalledWith({ navOrder: expected });
  });

  it("prefers the order stored in settings over the localStorage cache", () => {
    localStorage.setItem(
      NAV_ORDER_KEY,
      JSON.stringify(["todos", "today", "grid", "manage", "stats", "settings"]),
    );
    const stored = ["stats", "today", "grid", "todos", "manage", "settings"];
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, navOrder: stored },
      loaded: true,
    });

    const { container } = render(<MainLayout />);

    expect(navOrder(container)).toEqual(stored);
    expect(JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "[]")).toEqual(
      stored,
    );
  });

  it("migrates a custom localStorage order into settings on first mount", () => {
    const stored = ["settings", "today", "grid", "todos", "manage", "stats"];
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(stored));

    render(<MainLayout />);

    expect(updateSettings).toHaveBeenCalledWith({ navOrder: stored });
  });

  it("only shows a grab cursor after a long press", () => {
    vi.useFakeTimers();
    const { container } = render(<MainLayout />);
    const item = container.querySelector(
      '[data-nav-item="today"]',
    ) as HTMLElement;
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
      });
      return event;
    };

    fireEvent(item, pointer("pointerdown", 10));
    expect(item).toHaveClass("cursor-default");
    expect(item).not.toHaveClass("cursor-grab");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(item).toHaveClass("cursor-grab");

    fireEvent(item, pointer("pointerup", 10));
    expect(item).not.toHaveClass("cursor-grab");
  });

  it("restores the saved nav order on mount", () => {
    localStorage.setItem(
      NAV_ORDER_KEY,
      JSON.stringify(["settings", "today", "grid", "todos", "manage", "stats"]),
    );

    const { container } = render(<MainLayout />);

    expect(navOrder(container)[0]).toBe("settings");
  });

  it("moves the focused nav item with Alt+Arrow", () => {
    const { container } = render(<MainLayout />);

    fireEvent.keyDown(screen.getByRole("button", { name: "今日" }), {
      key: "ArrowDown",
      altKey: true,
    });

    expect(navOrder(container).slice(0, 2)).toEqual(["grid", "today"]);
    expect(JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "[]")[1]).toBe(
      "today",
    );
  });
});
