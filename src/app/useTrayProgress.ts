import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { logicalToday } from "../domain/date";
import { combineProgress, dayProgress } from "../domain/settle";
import { useCheckinsStore } from "../stores/checkinsStore";
import { useDayNow } from "../stores/dayStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTasksStore } from "../stores/tasksStore";
import { useTodosStore } from "../stores/todosStore";
import { dueTodosFor, todoStatOf } from "../stores/selectors/today";
import { useLocale, useT } from "../ui/useT";

/** 把今日进度写进托盘菜单；主窗口隐藏时也能跟着打卡更新。 */
export function useTrayProgress(): void {
  const tasks = useTasksStore((state) => state.tasks);
  const checkins = useCheckinsStore((state) => state.byKey);
  const settings = useSettingsStore((state) => state.settings);
  const todos = useTodosStore((state) => state.todos);
  const t = useT();
  const locale = useLocale();
  const now = useDayNow();

  const today = logicalToday(now, settings.dayStartHour);
  const progress = combineProgress(
    dayProgress(tasks, checkins, today, settings, today),
    todoStatOf(dueTodosFor(todos, today, settings)),
  );
  const total = progress.applicable - progress.skipped;
  const done = progress.done;

  useEffect(() => {
    void invoke("set_tray_progress", {
      text: t("tray.progress", { done, total }),
    }).catch((error: unknown) => {
      console.error("[tray] 更新进度失败", error);
    });
  }, [done, total, locale, t]);
}
