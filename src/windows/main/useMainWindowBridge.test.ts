import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMainWindowBridge } from "./useMainWindowBridge";

const windowMocks = vi.hoisted(() => ({
  show: vi.fn(async () => undefined),
  unminimize: vi.fn(async () => undefined),
  setFocus: vi.fn(async () => undefined),
}));

const eventMock = vi.hoisted(() => ({
  handler: null as
    | ((payload: { source: "main" | "widget" }) => Promise<void>)
    | null,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMocks,
}));

vi.mock("../../shared/events", () => ({
  onWidgetExpand: vi.fn(
    async (handler: (payload: { source: "main" | "widget" }) => Promise<void>) => {
      eventMock.handler = handler;
      return () => undefined;
    },
  ),
}));

describe("useMainWindowBridge", () => {
  beforeEach(() => {
    windowMocks.show.mockClear();
    windowMocks.unminimize.mockClear();
    windowMocks.setFocus.mockClear();
    eventMock.handler = null;
  });

  it("shows and focuses the main window only for widget events", async () => {
    renderHook(() => useMainWindowBridge());

    await waitFor(() => expect(eventMock.handler).not.toBeNull());

    await eventMock.handler?.({ source: "main" });
    expect(windowMocks.show).not.toHaveBeenCalled();

    await eventMock.handler?.({ source: "widget" });
    expect(windowMocks.show).toHaveBeenCalledTimes(1);
    expect(windowMocks.unminimize).toHaveBeenCalledTimes(1);
    expect(windowMocks.setFocus).toHaveBeenCalledTimes(1);
  });
});
