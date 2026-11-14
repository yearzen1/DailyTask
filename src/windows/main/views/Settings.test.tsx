import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../../domain/types";
import { setLocale } from "../../../shared/i18n";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useTodosStore } from "../../../stores/todosStore";
import { useTransferStore } from "../../../stores/transferStore";
import { useUpdateStore } from "../../../stores/updateStore";
import Settings from "./Settings";

vi.mock("../../../shared/env", () => ({ isDevBuild: false }));

const autostart = vi.hoisted(() => ({
  isEnabled: vi.fn(async () => false),
  enable: vi.fn(async () => undefined),
  disable: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-autostart", () => autostart);
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));

describe("Settings", () => {
  const update = vi.fn(async (patch: Partial<typeof DEFAULT_SETTINGS>) => {
    void patch;
  });
  const exportToFile = vi.fn(async () => "C:/Users/me/dailytask.json" as string | null);
  const importFromFile = vi.fn(async () => ({
    path: "C:/Users/me/backup.json",
    counts: { tasks: 2, namePeriods: 2, intervals: 3, checkins: 4, todos: 5 },
  }));
  const reload = vi.fn(async () => undefined);
  const checkForUpdate = vi.fn(async () => undefined);
  const installUpdate = vi.fn(async () => undefined);

  beforeEach(() => {
    update.mockClear();
    exportToFile.mockClear();
    importFromFile.mockClear();
    reload.mockClear();
    checkForUpdate.mockClear();
    installUpdate.mockClear();
    autostart.isEnabled.mockReset().mockResolvedValue(false);
    autostart.enable.mockClear();
    autostart.disable.mockClear();

    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      loaded: true,
      update,
      reload,
    });
    useTasksStore.setState({ reload });
    useCheckinsStore.setState({ reload });
    useTodosStore.setState({ reload });
    useTransferStore.setState({
      exporting: false,
      importing: false,
      exportToFile,
      importFromFile,
    });
    useUpdateStore.setState({
      available: null,
      checking: false,
      installing: false,
      checked: false,
      error: null,
      pending: null,
      checkForUpdate,
      install: installUpdate,
    });
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    setLocale("zh-CN");
  });

  it("does not render the footer version line inside the settings card", () => {
    const { container } = render(<Settings />);

    expect(container).not.toHaveTextContent("DailyTask v");
  });

  it("marks the configured theme as pressed", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, theme: "light" },
    });

    render(<Settings />);

    expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("applies and persists a theme switch", () => {
    const { container } = render(<Settings />);

    fireEvent.click(
      container.querySelector('[data-theme-option="dark"]') as Element,
    );

    expect(update).toHaveBeenCalledWith({ theme: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("switches to English and persists the language", () => {
    const { container } = render(<Settings />);

    fireEvent.click(
      container.querySelector('[data-language-option="en"]') as Element,
    );

    expect(update).toHaveBeenCalledWith({ language: "en" });
    expect(document.documentElement.lang).toBe("en");
    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("resolves system back to the OS preference", () => {
    const { container } = render(<Settings />);

    fireEvent.click(
      container.querySelector('[data-theme-option="system"]') as Element,
    );

    expect(update).toHaveBeenCalledWith({ theme: "system" });
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
  });

  it("toggles auto-settle and the day start hour", () => {
    const { container } = render(<Settings />);

    fireEvent.click(
      container.querySelector('[data-setting="auto-settle"]') as Element,
    );
    expect(update).toHaveBeenCalledWith({ autoSettleMissed: false });

    fireEvent.change(container.querySelector('[data-setting="day-start"]') as Element, {
      target: { value: "2" },
    });
    expect(update).toHaveBeenCalledWith({ dayStartHour: 2 });
  });

  it("toggles the widget pin", () => {
    const { container } = render(<Settings />);

    fireEvent.click(
      container.querySelector('[data-setting="always-on-top"]') as Element,
    );

    expect(update).toHaveBeenCalledWith({ alwaysOnTop: false });
  });

  it("reads the OS autostart state and enables it", async () => {
    autostart.isEnabled.mockResolvedValueOnce(false);
    const { container } = render(<Settings />);
    const toggle = container.querySelector(
      '[data-setting="auto-launch"]',
    ) as HTMLElement;

    await waitFor(() => expect(autostart.isEnabled).toHaveBeenCalled());
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => expect(autostart.enable).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({ autoLaunch: true });
  });

  it("reflects an autostart entry that already exists", async () => {
    autostart.isEnabled.mockResolvedValueOnce(true);
    const { container } = render(<Settings />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-setting="auto-launch"]'),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("exports JSON and reports the saved path", async () => {
    const { container } = render(<Settings />);

    fireEvent.click(container.querySelector("[data-export-json]") as Element);

    await waitFor(() => expect(exportToFile).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        container.querySelector("[data-transfer-note]"),
      ).toHaveTextContent("已导出到 C:/Users/me/dailytask.json"),
    );
  });

  it("reports a failed export", async () => {
    exportToFile.mockRejectedValueOnce(new Error("disk full"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { container } = render(<Settings />);

    fireEvent.click(container.querySelector("[data-export-json]") as Element);

    await waitFor(() =>
      expect(
        container.querySelector("[data-transfer-note]"),
      ).toHaveTextContent("导出失败，请重试"),
    );
    consoleError.mockRestore();
  });

  it("imports a backup and reloads every store", async () => {
    const { container } = render(<Settings />);

    fireEvent.click(container.querySelector("[data-import-json]") as Element);

    await waitFor(() =>
      expect(
        container.querySelector("[data-transfer-note]"),
      ).toHaveTextContent("已导入 2 个任务 / 4 条打卡 / 5 条待办"),
    );
    expect(reload).toHaveBeenCalledTimes(4);
  });

  it("reports a failed import", async () => {
    importFromFile.mockRejectedValueOnce(new Error("invalid-json"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { container } = render(<Settings />);

    fireEvent.click(container.querySelector("[data-import-json]") as Element);

    await waitFor(() =>
      expect(
        container.querySelector("[data-transfer-note]"),
      ).toHaveTextContent("导入失败"),
    );
    consoleError.mockRestore();
  });

  it("checks for updates and installs an available one", () => {
    const { container, rerender } = render(<Settings />);

    fireEvent.click(container.querySelector("[data-check-update]") as Element);
    expect(checkForUpdate).toHaveBeenCalled();

    useUpdateStore.setState({
      available: { version: "0.1.1", notes: null },
      checked: true,
    });
    rerender(<Settings />);

    expect(container.querySelector("[data-update-available]")).toHaveTextContent(
      "发现新版本 v0.1.1",
    );
    fireEvent.click(container.querySelector("[data-install-update]") as Element);
    expect(installUpdate).toHaveBeenCalled();
  });

  it("shows the up-to-date hint and check errors", () => {
    useUpdateStore.setState({ checked: true });
    const { container, rerender } = render(<Settings />);

    expect(container.querySelector("[data-update-latest]")).toHaveTextContent(
      "已是最新版本",
    );

    useUpdateStore.setState({ error: "check", checked: false });
    rerender(<Settings />);

    expect(container.querySelector("[data-update-error]")).toHaveTextContent(
      "检查更新失败",
    );
  });
});
