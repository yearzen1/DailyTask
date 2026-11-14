import { describe, expect, it } from "vitest";

import {
  currentName,
  currentNamePeriod,
  isDateInNamePeriod,
  nameOn,
  namePeriodsOf,
} from "./names";
import type { NamePeriod, Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "俯卧撑",
    category: "voluntary",
    intervals: [
      { id: "i1", taskId: "t1", start: "2026-10-01", end: null },
    ],
    order: 0,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function period(
  id: string,
  name: string,
  start: string,
  end: string | null,
): NamePeriod {
  return { id, taskId: "t1", name, start, end };
}

describe("namePeriodsOf", () => {
  it("falls back to one period starting at the earliest interval", () => {
    const periods = namePeriodsOf(task());

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      id: "t1",
      taskId: "t1",
      name: "俯卧撑",
      start: "2026-10-01",
      end: null,
    });
  });

  it("falls back to the creation date when there are no intervals", () => {
    const periods = namePeriodsOf(task({ intervals: [] }));

    expect(periods[0].start).toBe("2026-09-20");
  });

  it("sorts explicit periods by start date", () => {
    const periods = namePeriodsOf(
      task({
        namePeriods: [
          period("p2", "每天两个", "2026-11-01", null),
          period("p1", "每天一个", "2026-10-01", "2026-10-31"),
        ],
      }),
    );

    expect(periods.map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("ignores an empty namePeriods array", () => {
    expect(namePeriodsOf(task({ namePeriods: [] }))).toHaveLength(1);
  });
});

describe("isDateInNamePeriod", () => {
  it("includes both boundaries", () => {
    const item = period("p1", "每天一个", "2026-10-01", "2026-10-31");

    expect(isDateInNamePeriod(item, "2026-10-01")).toBe(true);
    expect(isDateInNamePeriod(item, "2026-10-31")).toBe(true);
    expect(isDateInNamePeriod(item, "2026-09-30")).toBe(false);
    expect(isDateInNamePeriod(item, "2026-11-01")).toBe(false);
  });

  it("treats a null end as open ended", () => {
    const item = period("p2", "每天两个", "2026-11-01", null);

    expect(isDateInNamePeriod(item, "2030-01-01")).toBe(true);
  });
});

describe("nameOn", () => {
  const renamed = task({
    name: "每天两个",
    namePeriods: [
      period("p1", "每天一个", "2026-10-01", "2026-10-31"),
      period("p2", "每天两个", "2026-11-01", null),
    ],
  });

  it("returns the name of the period covering the date", () => {
    expect(nameOn(renamed, "2026-10-15")).toBe("每天一个");
    expect(nameOn(renamed, "2026-11-15")).toBe("每天两个");
  });

  it("uses the neighbouring name outside the covered range", () => {
    expect(nameOn(renamed, "2026-09-01")).toBe("每天一个");
    expect(nameOn(renamed, "2030-01-01")).toBe("每天两个");
  });
});

describe("currentNamePeriod", () => {
  it("returns the latest period and its name", () => {
    const renamed = task({
      namePeriods: [
        period("p2", "每天两个", "2026-11-01", null),
        period("p1", "每天一个", "2026-10-01", "2026-10-31"),
      ],
    });

    expect(currentNamePeriod(renamed).id).toBe("p2");
    expect(currentName(renamed)).toBe("每天两个");
  });
});
