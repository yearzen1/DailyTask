import { bench, describe } from "vitest";

import { DEFAULT_SETTINGS, type Task } from "../../domain/types";
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

const tasks = Array.from({ length: 15 }, (_, index) => task(index));

describe("buildGridData", () => {
  bench("1200 列 × 15 任务，建轴 + 分组", () => {
    buildGridData(tasks, new Map(), DEFAULT_SETTINGS, NOW);
  });

  bench("再按需投影 200 个格子", () => {
    const data = buildGridData(tasks, new Map(), DEFAULT_SETTINGS, NOW);
    const row = data.groups.voluntary[0];
    for (let index = 0; index < 200; index += 1) {
      data.cellState(row, data.axis.dates[index]);
    }
  });
});
