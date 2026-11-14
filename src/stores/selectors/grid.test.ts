import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type NamePeriod, type Task } from "../../domain/types";
import { buildGridData } from "./grid";

const NOW = new Date(2026, 10, 2, 9, 0, 0);

function task(index: number): Task {
  return {
    id: `t${index}`,
    name: `任务${index}`,
    category: index % 2 === 0 ? "voluntary" : "forced",
    intervals: [
      {
        id: `i${index}`,
        taskId: `t${index}`,
        start: "2020-01-01",
        end: null,
      },
    ],
    order: index,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}

describe("buildGridData", () => {
  it("precomputes the capped 1200-column axis for 15 tasks", () => {
    const tasks = Array.from({ length: 15 }, (_, index) => task(index));
    const started = performance.now();

    const data = buildGridData(tasks, new Map(), DEFAULT_SETTINGS, NOW);
    const elapsed = performance.now() - started;

    expect(data.axis.dates).toHaveLength(1200);
    expect(data.states.size).toBe(1200 * 15);
    expect(data.groups.voluntary).toHaveLength(8);
    expect(data.groups.forced).toHaveLength(7);
    // 宽松上限：只用来拦住 O(n²) 之类的退化，不追求机器无关的精确耗时。
    expect(elapsed).toBeLessThan(500);
  });

  it("computes one cell set per name period and blanks dates outside it", () => {
    const base = task(0);
    const periods: NamePeriod[] = [
      {
        id: "p1",
        taskId: base.id,
        name: "旧名",
        start: "2020-01-01",
        end: "2026-10-31",
      },
      {
        id: "p2",
        taskId: base.id,
        name: "新名",
        start: "2026-11-01",
        end: null,
      },
    ];
    const renamed: Task = { ...base, name: "新名", namePeriods: periods };

    const data = buildGridData([renamed], new Map(), DEFAULT_SETTINGS, NOW);

    expect(data.groups.voluntary).toHaveLength(2);
    expect(data.groups.voluntary.map((row) => row.name)).toEqual([
      "新名",
      "旧名",
    ]);
    // 当前段不覆盖 10-15，旧段覆盖；反过来旧段不覆盖 11-02。
    expect(data.states.get(`${base.id}|2026-10-15`)).toBe("none");
    expect(data.states.get(`${base.id}~p1|2026-10-15`)).toBe("missed");
    expect(data.states.get(`${base.id}|2026-11-02`)).toBe("pending");
    expect(data.states.get(`${base.id}~p1|2026-11-02`)).toBe("none");
  });
});
