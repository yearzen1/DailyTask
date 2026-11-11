import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import {
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";

/** 胶囊态：横向小标签；展开态：原挂件尺寸。 */
export const CAPSULE_WIDTH = 96;
export const CAPSULE_HEIGHT = 36;
export const EXPANDED_WIDTH = 260;
export const EXPANDED_HEIGHT = 360;
export const CAPSULE_STORAGE_KEY = "dailytask.widget.collapsed";
export const CAPSULE_SIDE_KEY = "dailytask.widget.side";

export type WidgetSide = "left" | "right";

export interface CapsuleMenuOptions {
  expandLabel: string;
  hideLabel: string;
  onExpand: () => void;
}

/**
 * 原生菜单在 Rust 侧存活，前端必须一直持有引用到菜单关闭，
 * 否则 popup 返回后菜单可能被回收、点击项不触发。
 */
let activeCapsuleMenu: Menu | null = null;
let capsuleMenuSeq = 0;

/**
 * 胶囊窗口只有 96×36，HTML 菜单会被窗口边界裁切，
 * 所以右键菜单走 Tauri 原生 popup；样式由系统决定。
 */
export async function openCapsuleMenu({
  expandLabel,
  hideLabel,
  onExpand,
}: CapsuleMenuOptions): Promise<void> {
  const suffix = ++capsuleMenuSeq;
  const expandItem = await MenuItem.new({
    id: `capsule-expand-${suffix}`,
    text: expandLabel,
    action: () => {
      activeCapsuleMenu = null;
      onExpand();
    },
  });
  const hideItem = await MenuItem.new({
    id: `capsule-hide-${suffix}`,
    text: hideLabel,
    action: () => {
      activeCapsuleMenu = null;
      // 命令会销毁挂件窗口；调用方只关心触发，失败时记录日志即可。
      void invoke("hide_widget").catch((error: unknown) => {
        console.error("[widget] 隐藏挂件失败", error);
      });
    },
  });

  activeCapsuleMenu = await Menu.new({ items: [expandItem, hideItem] });
  await activeCapsuleMenu.popup();
}

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetPlacement {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** 窗口中心落在工作区左半 → 左停靠，否则右停靠。 */
export function nearestSide(
  left: number,
  width: number,
  workArea: WorkArea,
): WidgetSide {
  const center = left + width / 2;
  return center < workArea.x + workArea.width / 2 ? "left" : "right";
}

/**
 * 物理像素计算：贴住指定侧的屏幕边缘，纵向沿用当前 y 并夹在工作区内。
 * 收起/展开只改尺寸；边缘那条边始终固定。
 */
export function computeWidgetPlacement(
  workArea: WorkArea,
  scaleFactor: number,
  side: WidgetSide,
  currentY: number,
  collapsed: boolean,
): WidgetPlacement {
  const width = Math.round(
    (collapsed ? CAPSULE_WIDTH : EXPANDED_WIDTH) * scaleFactor,
  );
  const height = Math.round(
    (collapsed ? CAPSULE_HEIGHT : EXPANDED_HEIGHT) * scaleFactor,
  );
  const x =
    side === "right" ? workArea.x + workArea.width - width : workArea.x;
  const maxY = workArea.y + workArea.height - height;
  const y = Math.min(Math.max(currentY, workArea.y), Math.max(workArea.y, maxY));

  return { width, height, x, y };
}

export function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(CAPSULE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsedPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(CAPSULE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // 隐私模式或存储被禁用时忽略，不影响本次会话。
  }
}

/** 每次应用启动时把挂件恢复为胶囊态（停靠侧仍沿用上次）。 */
export function prepareWidgetStartup(): void {
  writeCollapsedPreference(true);
}

export function readSidePreference(): WidgetSide {
  try {
    return localStorage.getItem(CAPSULE_SIDE_KEY) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

export function writeSidePreference(side: WidgetSide): void {
  try {
    localStorage.setItem(CAPSULE_SIDE_KEY, side);
  } catch {
    // 同上。
  }
}

/**
 * 把窗口调成胶囊或展开尺寸并贴到指定侧；不传 side 时按当前窗口中心判断。
 * 返回实际使用的停靠侧，供调用方持久化。
 */
export async function applyWidgetLayout(
  collapsed: boolean,
  requestedSide?: WidgetSide,
): Promise<WidgetSide | null> {
  const monitor = await currentMonitor();
  if (!monitor) {
    return null;
  }

  const window = getCurrentWindow();
  const position = await window.outerPosition();
  const size = await window.outerSize();
  const workArea = monitor.workArea;
  const area: WorkArea = {
    x: workArea.position.x,
    y: workArea.position.y,
    width: workArea.size.width,
    height: workArea.size.height,
  };
  const side =
    requestedSide ?? nearestSide(position.x, size.width, area);
  const placement = computeWidgetPlacement(
    area,
    monitor.scaleFactor,
    side,
    position.y,
    collapsed,
  );

  await window.setSize(
    new PhysicalSize(placement.width, placement.height),
  );
  await window.setPosition(new PhysicalPosition(placement.x, placement.y));

  return side;
}
