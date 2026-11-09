import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("./windows/main/useMainWindowBridge", () => ({
  useMainWindowBridge: () => undefined,
}));

vi.mock("./app/useUpdateCheck", () => ({
  useUpdateCheck: () => undefined,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

describe("App", () => {
  it("renders the main layout with today view", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  });
});
