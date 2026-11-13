import { useMemo } from "react";
import { create } from "zustand";

import { logicalToday } from "../domain/date";

export interface DayState {
  /** 最近一次采样的时刻；null = 还没同步过，调用方用 new Date() 兜底。 */
  now: Date | null;
  /** 逻辑日变化时才写入，同一天内的重复调用不触发重渲染。 */
  sync: (now: Date, dayStartHour: number) => void;
}

/**
 * 全应用唯一的「现在」。`app/dayRollover` 负责把 now 推到新的逻辑日，
 * 所有 useMemo 缓存了「今天」的 selector 都订阅这里，跨日不再等用户点一下。
 */
export const useDayStore = create<DayState>()((set, get) => ({
  now: null,
  sync: (now, dayStartHour) => {
    const current = get().now;
    if (
      current !== null &&
      logicalToday(now, dayStartHour) === logicalToday(current, dayStartHour)
    ) {
      return;
    }
    set({ now });
  },
}));

/** 当前采样时刻；未同步时退回挂载时刻，测试里的 fake timers 也能拿到正确日期。 */
export function useDayNow(): Date {
  const now = useDayStore((state) => state.now);
  return useMemo(() => now ?? new Date(), [now]);
}
