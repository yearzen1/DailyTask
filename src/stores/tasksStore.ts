import { create } from "zustand";

import { getDb } from "../db/client";
import * as repo from "../db/tasks";
import type { Task, TaskCategory } from "../domain/types";
import type { DeleteConfirmation } from "../shared/deleteConfirmation";
import { currentSource, emitTasksChanged } from "../shared/events";
import { enqueueWrite } from "../shared/queue";

function notifyTasksChanged(): void {
  void emitTasksChanged({ source: currentSource() }).catch(() => undefined);
}

export interface TasksState {
  tasks: Task[];
  loaded: boolean;
  hydrate: (tasks: Task[]) => void;
  /** 跨窗口收到失效信号后重查；只替换数据，不再回发事件。 */
  reload: () => Promise<void>;
  create: (input: {
    name: string;
    category: TaskCategory;
    startDate: string;
    /** 截止日期；null / 缺省表示一直有效。 */
    endDate?: string | null;
    everyDays?: number;
  }) => Promise<Task>;
  update: (
    id: string,
    patch: { category?: TaskCategory; order?: number },
  ) => Promise<void>;
  /** 改名；默认从 today 起生效，rewrite-current 用于修正错别字。 */
  rename: (
    id: string,
    name: string,
    today: string,
    mode?: repo.RenameMode,
  ) => Promise<void>;
  remove: (id: string, confirmation: DeleteConfirmation) => Promise<void>;
  closeInterval: (taskId: string, endDate: string) => Promise<void>;
  appendInterval: (
    taskId: string,
    startDate: string,
    everyDays?: number,
  ) => Promise<void>;
  /** 编辑最新一段区间的起止日期与间隔天数。 */
  updateInterval: (
    intervalId: string,
    patch: { start: string; end: string | null; everyDays?: number },
  ) => Promise<void>;
  /** 按传入的全局顺序重排任务（拖拽排序）。 */
  reorder: (taskIds: string[]) => Promise<void>;
}

const now = () => new Date().toISOString();

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  loaded: false,

  hydrate: (tasks) => set({ tasks, loaded: true }),

  reload: async () => {
    const tasks = await repo.listTasks(await getDb());
    set({ tasks, loaded: true });
  },

  create: (input) =>
    enqueueWrite(async () => {
      const task = await repo.createTask(await getDb(), input);
      set({ tasks: [...get().tasks, task] });
      notifyTasksChanged();
      return task;
    }),

  update: (id, patch) =>
    enqueueWrite(async () => {
      await repo.updateTask(await getDb(), id, patch);
      set({
        tasks: get().tasks.map((task) =>
          task.id === id ? { ...task, ...patch, updatedAt: now() } : task,
        ),
      });
      notifyTasksChanged();
    }),

  rename: (id, name, today, mode) =>
    enqueueWrite(async () => {
      const periods = await repo.renameTask(
        await getDb(),
        id,
        name,
        today,
        mode,
      );
      const stamp = now();
      set({
        tasks: get().tasks.map((task) =>
          task.id === id
            ? { ...task, name, namePeriods: periods, updatedAt: stamp }
            : task,
        ),
      });
      notifyTasksChanged();
    }),

  remove: (id, confirmation) =>
    enqueueWrite(async () => {
      void confirmation;
      await repo.deleteTask(await getDb(), id);
      set({ tasks: get().tasks.filter((task) => task.id !== id) });
      notifyTasksChanged();
    }),

  closeInterval: (taskId, endDate) =>
    enqueueWrite(async () => {
      const affected = await repo.closeOpenInterval(
        await getDb(),
        taskId,
        endDate,
      );
      if (affected === 0) {
        throw new Error("no-open-interval");
      }
      const stamp = now();
      set({
        tasks: get().tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                updatedAt: stamp,
                intervals: task.intervals.map((interval) =>
                  interval.end === null ? { ...interval, end: endDate } : interval,
                ),
              }
            : task,
        ),
      });
      notifyTasksChanged();
    }),

  appendInterval: (taskId, startDate, everyDays) =>
    enqueueWrite(async () => {
      const interval = await repo.appendInterval(
        await getDb(),
        taskId,
        startDate,
        everyDays,
      );
      const stamp = now();
      set({
        tasks: get().tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                updatedAt: stamp,
                intervals: [...task.intervals, interval],
              }
            : task,
        ),
      });
      notifyTasksChanged();
    }),

  updateInterval: (intervalId, patch) =>
    enqueueWrite(async () => {
      await repo.updateIntervalDates(
        await getDb(),
        intervalId,
        patch.start,
        patch.end,
        patch.everyDays,
      );
      const stamp = now();
      set({
        tasks: get().tasks.map((task) => {
          if (!task.intervals.some((interval) => interval.id === intervalId)) {
            return task;
          }
          return {
            ...task,
            updatedAt: stamp,
            intervals: task.intervals.map((interval) =>
              interval.id === intervalId
                ? {
                    ...interval,
                    start: patch.start,
                    end: patch.end,
                    everyDays: patch.everyDays ?? interval.everyDays ?? 1,
                  }
                : interval,
            ),
          };
        }),
      });
      notifyTasksChanged();
    }),

  reorder: (taskIds) =>
    enqueueWrite(async () => {
      await repo.reorderTasks(await getDb(), taskIds);
      const orders = new Map(taskIds.map((id, index) => [id, index]));
      const stamp = now();
      set({
        tasks: get().tasks.map((task) =>
          orders.has(task.id)
            ? { ...task, order: orders.get(task.id) as number, updatedAt: stamp }
            : task,
        ),
      });
      notifyTasksChanged();
    }),
}));
