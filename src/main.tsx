import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { initApp, type AppData } from "./app/init";
import { startDayRollover } from "./app/dayRollover";
import { startCrossWindowSync } from "./app/sync";
import App from "./App";
import { rotateDailyBackup } from "./db/backup";
import { prepareWidgetStartup } from "./windows/widget/capsule";
import { useCheckinsStore } from "./stores/checkinsStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useTasksStore } from "./stores/tasksStore";
import { setLocale, t } from "./shared/i18n";
import { useTodosStore } from "./stores/todosStore";
import { applyTheme } from "./ui/theme";
import { windowTarget } from "./windows/windowTarget";
import { Widget } from "./windows/widget/Widget";
import "./styles.css";

function hydrate(data: AppData): void {
  useSettingsStore.getState().hydrate(data.settings);
  useTasksStore.getState().hydrate(data.tasks);
  useCheckinsStore.getState().hydrate(data.checkins);
  useTodosStore.getState().hydrate(data.todos);
}

const target = windowTarget(window.location.search);
if (target === "widget") {
  document.documentElement.dataset.window = "widget";
  // 每次启动都从胶囊开始；停靠侧仍读上次记住的值。
  prepareWidgetStartup();
}

// 开发构建带 Dev 后缀，任务栏里能和安装版区分开。
if (import.meta.env.DEV) {
  void getCurrentWindow()
    .setTitle(target === "widget" ? "DailyTask Dev Widget" : "DailyTask Dev")
    .catch(() => undefined);
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <main className="flex h-full items-center justify-center text-sm text-stone-500">
    {t("app.loading")}
  </main>,
);

void initApp()
  .then((data) => {
    hydrate(data);
    setLocale(data.settings.language);
    applyTheme(data.settings.theme);
    // 跨日后各窗口自己把「今天」推到新的一天，不依赖任何点击。
    startDayRollover();
    void (target === "widget" ? Promise.resolve() : rotateDailyBackup()).catch(
      (error: unknown) => {
        console.error("[backup] 每日备份失败", error);
      },
    );
    void startCrossWindowSync().catch((error: unknown) => {
      console.error("[sync] 跨窗口同步启动失败", error);
    });
    root.render(
      <React.StrictMode>
        {target === "widget" ? <Widget /> : <App />}
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("[init] 初始化失败", error);
    root.render(
      <main className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-600">
        <p>{t("app.initFailed")}</p>
        <p className="text-stone-500">{t("app.initFailedHint")}</p>
      </main>,
    );
  });
