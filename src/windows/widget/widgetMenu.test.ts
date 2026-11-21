import { describe, expect, it } from "vitest";

import { currentOf } from "./widgetMenu";

describe("currentOf", () => {
  it("keeps the three explicit states", () => {
    expect(currentOf("done")).toBe("done");
    expect(currentOf("missed")).toBe("missed");
    expect(currentOf("skipped")).toBe("skipped");
  });

  it("treats pending and none as no current state", () => {
    expect(currentOf("pending")).toBeNull();
    expect(currentOf("none")).toBeNull();
  });
});
