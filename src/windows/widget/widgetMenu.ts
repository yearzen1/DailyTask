import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

import type { CellState, CheckinStatus, Theme } from "../../domain/types";
import { t } from "../../shared/i18n";

export type WidgetMenuKind = "task" | "todo";
export type WidgetMenuCurrent = Extract<
  CellState,
  "done" | "missed" | "skipped"
>;

export interface WidgetMenuLabels {
  menu: string;
  copy: string;
  status: string;
  done: string;
  missed: string;
  skipped: string;
  unskip: string;
  clear: string;
  close: string;
}

/** 从挂件窗口交给菜单窗口的完整数据，菜单不读库、不初始化 i18n。 */
export interface WidgetMenuPayload {
  requestId: string;
  kind: WidgetMenuKind;
  id: string;
  name: string;
  current: WidgetMenuCurrent | null;
  theme: Theme;
  labels: WidgetMenuLabels;
  anchor: { x: number; y: number };
  widget: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export interface OpenWidgetMenuRequest {
  kind: WidgetMenuKind;
  id: string;
  name: string;
  state: CellState;
  theme: Theme;
  clientX: number;
  clientY: number;
}

/** 打开菜单：把落点、挂件矩形和工作区一起带过去，菜单窗口自己算位置。 */
export async function openWidgetMenu(
  request: OpenWidgetMenuRequest,
): Promise<void> {
  const appWindow = getCurrentWindow();
  const [position, size, monitor] = await Promise.all([
    appWindow.outerPosition(),
    appWindow.outerSize(),
    currentMonitor(),
  ]);
  const scaleFactor =
    window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const widget = {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
  const workArea = monitor
    ? {
        x: monitor.workArea.position.x,
        y: monitor.workArea.position.y,
        width: monitor.workArea.size.width,
        height: monitor.workArea.size.height,
      }
    : widget;

  await invoke("open_widget_menu", {
    payload: {
      requestId: menuRequestId(),
      kind: request.kind,
      id: request.id,
      name: request.name,
      current: currentOf(request.state),
      theme: request.theme,
      labels: widgetMenuLabels(request.kind),
      anchor: {
        x: position.x + request.clientX * scaleFactor,
        y: position.y + request.clientY * scaleFactor,
      },
      widget,
      workArea,
      scaleFactor,
    } satisfies WidgetMenuPayload,
  });
}

export async function closeWidgetMenu(): Promise<void> {
  await invoke("close_widget_menu");
}

/** 预建隐藏的菜单窗口，把建 WebView 的时间挪到第一次右键之前。 */
export async function ensureWidgetMenu(): Promise<void> {
  await invoke("ensure_widget_menu");
}

function menuRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function sendWidgetMenuAction(action: {
  kind: WidgetMenuKind;
  id: string;
  action: "copy" | "status";
  status?: CheckinStatus | null;
  copied?: boolean;
}): Promise<void> {
  await invoke("widget_menu_action", { action });
}

/** pending / none 不显示「当前」勾选，只有三种明确状态显示。 */
export function currentOf(state: CellState): WidgetMenuCurrent | null {
  return state === "done" || state === "missed" || state === "skipped"
    ? state
    : null;
}

export function widgetMenuLabels(kind: WidgetMenuKind): WidgetMenuLabels {
  return {
    menu: t(kind === "task" ? "widget.menu" : "todos.menu"),
    copy: t("common.copyName"),
    status: t("widget.menu.status"),
    done: t("checkin.done"),
    missed: t("checkin.missed"),
    skipped: t("checkin.skipped"),
    unskip: t("today.unskip"),
    clear: t("widget.menu.clear"),
    close: t("common.closeMenu"),
  };
}
