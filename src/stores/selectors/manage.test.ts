import { describe, expect, it } from "vitest";

import type { Task } from "../../domain/types";
import { buildManageRows, splitManageRows } from "./manage";

const TODAY = "2026-11-04";

function task(
  id: string,
  order: number,
  intervals: { start: string; end: string | null; everyDays?: number }[],
): Task {
  return {
    id,
    name: id,
    category: "voluntary",
    intervals: intervals.map((interval, index) => ({
      id: `${id}-${index}`,
      taskId: id,
      ...interval,
    })),
    order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildManageRows", () => {
  it("shows the latest interval and marks its status", () => {
    const rows = buildManageRows(
      [
        task("active", 0, [{ start: "2026-10-01", end: null }]),
        task("scheduled", 1, [{ start: "2026-11-10", end: null }]),
        task("disabled", 2, [{ start: "2026-09-01", end: "2026-10-01" }]),
      ],
      TODAY,
    );

    expect(rows.map((row) => row.task.id)).toEqual([
      "active",
      "scheduled",
      "disabled",
    ]);
    expect(rows.map((row) => row.status)).toEqual([
      "active",
      "scheduled",
      "disabled",
    ]);
    expect(rows[2].end).toBe("2026-10-01");
  });

  it("exposes the latest segment everyDays value", () => {
    const rows = buildManageRows(
      [task("cyclic", 0, [{ start: "2026-10-01", end: null, everyDays: 3 }])],
      TODAY,
    );

    expect(rows[0].everyDays).toBe(3);
  });

  it("keeps earlier segments visible only as a count", () => {
    const rows = buildManageRows(
      [
        task("re-enabled", 0, [
          { start: "2026-09-01", end: "2026-10-01" },
          { start: "2026-10-16", end: null },
        ]),
      ],
      TODAY,
    );

    expect(rows[0]).toMatchObject({
      start: "2026-10-16",
      end: null,
      intervalCount: 2,
      status: "active",
    });
  });

  it("sorts by sort order and keeps a task with future interval out of disabled", () => {
    const rows = buildManageRows(
      [
        task("b", 1, [{ start: "2026-12-01", end: null }]),
        task("a", 0, [{ start: "2026-01-01", end: "2026-02-01" }]),
      ],
      TODAY,
    );

    expect(rows.map((row) => row.task.id)).toEqual(["a", "b"]);
    expect(rows[1].status).toBe("scheduled");
  });

  it("marks a task stopped today as endingToday and offers re-enable", () => {
    const rows = buildManageRows(
      [task("ending-today", 0, [{ start: "2026-10-01", end: "2026-11-04" }])],
      TODAY,
    );

    expect(rows[0]).toMatchObject({
      status: "endingToday",
      hasOpen: false,
      end: "2026-11-04",
    });
  });

  it("marks a task with a future end as endingLater", () => {
    const rows = buildManageRows(
      [task("ending-later", 0, [{ start: "2026-10-01", end: "2026-11-20" }])],
      TODAY,
    );

    expect(rows[0]).toMatchObject({
      status: "endingLater",
      hasOpen: false,
    });
  });

  it("treats a task with no intervals as disabled", () => {
    const rows = buildManageRows([task("empty", 0, [])], TODAY);

    expect(rows[0]).toMatchObject({ status: "disabled", hasOpen: false });
  });
});

describe("splitManageRows", () => {
  it("keeps running tasks first and moves disabled tasks to the end", () => {
    const rows = buildManageRows(
      [
        task("active", 0, [{ start: "2026-10-01", end: null }]),
        task("stopped", 1, [{ start: "2026-09-01", end: "2026-10-01" }]),
        task("scheduled", 2, [{ start: "2026-12-01", end: null }]),
        task("ending-today", 3, [{ start: "2026-10-01", end: TODAY }]),
      ],
      TODAY,
    );

    const { visible, disabled } = splitManageRows(rows);

    expect(visible.map((row) => row.task.id)).toEqual([
      "active",
      "scheduled",
      "ending-today",
    ]);
    expect(disabled.map((row) => row.task.id)).toEqual(["stopped"]);
  });

  it("returns an empty group when no task is disabled", () => {
    const rows = buildManageRows(
      [task("active", 0, [{ start: "2026-10-01", end: null }])],
      TODAY,
    );

    const { visible, disabled } = splitManageRows(rows);

    expect(visible).toHaveLength(1);
    expect(disabled).toHaveLength(0);
  });

  it("keeps the group empty when every task is disabled", () => {
    const rows = buildManageRows(
      [
        task("first", 0, [{ start: "2026-09-01", end: "2026-10-01" }]),
        task("second", 1, []),
      ],
      TODAY,
    );

    const { visible, disabled } = splitManageRows(rows);

    expect(visible).toHaveLength(0);
    expect(disabled.map((row) => row.task.id)).toEqual(["first", "second"]);
  });
});
