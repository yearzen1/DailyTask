/**
 * 挂件右键菜单的落点计算。
 *
 * 菜单画在独立窗口里，可以越出 260×360 的挂件窗口。定位顺序：
 * 挂件右侧 8px → 挂件左侧 8px → 光标锚点（左右翻转）→ 夹进工作区。
 * 纵向对齐被点的行，下方不够就向上翻。
 *
 * 输入输出都是物理像素；`menu` 用 CSS 像素，按 `scaleFactor` 换算。
 */

export interface PhysicalPoint {
  x: number;
  y: number;
}

export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuPlacementInput {
  /** 菜单卡片的 CSS 尺寸。 */
  menu: { width: number; height: number };
  /** 右键落点（物理像素）。 */
  anchor: PhysicalPoint;
  /** 挂件窗口矩形（物理像素）。 */
  widget: PhysicalRect;
  /** 光标所在显示器的工作区（物理像素）。 */
  workArea: PhysicalRect;
  scaleFactor: number;
}

export interface MenuPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 菜单卡片与挂件窗口之间的间距。 */
export const MENU_GAP = 8;
/** 菜单窗口四周留给投影的透明边距，必须与菜单窗口里的 padding 一致。 */
export const MENU_SHADOW_PAD = 12;
/** 菜单与屏幕工作区边缘的最小距离。 */
export const MENU_EDGE_PAD = 8;
/** 光标锚点偏移：右下 2px，放不下再往左翻。 */
const CURSOR_OFFSET = 2;
/** 纵向让出光标，避免菜单正好盖住被点的行。 */
const ROW_OFFSET = 12;

export function computeMenuPlacement(input: MenuPlacementInput): MenuPlacement {
  const scale = input.scaleFactor > 0 ? input.scaleFactor : 1;
  const px = (value: number) => Math.round(value * scale);

  const width = Math.max(px(input.menu.width), 1);
  const height = Math.max(px(input.menu.height), 1);
  const gap = px(MENU_GAP);
  const edge = px(MENU_EDGE_PAD);
  const shadow = px(MENU_SHADOW_PAD);
  const cursor = px(CURSOR_OFFSET);
  const rowOffset = px(ROW_OFFSET);

  const leftBound = input.workArea.x + edge;
  const rightBound = input.workArea.x + input.workArea.width - edge;
  const topBound = input.workArea.y + edge;
  const bottomBound = input.workArea.y + input.workArea.height - edge;

  const rightOfWidget = input.widget.x + input.widget.width + gap;
  const leftOfWidget = input.widget.x - gap - width;

  let x: number;
  if (rightOfWidget + width <= rightBound) {
    x = rightOfWidget;
  } else if (leftOfWidget >= leftBound) {
    x = leftOfWidget;
  } else {
    x = input.anchor.x + cursor;
    if (x + width > rightBound) {
      x = input.anchor.x - width - cursor;
    }
  }

  let y = input.anchor.y - rowOffset;
  if (y + height > bottomBound) {
    y = input.anchor.y - height + rowOffset;
  }

  return {
    x: clamp(x, leftBound, rightBound - width) - shadow,
    y: clamp(y, topBound, bottomBound - height) - shadow,
    width: width + shadow * 2,
    height: height + shadow * 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
