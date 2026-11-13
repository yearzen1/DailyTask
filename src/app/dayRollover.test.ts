import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logicalToday } from "../domain/date";
import { DEFAULT_SETTINGS } from "../domain/types";
import { useDayStore } from "../stores/dayStore";
import { useSettingsStore } from "../stores/settingsStore";
import { startDayRollover } from "./dayRollover";

const NOW = new Date(2026, 10, 2, 9, 0, 0);

describe("startDayRollover", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    useDayStore.setState({ now: null });
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  function sample(): string {
    const now = useDayStore.getState().now;
    expect(now).not.toBeNull();
    return logicalToday(now as Date, DEFAULT_SETTINGS.dayStartHour);
  }

  it("samples the logical day on start", () => {
    stop = startDayRollover();

    expect(sample()).toBe("2026-11-02");
  });

  it("keeps the same sample within one logical day", () => {
    stop = startDayRollover();
    const first = useDayStore.getState().now;

    vi.setSystemTime(new Date(2026, 10, 2, 23, 30));
    vi.advanceTimersByTime(30_000);

    expect(useDayStore.getState().now).toBe(first);
    expect(sample()).toBe("2026-11-02");
  });

  it("advances after crossing the day start hour", () => {
    stop = startDayRollover();

    vi.setSystemTime(new Date(2026, 10, 3, 3, 59));
    vi.advanceTimersByTime(30_000);
    expect(sample()).toBe("2026-11-02");

    vi.setSystemTime(new Date(2026, 10, 3, 4, 0));
    vi.advanceTimersByTime(30_000);
    expect(sample()).toBe("2026-11-03");
  });

  it("re-syncs as soon as the window regains focus", () => {
    stop = startDayRollover();
    const first = useDayStore.getState().now;

    vi.setSystemTime(new Date(2026, 10, 4, 8, 0));
    window.dispatchEvent(new Event("focus"));

    expect(useDayStore.getState().now).not.toBe(first);
    expect(sample()).toBe("2026-11-04");
  });

  it("stops polling and listening after cleanup", () => {
    stop = startDayRollover();
    stop();
    stop = null;
    const first = useDayStore.getState().now;

    vi.setSystemTime(new Date(2026, 10, 5, 8, 0));
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event("focus"));

    expect(useDayStore.getState().now).toBe(first);
  });
});
