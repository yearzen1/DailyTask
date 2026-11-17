import { create } from "zustand";

import { getDb } from "../db/client";
import * as repo from "../db/taskTypes";
import type { TaskType } from "../domain/types";
import type { DeleteConfirmation } from "../shared/deleteConfirmation";
import {
  currentSource,
  emitTaskTypesChanged,
} from "../shared/events";
import { enqueueWrite } from "../shared/queue";

function notifyTaskTypesChanged(): void {
  void emitTaskTypesChanged({ source: currentSource() }).catch(
    () => undefined,
  );
}

export interface TaskTypesState {
  types: TaskType[];
  loaded: boolean;
  hydrate: (types: TaskType[]) => void;
  /** 跨窗口收到失效信号后重查；只替换数据，不再回发事件。 */
  reload: () => Promise<void>;
  create: (input: repo.CreateTaskTypeInput) => Promise<TaskType>;
  update: (id: string, patch: repo.TaskTypePatch) => Promise<void>;
  /** 拖拽移动：改父级并插入到指定同级下标。 */
  move: (id: string, parentId: string | null, index: number) => Promise<void>;
  /** 按传入顺序重排同一父级下的类型。 */
  reorder: (parentId: string | null, ids: string[]) => Promise<void>;
  remove: (id: string, confirmation: DeleteConfirmation) => Promise<void>;
}

export const useTaskTypesStore = create<TaskTypesState>()((set, get) => ({
  types: [],
  loaded: false,

  hydrate: (types) => set({ types, loaded: true }),

  reload: async () => {
    const types = await repo.listTaskTypes(await getDb());
    set({ types, loaded: true });
  },

  create: (input) =>
    enqueueWrite(async () => {
      const type = await repo.createTaskType(await getDb(), input);
      set({ types: [...get().types, type] });
      notifyTaskTypesChanged();
      return type;
    }),

  update: (id, patch) =>
    enqueueWrite(async () => {
      const updated = await repo.updateTaskType(await getDb(), id, patch);
      set({
        types: get().types.map((type) => (type.id === id ? updated : type)),
      });
      notifyTaskTypesChanged();
    }),

  move: (id, parentId, index) =>
    enqueueWrite(async () => {
      const types = await repo.moveTaskType(await getDb(), id, parentId, index);
      set({ types });
      notifyTaskTypesChanged();
    }),

  reorder: (parentId, ids) =>
    enqueueWrite(async () => {
      await repo.reorderTaskTypes(await getDb(), parentId, ids);
      const orders = new Map(ids.map((id, index) => [id, index]));
      set({
        types: get().types.map((type) =>
          orders.has(type.id)
            ? { ...type, order: orders.get(type.id) as number }
            : type,
        ),
      });
      notifyTaskTypesChanged();
    }),

  remove: (id, confirmation) =>
    enqueueWrite(async () => {
      void confirmation;
      await repo.deleteTaskType(await getDb(), id);
      set({ types: get().types.filter((type) => type.id !== id) });
      notifyTaskTypesChanged();
    }),
}));
