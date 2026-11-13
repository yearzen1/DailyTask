import { useDayStore } from "../stores/dayStore";
import { useSettingsStore } from "../stores/settingsStore";

/** 轮询间隔：逻辑日边界最多晚这么久，休眠/改系统时间也能在下一次采样纠回来。 */
export const DAY_CHECK_INTERVAL_MS = 30_000;

/**
 * 跨日刷新：定时采样当前逻辑日，变化后写 `dayStore`，
 * 今日页、任务表、统计、待办、任务管理、挂件与托盘进度都会跟着重算。
 * 轮询而不是精确 setTimeout 到 dayStartHour：休眠会让绝对定时器漂移。
 */
export function startDayRollover(): () => void {
  const sync = () => {
    const { dayStartHour } = useSettingsStore.getState().settings;
    useDayStore.getState().sync(new Date(), dayStartHour);
  };

  sync();
  const timer = window.setInterval(sync, DAY_CHECK_INTERVAL_MS);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", sync);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", sync);
    document.removeEventListener("visibilitychange", sync);
  };
}
