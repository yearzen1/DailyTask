import { create } from "zustand";

export type ViewName = "today" | "grid" | "todos" | "manage" | "stats" | "settings";

export interface GridFilter {
  category: "all" | "voluntary" | "forced";
  taskId: string | null;
  from: string | null;
  to: string | null;
}

/** 待办快速新增的草稿：切视图后组件卸载，草稿仍要保留。 */
export interface TodoDraft {
  title: string;
  dueDate: string;
}

const EMPTY_TODO_DRAFT: TodoDraft = { title: "", dueDate: "" };

export interface UiState {
  view: ViewName;
  gridFilter: GridFilter;
  selectedCell: { taskId: string; date: string } | null;
  widgetExpanded: boolean;
  todoDraft: TodoDraft;
  setView: (view: ViewName) => void;
  setGridFilter: (filter: Partial<GridFilter>) => void;
  selectCell: (cell: { taskId: string; date: string } | null) => void;
  setWidgetExpanded: (expanded: boolean) => void;
  setTodoDraft: (draft: Partial<TodoDraft>) => void;
  resetTodoDraft: () => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  view: "today",
  gridFilter: { category: "all", taskId: null, from: null, to: null },
  selectedCell: null,
  widgetExpanded: false,
  todoDraft: EMPTY_TODO_DRAFT,

  setView: (view) => set({ view }),
  setGridFilter: (filter) =>
    set({ gridFilter: { ...get().gridFilter, ...filter } }),
  selectCell: (selectedCell) => set({ selectedCell }),
  setWidgetExpanded: (widgetExpanded) => set({ widgetExpanded }),
  setTodoDraft: (draft) =>
    set({ todoDraft: { ...get().todoDraft, ...draft } }),
  resetTodoDraft: () => set({ todoDraft: EMPTY_TODO_DRAFT }),
}));
