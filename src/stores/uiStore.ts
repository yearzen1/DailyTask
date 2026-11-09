import { create } from "zustand";

export type ViewName = "today" | "grid" | "todos" | "manage" | "stats" | "settings";

export interface GridFilter {
  category: "all" | "voluntary" | "forced";
  taskId: string | null;
  from: string | null;
  to: string | null;
}

export interface UiState {
  view: ViewName;
  gridFilter: GridFilter;
  selectedCell: { taskId: string; date: string } | null;
  widgetExpanded: boolean;
  setView: (view: ViewName) => void;
  setGridFilter: (filter: Partial<GridFilter>) => void;
  selectCell: (cell: { taskId: string; date: string } | null) => void;
  setWidgetExpanded: (expanded: boolean) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  view: "today",
  gridFilter: { category: "all", taskId: null, from: null, to: null },
  selectedCell: null,
  widgetExpanded: false,

  setView: (view) => set({ view }),
  setGridFilter: (filter) =>
    set({ gridFilter: { ...get().gridFilter, ...filter } }),
  selectCell: (selectedCell) => set({ selectedCell }),
  setWidgetExpanded: (widgetExpanded) => set({ widgetExpanded }),
}));
