import { describe, expect, it } from "vitest";

import { planTypeMove, typeDropZone } from "./typeDrop";
import type { TaskType } from "./types";

const NOW = "2026-11-01T00:00:00.000Z";

function type(
  id: string,
  parentId: string | null,
  order: number,
  systemKey: TaskType["systemKey"] = null,
): TaskType {
  return {
    id,
    name: id,
    parentId,
    order,
    systemKey,
    color: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const types: TaskType[] = [
  type("voluntary", null, 0, "voluntary"),
  type("forced", null, 1, "forced"),
  type("health", null, 0),
  type("work", null, 1),
  type("run", "health", 0),
  type("sleep", "health", 1),
  type("deep", "run", 0),
];

describe("typeDropZone", () => {
  it("splits a row into before, inside and after", () => {
    expect(typeDropZone(10, 0, 100)).toBe("before");
    expect(typeDropZone(50, 0, 100)).toBe("inside");
    expect(typeDropZone(90, 0, 100)).toBe("after");
  });
});

describe("planTypeMove", () => {
  it("moves a type inside another type at the end", () => {
    expect(planTypeMove(types, "health", "work", "inside")).toEqual({
      parentId: "work",
      index: 0,
    });
    expect(planTypeMove(types, "sleep", "run", "inside")).toEqual({
      parentId: "run",
      index: 1,
    });
  });

  it("inserts before and after a sibling, ignoring the source row", () => {
    expect(planTypeMove(types, "run", "sleep", "after")).toEqual({
      parentId: "health",
      index: 1,
    });
    expect(planTypeMove(types, "sleep", "run", "before")).toEqual({
      parentId: "health",
      index: 0,
    });
    expect(planTypeMove(types, "run", "sleep", "before")).toEqual({
      parentId: "health",
      index: 0,
    });
  });

  it("can move a child to the top level before another custom root", () => {
    expect(planTypeMove(types, "run", "work", "before")).toEqual({
      parentId: null,
      index: 3,
    });
  });

  it("rejects self and descendants", () => {
    expect(planTypeMove(types, "health", "health", "inside")).toBeNull();
    expect(planTypeMove(types, "health", "deep", "inside")).toBeNull();
    expect(planTypeMove(types, "health", "deep", "after")).toBeNull();
  });

  it("allows built-in types to move and be edge targets", () => {
    expect(planTypeMove(types, "health", "voluntary", "before")).toEqual({
      parentId: null,
      index: 0,
    });
    expect(planTypeMove(types, "health", "voluntary", "after")).toEqual({
      parentId: null,
      index: 1,
    });
    expect(planTypeMove(types, "voluntary", "work", "inside")).toEqual({
      parentId: "work",
      index: 0,
    });
  });

  it("allows dropping inside a built-in type", () => {
    expect(planTypeMove(types, "health", "forced", "inside")).toEqual({
      parentId: "forced",
      index: 0,
    });
  });
});
