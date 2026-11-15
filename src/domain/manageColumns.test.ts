import { describe, expect, it } from "vitest";

import {
  DEFAULT_MANAGE_COLUMN_WIDTHS,
  MANAGE_COLUMNS,
  MAX_MANAGE_COLUMN_WIDTHS,
  MIN_MANAGE_COLUMN_WIDTHS,
  resetColumnWidth,
  resizeBoundary,
  sanitizeManageColumnWidths,
} from "./manageColumns";

const DEFAULTS = [...DEFAULT_MANAGE_COLUMN_WIDTHS];
const total = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0);

describe("manageColumnWidths", () => {
  it("keeps six columns, sums to 100, and defaults inside the limits", () => {
    expect(MANAGE_COLUMNS).toHaveLength(6);
    expect(total(DEFAULTS)).toBe(100);
    DEFAULTS.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(MIN_MANAGE_COLUMN_WIDTHS[index]);
      expect(width).toBeLessThanOrEqual(MAX_MANAGE_COLUMN_WIDTHS[index]);
    });
  });

  it("accepts a valid stored array", () => {
    expect(sanitizeManageColumnWidths([25, 12, 14, 14, 15, 20])).toEqual([
      25, 12, 14, 14, 15, 20,
    ]);
  });

  it("falls back to defaults for wrong shapes and bad values", () => {
    expect(sanitizeManageColumnWidths(undefined)).toEqual(DEFAULTS);
    expect(sanitizeManageColumnWidths("20,11,15,15,16,23")).toEqual(DEFAULTS);
    expect(sanitizeManageColumnWidths([20, 11, 15, 15, 16])).toEqual(DEFAULTS);
    expect(
      sanitizeManageColumnWidths([20, 11, 15, 15, 16, Number.NaN]),
    ).toEqual(DEFAULTS);
    expect(sanitizeManageColumnWidths([20, 11, 15, 15, 16, 2])).toEqual(
      DEFAULTS,
    );
  });

  it("scales a drifted sum back to 100", () => {
    const scaled = sanitizeManageColumnWidths([40, 22, 30, 30, 32, 46]);

    expect(total(scaled)).toBeCloseTo(100, 5);
    expect(scaled).toEqual([20, 11, 15, 15, 16, 23]);
  });

  it("moves width across one boundary and leaves the rest alone", () => {
    const next = resizeBoundary(DEFAULTS, 1, 2);

    expect(next).toEqual([20, 13, 13, 15, 16, 23]);
    expect(total(next)).toBe(100);
  });

  it("stops at the right column minimum", () => {
    expect(resizeBoundary(DEFAULTS, 1, -6)).toEqual([20, 10, 16, 15, 16, 23]);
  });

  it("stops at the left column maximum", () => {
    expect(resizeBoundary(DEFAULTS, 1, 100)).toEqual([20, 15, 11, 15, 16, 23]);
  });

  it("ignores boundaries outside the table", () => {
    expect(resizeBoundary(DEFAULTS, -1, 4)).toEqual(DEFAULTS);
    expect(resizeBoundary(DEFAULTS, MANAGE_COLUMNS.length - 1, 4)).toEqual(
      DEFAULTS,
    );
  });

  it("ignores a non-finite drag delta", () => {
    expect(resizeBoundary(DEFAULTS, 1, Number.NaN)).toEqual(DEFAULTS);
  });

  it("resets a column to its default and spreads the difference", () => {
    const dragged = [20, 20, 10, 10, 16, 24];

    const next = resetColumnWidth(dragged, 1);

    expect(next[1]).toBe(DEFAULT_MANAGE_COLUMN_WIDTHS[1]);
    expect(total(next)).toBeCloseTo(100, 5);
    next.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(MIN_MANAGE_COLUMN_WIDTHS[index]);
      expect(width).toBeLessThanOrEqual(MAX_MANAGE_COLUMN_WIDTHS[index]);
    });
    expect(next[0]).toBeGreaterThan(dragged[0]);
    expect(next[5]).toBeGreaterThan(dragged[5]);
  });

  it("leaves defaults untouched when resetting an unchanged column", () => {
    expect(resetColumnWidth(DEFAULTS, 4)).toEqual(DEFAULTS);
  });

  it("keeps the reset column exact even when it is the widest", () => {
    const wideActions = [12, 11, 11, 11, 13, 42];

    const next = resetColumnWidth(wideActions, 5);

    expect(next[5]).toBe(DEFAULT_MANAGE_COLUMN_WIDTHS[5]);
    expect(total(next)).toBeCloseTo(100, 5);
  });

  it("takes the difference from the only column with room left", () => {
    const squeezed = [15, 10, 11, 11, 13, 40];

    const next = resetColumnWidth(squeezed, 0);

    expect(next[0]).toBe(DEFAULT_MANAGE_COLUMN_WIDTHS[0]);
    expect(next[5]).toBeLessThan(squeezed[5]);
    expect(total(next)).toBeCloseTo(100, 5);
  });
});
