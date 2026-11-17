import { describe, expect, it } from "vitest";

import { loadAppData } from "./init";
import type { SqlDatabase } from "../db/client";

describe("loadAppData", () => {
  it("loads settings before the three data domains", async () => {
    const firstSeen: string[] = [];
    const db: SqlDatabase = {
      select: async <T>(query: string) => {
        const table = [
          "settings",
          "tasks",
          "task_types",
          "task_intervals",
          "checkins",
          "todos",
        ].find((name) => query.includes(`FROM ${name}`));
        if (table && !firstSeen.includes(table)) {
          firstSeen.push(table);
        }
        return [] as T;
      },
      execute: async () => ({ rowsAffected: 0 }),
    };

    const data = await loadAppData(db);

    expect(firstSeen[0]).toBe("settings");
    expect(firstSeen.indexOf("tasks")).toBeLessThan(
      firstSeen.indexOf("task_types"),
    );
    expect(firstSeen.indexOf("task_types")).toBeLessThan(
      firstSeen.indexOf("checkins"),
    );
    expect(firstSeen.indexOf("checkins")).toBeLessThan(firstSeen.indexOf("todos"));
    expect(data).toEqual({
      settings: expect.objectContaining({ dayStartHour: 4 }),
      tasks: [],
      taskTypes: [],
      checkins: [],
      todos: [],
    });
  });
});
