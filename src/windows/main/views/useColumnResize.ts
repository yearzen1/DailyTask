import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { resizeBoundary } from "../../../domain/manageColumns";

export interface ColumnResizeController {
  /** 正在拖动的分隔线（左列索引），未拖动时为 null。 */
  resizing: number | null;
  begin: (boundary: number, event: ReactPointerEvent<HTMLElement>) => void;
  move: (event: ReactPointerEvent<HTMLElement>) => void;
  end: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface ResizeSession {
  boundary: number;
  startX: number;
  startWidths: number[];
  tableWidth: number;
  latest: number[];
  moved: boolean;
}

/**
 * 表头分隔线拖动：按表格像素宽把位移换算成百分比，
 * 只在松手时回调 onCommit，拖动过程中只做预览。
 */
export function useColumnResize(options: {
  widths: number[];
  onChange: (widths: number[]) => void;
  onCommit: (widths: number[]) => void;
}): ColumnResizeController {
  const session = useRef<ResizeSession | null>(null);
  const [resizing, setResizing] = useState<number | null>(null);

  const begin = (boundary: number, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button > 0) {
      return;
    }
    const tableWidth =
      event.currentTarget.closest("table")?.getBoundingClientRect().width ?? 0;
    // 0 宽说明还没布局（或测试环境），换算不出百分比，直接不拖。
    if (tableWidth <= 0) {
      return;
    }
    session.current = {
      boundary,
      startX: event.clientX,
      startWidths: [...options.widths],
      tableWidth,
      latest: options.widths,
      moved: false,
    };
    setResizing(boundary);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = session.current;
    if (!active) {
      return;
    }
    const delta = ((event.clientX - active.startX) / active.tableWidth) * 100;
    const next = resizeBoundary(
      active.startWidths,
      active.boundary,
      delta,
    );
    if (!next.some((width, index) => Math.abs(width - active.latest[index]) > 0.005)) {
      return;
    }
    active.latest = next;
    active.moved = true;
    options.onChange(next);
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const active = session.current;
    if (!active) {
      return;
    }
    session.current = null;
    setResizing(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (active.moved) {
      options.onCommit(active.latest);
    }
  };

  return { resizing, begin, move, end };
}
