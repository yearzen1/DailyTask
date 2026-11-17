import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NAV_ORDER,
  NAV_ORDER_KEY,
  moveNavItem,
  readNavOrder,
  sanitizeNavOrder,
  writeNavOrder,
} from "./navOrder";

describe("sanitizeNavOrder", () => {
  it("drops unknown and duplicate views", () => {
    expect(
      sanitizeNavOrder(["todos", "nope", "todos", 42, "today"]),
    ).toEqual([
      "todos",
      "today",
      "grid",
      "manage",
      "types",
      "stats",
      "settings",
    ]);
  });

  it("appends missing views in the default order", () => {
    expect(sanitizeNavOrder(["settings"])).toEqual([
      "settings",
      "today",
      "grid",
      "todos",
      "manage",
      "types",
      "stats",
    ]);
  });

  it("falls back to the default order for non-arrays", () => {
    expect(sanitizeNavOrder(null)).toEqual(DEFAULT_NAV_ORDER);
    expect(sanitizeNavOrder({ order: [] })).toEqual(DEFAULT_NAV_ORDER);
  });
});

describe("nav order storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default order when nothing is stored", () => {
    expect(readNavOrder()).toEqual(DEFAULT_NAV_ORDER);
  });

  it("round-trips a custom order", () => {
    const order = moveNavItem(DEFAULT_NAV_ORDER, 5, 0);

    writeNavOrder(order);

    expect(JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "[]")).toEqual(
      order,
    );
    expect(readNavOrder()).toEqual(order);
  });

  it("recovers from invalid JSON", () => {
    localStorage.setItem(NAV_ORDER_KEY, "{oops");

    expect(readNavOrder()).toEqual(DEFAULT_NAV_ORDER);
  });
});

describe("moveNavItem", () => {
  it("moves an item down and up", () => {
    expect(moveNavItem(DEFAULT_NAV_ORDER, 0, 2)[2]).toBe("today");
    expect(moveNavItem(DEFAULT_NAV_ORDER, 6, 1)[1]).toBe("settings");
  });

  it("returns the same array when the position does not change", () => {
    expect(moveNavItem(DEFAULT_NAV_ORDER, 2, 2)).toBe(DEFAULT_NAV_ORDER);
  });

  it("clamps out-of-range targets", () => {
    expect(moveNavItem(DEFAULT_NAV_ORDER, 5, 99).at(-1)).toBe("stats");
  });
});
