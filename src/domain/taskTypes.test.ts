import { describe, expect, it } from "vitest";

import {
  buildTypeTree,
  descendantTypeIds,
  flattenTypeTree,
  isTypeDescendant,
  resolveTaskTypeId,
  resolveTaskTypes,
  sortedTasksByType,
} from "./taskTypes";
import type { Task, TaskType } from "./types";

const NOW = "2026-11-01T00:00:00.000Z";

function type(
  id: string,
  order: number,
  parentId: string | null = null,
  name: string | null = id,
): TaskType {
  return {
    id,
    name,
    parentId,
    order,
    systemKey: id === "voluntary" || id === "forced" ? id : null,
    color: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function task(id: string, typeId: string | undefined, order: number): Task {
  return {
    id,
    name: id,
    typeId,
    category: "voluntary",
    intervals: [
      { id: `${id}-i`, taskId: id, start: "2026-10-01", end: null },
    ],
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("task types", () => {
  it("falls back to category when typeId is missing", () => {
    expect(resolveTaskTypeId({ category: "voluntary" })).toBe("voluntary");
    expect(resolveTaskTypeId({ category: "forced", typeId: "" })).toBe("forced");
    expect(
      resolveTaskTypeId({ category: "forced", typeId: "healthy" }),
    ).toBe("healthy");
  });

  it("always includes the two built-in types", () => {
    const types = resolveTaskTypes([type("healthy", 0)]);
    expect(types.map((item) => item.id)).toEqual([
      "voluntary",
      "forced",
      "healthy",
    ]);
    expect(resolveTaskTypes(undefined)).toHaveLength(2);
  });

  it("builds a nested tree ordered by sibling sort_order", () => {
    const types = resolveTaskTypes([
      type("work", 1),
      type("meeting", 0, "work"),
      type("health", 0),
      type("run", 1, "health"),
      type("sleep", 0, "health"),
    ]);

    const tree = buildTypeTree(types);
    expect(tree.map((node) => node.type.id)).toEqual([
      "voluntary",
      "forced",
      "health",
      "work",
    ]);
    expect(tree[2].children.map((node) => node.type.id)).toEqual([
      "sleep",
      "run",
    ]);
    expect(tree[3].children.map((node) => node.type.id)).toEqual(["meeting"]);
  });

  it("flattens the tree with depth and full path", () => {
    const types = resolveTaskTypes([
      type("health", 0),
      type("run", 0, "health"),
      type("race", 0, "run"),
    ]);

    const flat = flattenTypeTree(types);
    const byId = new Map(flat.map((node) => [node.type.id, node]));

    expect(byId.get("health")?.depth).toBe(0);
    expect(byId.get("run")?.depth).toBe(1);
    expect(byId.get("race")?.depth).toBe(2);
    expect(byId.get("race")?.path.map((item) => item.id)).toEqual([
      "health",
      "run",
      "race",
    ]);
  });

  it("treats a node with a missing parent as a root", () => {
    const tree = buildTypeTree(
      resolveTaskTypes([type("orphan", 0, "deleted-parent")]),
    );
    expect(tree.some((node) => node.type.id === "orphan")).toBe(true);
  });

  it("collects descendants and rejects unrelated branches", () => {
    const types = resolveTaskTypes([
      type("health", 0),
      type("run", 0, "health"),
      type("race", 0, "run"),
      type("work", 1),
    ]);

    expect([...descendantTypeIds(types, "health")]).toEqual([
      "health",
      "run",
      "race",
    ]);
    expect(isTypeDescendant(types, "health", "race")).toBe(true);
    expect(isTypeDescendant(types, "health", "work")).toBe(false);
    expect(isTypeDescendant(types, "health", "health")).toBe(false);
  });

  it("sorts tasks by type tree order, then task order", () => {
    const types = resolveTaskTypes([
      type("health", 0),
      type("run", 0, "health"),
    ]);

    const sorted = sortedTasksByType(
      [
        task("forced-a", "forced", 0),
        task("run-b", "run", 1),
        task("run-a", "run", 0),
        task("health", "health", 2),
        task("legacy", undefined, 0),
      ],
      types,
    );

    expect(sorted.map((item) => item.id)).toEqual([
      "legacy",
      "forced-a",
      "health",
      "run-a",
      "run-b",
    ]);
  });
});
