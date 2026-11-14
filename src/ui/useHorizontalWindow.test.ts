import { describe, expect, it } from "vitest";

import {
  computeHorizontalWindow,
  computeHorizontalWindowByOffsets,
  scrollLeftForToday,
} from "./useHorizontalWindow";
import { buildColumnOffsets, findColumnAtOffset } from "./gridColumnLayout";

describe("computeHorizontalWindow", () => {
  it("renders the first screen plus two screens of overscan", () => {
    const win = computeHorizontalWindow(0, 832, 1000, 32);

    expect(win.start).toBe(0);
    expect(win.end).toBe(21 + 42);
    expect(win.leftPad).toBe(0);
    expect(win.rightPad).toBe((1000 - 63) * 32);
  });

  it("follows the scroll position and keeps pads aligned", () => {
    const win = computeHorizontalWindow(500 * 32, 832, 1000, 32);

    expect(win.start).toBe(458);
    expect(win.end).toBe(563);
    expect(win.leftPad).toBe(458 * 32);
    expect(win.rightPad).toBe((1000 - 563) * 32);
    expect(win.leftPad + (win.end - win.start) * 32 + win.rightPad).toBe(
      1000 * 32,
    );
  });

  it("clamps at the end of the axis", () => {
    const win = computeHorizontalWindow(10_000_000, 832, 1000, 32);

    expect(win.end).toBe(1000);
    expect(win.rightPad).toBe(0);
  });

  it("returns an empty window for an empty axis", () => {
    expect(computeHorizontalWindow(0, 832, 0, 32)).toEqual({
      start: 0,
      end: 0,
      leftPad: 0,
      rightPad: 0,
    });
  });
});

describe("scrollLeftForToday", () => {
  it("keeps four future days visible on the right", () => {
    // 21 visible columns, today at index 365 → first visible = 365 - 17.
    expect(scrollLeftForToday(365, 832, 32)).toBe((365 - 17) * 32);
  });

  it("never scrolls before the axis start", () => {
    expect(scrollLeftForToday(3, 832, 32)).toBe(0);
  });
});

describe("computeHorizontalWindowByOffsets", () => {
  it("matches the uniform window when all columns are equal", () => {
    const offsets = buildColumnOffsets(new Array<number>(1000).fill(32));
    const win = computeHorizontalWindowByOffsets(0, 832, offsets);

    expect(win.start).toBe(0);
    expect(win.leftPad).toBe(0);
    expect(win.rightPad).toBe(offsets[1000] - offsets[win.end]);
    expect(win.leftPad + offsets[win.end] - offsets[win.start] + win.rightPad)
      .toBe(1000 * 32);
  });

  it("keeps pads aligned when scrolling through variable widths", () => {
    const widths = [24, 120, 32, 320, 64, 24, 200];
    const offsets = buildColumnOffsets(widths);
    const win = computeHorizontalWindowByOffsets(150, 832, offsets);

    expect(win.start).toBe(0);
    expect(win.leftPad).toBe(0);
    expect(win.rightPad).toBe(offsets[widths.length] - offsets[win.end]);
    expect(win.leftPad + offsets[win.end] - offsets[win.start] + win.rightPad)
      .toBe(offsets[widths.length]);
  });

  it("clamps at the end and handles an empty axis", () => {
    const offsets = buildColumnOffsets([32, 32, 32]);
    const win = computeHorizontalWindowByOffsets(9_999_999, 832, offsets);
    expect(win.end).toBe(3);
    expect(win.rightPad).toBe(0);

    expect(computeHorizontalWindowByOffsets(0, 832, [])).toEqual({
      start: 0,
      end: 0,
      leftPad: 0,
      rightPad: 0,
    });
  });

  it("keeps overscan within one screen instead of five", () => {
    const offsets = buildColumnOffsets(new Array<number>(1200).fill(32));
    const visible = Math.ceil((832 - 160) / 32);
    const win = computeHorizontalWindowByOffsets(300 * 32, 832, offsets);

    expect(win.end - win.start).toBeLessThanOrEqual(visible * 2);
    expect(win.start).toBeLessThanOrEqual(300);
    expect(win.end).toBeGreaterThanOrEqual(300 + visible);
  });

  it("never renders more columns than the cell budget", () => {
    const offsets = buildColumnOffsets(new Array<number>(1200).fill(32));
    // 21 行 → floor(2000 / 21) = 95 列
    const budget = Math.floor(2000 / 21);

    for (const scrollLeft of [0, 300 * 32, 900 * 32, 1199 * 32]) {
      const win = computeHorizontalWindowByOffsets(
        scrollLeft,
        832,
        offsets,
        160,
        budget,
      );
      const firstVisible = findColumnAtOffset(offsets, scrollLeft);
      const lastVisible = findColumnAtOffset(
        offsets,
        scrollLeft + (832 - 160) - 1,
      );

      expect(win.end - win.start).toBeLessThanOrEqual(budget);
      expect(win.start).toBeLessThanOrEqual(firstVisible);
      expect(win.end).toBeGreaterThan(lastVisible);
      expect(win.leftPad).toBe(offsets[win.start]);
      expect(win.leftPad + offsets[win.end] - offsets[win.start] + win.rightPad)
        .toBe(offsets[1200]);
    }
  });

  it("keeps the window start monotonic while scrolling right", () => {
    const offsets = buildColumnOffsets(new Array<number>(1200).fill(32));
    let previous = -1;

    for (let index = 0; index < 1200; index += 17) {
      const win = computeHorizontalWindowByOffsets(
        index * 32,
        832,
        offsets,
        160,
        95,
      );
      expect(win.start).toBeGreaterThanOrEqual(previous);
      previous = win.start;
    }
  });
});
