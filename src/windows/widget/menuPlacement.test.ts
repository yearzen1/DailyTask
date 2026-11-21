import { describe, expect, it } from "vitest";

import {
  MENU_EDGE_PAD,
  MENU_GAP,
  MENU_SHADOW_PAD,
  computeMenuPlacement,
  type MenuPlacementInput,
} from "./menuPlacement";

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const MENU = { width: 196, height: 220 };

function place(patch: Partial<MenuPlacementInput> = {}) {
  return computeMenuPlacement({
    menu: MENU,
    anchor: { x: 1000, y: 500 },
    widget: { x: 1660, y: 300, width: 260, height: 360 },
    workArea: WORK_AREA,
    scaleFactor: 1,
    ...patch,
  });
}

/** 菜单卡片（去掉投影留白）的左边界。 */
const cardLeft = (x: number, scale = 1) => x + MENU_SHADOW_PAD * scale;
const cardTop = (y: number, scale = 1) => y + MENU_SHADOW_PAD * scale;

describe("computeMenuPlacement", () => {
  it("hangs the menu outside the widget on the right when there is room", () => {
    const widget = { x: 900, y: 300, width: 260, height: 360 };

    const placement = place({ widget });

    expect(cardLeft(placement.x)).toBe(widget.x + widget.width + MENU_GAP);
    expect(placement.width).toBe(MENU.width + MENU_SHADOW_PAD * 2);
    expect(placement.height).toBe(MENU.height + MENU_SHADOW_PAD * 2);
  });

  it("falls back to the left side when the widget sits on the right edge", () => {
    const widget = { x: 1660, y: 300, width: 260, height: 360 };

    const placement = place({ widget });

    expect(cardLeft(placement.x)).toBe(widget.x - MENU_GAP - MENU.width);
  });

  it("uses the cursor when neither side fits and flips left near the right edge", () => {
    const widget = { x: 200, y: 300, width: 1600, height: 360 };

    const placement = place({
      widget,
      anchor: { x: 1800, y: 500 },
    });

    expect(cardLeft(placement.x)).toBe(1800 - MENU.width - 2);
  });

  it("flips up when the menu would leave the bottom of the work area", () => {
    const widget = { x: 1660, y: 300, width: 260, height: 360 };

    const placement = place({ widget, anchor: { x: 1700, y: 1020 } });

    expect(cardTop(placement.y)).toBeLessThan(1020);
    expect(cardTop(placement.y) + MENU.height).toBeLessThanOrEqual(1040 - MENU_EDGE_PAD);
  });

  it("keeps the menu inside the work area and aligns the row", () => {
    const widget = { x: 1660, y: 0, width: 260, height: 200 };

    const placement = place({ widget, anchor: { x: 1700, y: 6 } });

    expect(cardTop(placement.y)).toBe(MENU_EDGE_PAD);
    expect(cardLeft(placement.x) + MENU.width).toBeLessThanOrEqual(
      1920 - MENU_EDGE_PAD,
    );
  });

  it("scales CSS sizes and offsets with the display scale factor", () => {
    const widget = { x: 3320, y: 600, width: 520, height: 720 };

    const placement = place({
      widget,
      scaleFactor: 2,
      anchor: { x: 3400, y: 1000 },
      workArea: { x: 0, y: 0, width: 3840, height: 2080 },
    });

    // 200% 缩放下菜单 196×220 CSS → 392×440 物理，留白 12 CSS → 24 物理。
    expect(placement.width).toBe(392 + 48);
    expect(placement.height).toBe(440 + 48);
    expect(cardLeft(placement.x, 2)).toBe(widget.x - 16 - 392);
  });
});
