import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { GridRow } from "../../../domain/grid";
import { monthTicks } from "../../../domain/grid";
import { checkinKey } from "../../../domain/keys";
import type { CellState } from "../../../domain/settle";
import type { Checkin, CheckinStatus, Language } from "../../../domain/types";
import type { MessageKey } from "../../../shared/i18n";
import { dateLocale } from "../../../shared/i18n";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useGridData } from "../../../stores/selectors/grid";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useUiStore } from "../../../stores/uiStore";
import { DateField } from "../../../ui/DateField";
import {
  CELL_LABEL_KEYS,
  CELL_SYMBOLS,
} from "../../../ui/CheckCell";
import {
  buildColumnOffsets,
  buildDateColumnWidths,
  buildTaskColumnWidth,
  findColumnAtOffset,
  scrollLeftForColumn,
  TASK_FONT_SIZE_DETAIL,
  TASK_FONT_SIZE_OVERVIEW,
} from "../../../ui/gridColumnLayout";
import { useHorizontalWindowByOffsets } from "../../../ui/useHorizontalWindow";
import { useT } from "../../../ui/useT";

const MONTH_ROW_HEIGHT = 22;
const DATE_ROW_HEIGHT = 34;
const GROUP_ROW_HEIGHT = 26;
const TASK_ROW_HEIGHT = 34;
const MIN_ZOOM = 14;
const MAX_ZOOM = 44;
const ZOOM_STEP = 2;
/** 骨架只画少量占位块，加载完成前不生成真实日期列。 */
const SKELETON_ROWS = 7;
const SKELETON_COLUMNS = 12;

type GroupKey = "voluntary" | "forced" | "disabled";

const GROUP_META: Record<
  GroupKey,
  { labelKey: MessageKey; color: string }
> = {
  voluntary: {
    labelKey: "grid.group.voluntary",
    color: "var(--color-voluntary)",
  },
  forced: { labelKey: "grid.group.forced", color: "var(--color-forced)" },
  disabled: {
    labelKey: "grid.group.disabled",
    color: "var(--color-border-strong)",
  },
};

export default function TaskGrid() {
  const t = useT();
  const data = useGridData();
  const setStatus = useCheckinsStore((state) => state.setStatus);
  const setNote = useCheckinsStore((state) => state.setNote);
  const setValue = useCheckinsStore((state) => state.setValue);
  const checkinsLoaded = useCheckinsStore((state) => state.loaded);
  const reorder = useTasksStore((state) => state.reorder);
  const tasksLoaded = useTasksStore((state) => state.loaded);
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const filter = useUiStore((state) => state.gridFilter);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const ready = tasksLoaded && checkinsLoaded && settingsLoaded;

  /** 日期筛选超出轴范围时夹回轴首尾，避免出现 0 列空网格。 */
  const clampToAxis = (date: string | null): string | null => {
    if (!date) {
      return null;
    }
    if (date < data.axis.start) {
      return data.axis.start;
    }
    if (date > data.axis.end) {
      return data.axis.end;
    }
    return date;
  };

  const cellSize = Math.min(44, Math.max(14, data.settings.gridZoom));
  const overview = cellSize < 24;
  const rowHeight = overview ? 18 : TASK_ROW_HEIGHT;
  const groupHeight = overview ? 18 : GROUP_ROW_HEIGHT;
  const from = clampToAxis(
    filter.from && filter.to && filter.from > filter.to
      ? filter.to
      : filter.from,
  );
  const to = clampToAxis(
    filter.from && filter.to && filter.from > filter.to
      ? filter.from
      : filter.to,
  );
  const dates = useMemo(
    () =>
      data.axis.dates.filter(
        (date) => (!from || date >= from) && (!to || date <= to),
      ),
    [data.axis.dates, from, to],
  );
  const todayIndex = dates.indexOf(data.today);
  /** 今天不在筛选范围内时，Home 去离今天最近的边界。 */
  const homeIndex =
    dates.length === 0
      ? 0
      : todayIndex >= 0
        ? todayIndex
        : data.today < dates[0]
          ? 0
          : dates.length - 1;
  const filterActive =
    filter.category !== "all" ||
    filter.taskId !== null ||
    filter.from !== null ||
    filter.to !== null;

  const taskFontSize = overview
    ? TASK_FONT_SIZE_OVERVIEW
    : TASK_FONT_SIZE_DETAIL;
  /** 任务列与日期列都按内容取宽；同一列所有行共享同一宽度（含折叠的历史名称段）。 */
  const taskColWidth = useMemo(
    () =>
      buildTaskColumnWidth(
        [
          ...data.groups.voluntary,
          ...data.groups.forced,
          ...data.groups.disabled,
        ],
        taskFontSize,
      ),
    [data.groups, taskFontSize],
  );
  const columnWidths = useMemo(
    () =>
      overview
        ? dates.map(() => cellSize)
        : buildDateColumnWidths(dates, data.checkins.values(), cellSize),
    [dates, data.checkins, cellSize, overview],
  );
  const columnOffsets = useMemo(
    () => buildColumnOffsets(columnWidths),
    [columnWidths],
  );
  const columnsTotalWidth = columnOffsets[columnOffsets.length - 1] ?? 0;
  const totalWidth = taskColWidth + columnsTotalWidth;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(() =>
    scrollLeftForColumn(
      Math.max(0, todayIndex),
      columnOffsets,
      832,
      taskColWidth,
    ),
  );
  const effectiveWidth = viewportWidth || 832;
  const viewRef = useRef({
    scrollLeft,
    width: effectiveWidth,
    taskColWidth,
    dates,
    checkins: data.checkins,
    offsets: columnOffsets,
    totalWidth,
  });
  viewRef.current = {
    scrollLeft,
    width: effectiveWidth,
    taskColWidth,
    dates,
    checkins: data.checkins,
    offsets: columnOffsets,
    totalWidth,
  };

  const viewportWindow = useHorizontalWindowByOffsets(
    scrollLeft,
    effectiveWidth,
    columnOffsets,
    taskColWidth,
  );
  const visibleDates = dates.slice(viewportWindow.start, viewportWindow.end);
  const visibleWidths = columnWidths.slice(
    viewportWindow.start,
    viewportWindow.end,
  );

  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    voluntary: false,
    forced: false,
    disabled: true,
  });
  /** 历史名称段默认折叠；值是该任务展开过的 taskId 集合。 */
  const [expandedNames, setExpandedNames] = useState<Set<string>>(
    () => new Set(),
  );
  const [focused, setFocused] = useState<{
    rowKey: string;
    taskId: string;
    date: string;
  } | null>(null);
  const pendingFocus = useRef(false);
  const scrollFrame = useRef(0);
  const cardRef = useRef<HTMLElement>(null);
  const [cellTarget, setCellTarget] = useState<{
    taskId: string;
    date: string;
    taskName: string;
    left: number;
    top: number;
  } | null>(null);
  const [statusDraft, setStatusDraft] = useState<CheckinStatus | null>(null);
  const [valueDraft, setValueDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const maxScrollLeft = useCallback(
    (width: number) => Math.max(0, totalWidth - width),
    [totalWidth],
  );

  /** 所有程序化滚动都走这里：夹在 [0, 内容宽 − 视口宽]，状态与真实位置一致。 */
  const scrollTo = useCallback(
    (target: number) => {
      const element = scrollerRef.current;
      const width = element?.clientWidth || effectiveWidth;
      const next = Math.min(Math.max(0, target), maxScrollLeft(width));
      if (element && element.scrollLeft !== next) {
        element.scrollLeft = next;
      }
      setScrollLeft(next);
    },
    [effectiveWidth, maxScrollLeft],
  );

  const jumpToToday = useCallback(() => {
    const element = scrollerRef.current;
    const width = element?.clientWidth || effectiveWidth;
    scrollTo(
      scrollLeftForColumn(
        homeIndex,
        columnOffsets,
        width,
        taskColWidth,
      ),
    );
  }, [columnOffsets, effectiveWidth, homeIndex, scrollTo, taskColWidth]);

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 打开即定位到今天，右侧留 4 天。
  useLayoutEffect(() => {
    jumpToToday();
  }, []);

  // 时间段筛选变化后：今天在范围内就回今天，否则回到范围开头。
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }
    const width = element.clientWidth || effectiveWidth;
    const target =
      todayIndex < 0
        ? 0
        : scrollLeftForColumn(
            todayIndex,
            columnOffsets,
            width,
            taskColWidth,
          );
    scrollTo(target);
  }, [from, to]);

  // 列数 / 缩放 / 视口变化后把 scrollLeft 夹回合法范围，避免停在轴外。
  useEffect(() => {
    scrollTo(scrollerRef.current?.scrollLeft ?? 0);
  }, [dates.length, cellSize, effectiveWidth, scrollTo]);

  // Ctrl + 滚轮缩放；Shift + 滚轮横向滚动。两者都拦掉默认的页面滚动。
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        if (event.deltaY === 0) {
          return;
        }
        event.preventDefault();

        const current = Math.min(
          MAX_ZOOM,
          Math.max(
            MIN_ZOOM,
            useSettingsStore.getState().settings.gridZoom,
          ),
        );
        const next = Math.min(
          MAX_ZOOM,
          Math.max(
            MIN_ZOOM,
            current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
          ),
        );
        if (next === current) {
          return;
        }

        const view = viewRef.current;
        const dateViewport = Math.max(0, view.width - view.taskColWidth);
        const centerIndex = findColumnAtOffset(
          view.offsets,
          view.scrollLeft + dateViewport / 2,
        );
        const nextOverview = next < 24;
        const nextWidths = nextOverview
          ? view.dates.map(() => next)
          : buildDateColumnWidths(
              view.dates,
              view.checkins.values(),
              next,
            );
        const nextOffsets = buildColumnOffsets(nextWidths);
        const nextTotal =
          view.taskColWidth + nextOffsets[nextOffsets.length - 1];
        const max = Math.max(0, nextTotal - view.width);
        const centerWidth = nextWidths[centerIndex] ?? next;
        const target = Math.min(
          Math.max(
            0,
            nextOffsets[centerIndex] +
              centerWidth / 2 -
              dateViewport / 2,
          ),
          max,
        );

        element.scrollLeft = target;
        setScrollLeft(target);
        void useSettingsStore.getState().update({ gridZoom: next });
        return;
      }

      if (!event.shiftKey) {
        return;
      }
      const delta = event.deltaY || event.deltaX;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      const view = viewRef.current;
      const max = Math.max(0, view.totalWidth - view.width);
      const target = Math.min(Math.max(0, element.scrollLeft + delta), max);
      element.scrollLeft = target;
      setScrollLeft(target);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /** 键盘移动后把目标日期保持在视口内（左右各留 2 列）。 */
  const ensureDateVisible = (index: number) => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }
    const width = element.clientWidth || effectiveWidth;
    const dateViewport = Math.max(0, width - taskColWidth);
    const left = columnOffsets[index] ?? 0;
    const right = columnOffsets[index + 1] ?? left + cellSize;
    let next = element.scrollLeft;

    if (left < next + cellSize * 2) {
      next = Math.max(0, left - cellSize * 2);
    } else if (right > next + dateViewport - cellSize * 2) {
      next = Math.max(0, right - dateViewport + cellSize * 2);
    }

    if (next !== element.scrollLeft) {
      scrollTo(next);
    }
  };

  // 滚动每帧最多同步一次 state，1000 列时避免每个 scroll 事件都重渲染。
  const handleScroll = () => {
    if (scrollFrame.current) {
      return;
    }
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const element = scrollerRef.current;
      if (element) {
        const max = maxScrollLeft(element.clientWidth || effectiveWidth);
        setScrollLeft(
          Math.min(Math.max(0, element.scrollLeft), max),
        );
      }
      setCellTarget(null);
    });
  };

  useEffect(
    () => () => {
      if (scrollFrame.current) {
        cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  const baseGroups: { key: GroupKey; rows: GridRow[] }[] = [
    { key: "voluntary", rows: data.groups.voluntary },
    { key: "forced", rows: data.groups.forced },
    { key: "disabled", rows: data.groups.disabled },
  ];
  const nameHistoryCounts = new Map<string, number>();
  for (const group of baseGroups) {
    for (const row of group.rows) {
      if (!row.current) {
        nameHistoryCounts.set(
          row.task.id,
          (nameHistoryCounts.get(row.task.id) ?? 0) + 1,
        );
      }
    }
  }
  const toggleNameHistory = (taskId: string) => {
    setExpandedNames((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };
  const allGroups = baseGroups.map((group) => ({
    ...group,
    rows: group.rows.filter(
      (row) =>
        (row.current || expandedNames.has(row.task.id)) &&
        (filter.category === "all" ||
          row.task.category === filter.category) &&
        (filter.taskId === null || row.task.id === filter.taskId),
    ),
  }));
  const groups = allGroups.filter((group) => group.rows.length > 0);

  const handleReorder = (
    groupKey: GroupKey,
    fromId: string,
    toId: string,
  ) => {
    const group = groups.find((item) => item.key === groupKey);
    if (!group) {
      return;
    }
    const ids = [...new Set(group.rows.map((row) => row.task.id))];
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);

    // 组内顺序改完后，按「自愿 → 被迫 → 已停用」的展示顺序展开成全局顺序。
    const allIds = groups.flatMap((item) =>
      item.key === groupKey
        ? ids
        : [...new Set(item.rows.map((row) => row.task.id))],
    );
    void reorder(allIds);
  };

  const allRows = groups.flatMap((group) => group.rows);
  const visibleRows = groups
    .filter((group) => !collapsed[group.key])
    .flatMap((group) => group.rows);
  const defaultFocus =
    visibleRows.length > 0
      ? {
          rowKey: visibleRows[0].key,
          taskId: visibleRows[0].task.id,
          date: data.today,
        }
      : null;
  const clampIndex = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const moveFocus = (dateDelta: number, rowDelta: number) => {
    if (visibleRows.length === 0) {
      return;
    }
    const current = focused ?? defaultFocus;
    if (!current) {
      return;
    }
    const dateIndex = clampIndex(
      dates.indexOf(current.date) + dateDelta,
      0,
      dates.length - 1,
    );
    const rowIndex = clampIndex(
      visibleRows.findIndex((row) => row.key === current.rowKey) +
        rowDelta,
      0,
      visibleRows.length - 1,
    );
    setFocused({
      rowKey: visibleRows[rowIndex].key,
      taskId: visibleRows[rowIndex].task.id,
      date: dates[dateIndex],
    });
    pendingFocus.current = true;
    ensureDateVisible(dateIndex);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (visibleRows.length === 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(-1, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(1, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(0, -1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(0, 1);
        break;
      case "Home": {
        event.preventDefault();
        const current = focused ?? defaultFocus;
        if (!current) {
          return;
        }
        const rowIndex = Math.max(
          0,
          visibleRows.findIndex((row) => row.key === current.rowKey),
        );
        setFocused({
          rowKey: visibleRows[rowIndex].key,
          taskId: visibleRows[rowIndex].task.id,
          date: dates[homeIndex],
        });
        pendingFocus.current = true;
        jumpToToday();
        break;
      }
      case "Escape":
        event.preventDefault();
        pendingFocus.current = false;
        setFocused(null);
        (document.activeElement as HTMLElement | null)?.blur();
        break;
    }
  };

  useLayoutEffect(() => {
    if (!pendingFocus.current || !focused) {
      return;
    }
    const element =
      scrollerRef.current?.querySelector<HTMLElement>(
        `[data-row="${focused.rowKey}"][data-date="${focused.date}"]`,
      );
    if (element) {
      element.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  }, [focused, scrollLeft, viewportWindow.start, viewportWindow.end]);

  const focusRowVisible = focused
    ? visibleRows.some((row) => row.key === focused.rowKey)
    : true;

  useEffect(() => {
    if (focused && !focusRowVisible) {
      setFocused(null);
    }
  }, [focused, focusRowVisible]);

  const firstVisibleIndex =
    dates.length === 0
      ? 0
      : findColumnAtOffset(columnOffsets, Math.max(0, scrollLeft));
  const firstVisible = dates[firstVisibleIndex];
  const monthDate = firstVisible ? parseISO(firstVisible) : null;
  const monthLabel = monthDate
    ? t("grid.month", {
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
      })
    : "";
  const ticks = monthTicks(dates);

  const openEditor = (taskId: string, date: string, taskName: string) => {
    const cell = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-task="${taskId}"][data-date="${date}"]`,
    );
    const card = cardRef.current;
    if (!cell || !card) {
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const left = Math.min(
      Math.max(cellRect.left - cardRect.left - 88, 8),
      Math.max(8, cardRect.width - 248),
    );
    const top = Math.min(
      Math.max(cellRect.bottom - cardRect.top + 8, 8),
      Math.max(8, cardRect.height - 272),
    );
    const checkin = data.checkins.get(checkinKey(taskId, date));
    setStatusDraft(checkin?.status ?? null);
    setValueDraft(checkin?.value ?? "");
    setNoteDraft(checkin?.note ?? "");
    setCellTarget({ taskId, date, taskName, left, top });
  };

  /** 保存按「状态 → 值 → 备注」顺序落库，确保备注写入时打卡行已存在。 */
  const saveCell = () => {
    if (!cellTarget) {
      return;
    }
    const { taskId, date } = cellTarget;
    const before = data.checkins.get(checkinKey(taskId, date));
    const nextValue = valueDraft.trim() === "" ? null : valueDraft.trim();
    const nextNote = noteDraft.trim() === "" ? null : noteDraft;
    const statusChanged = statusDraft !== (before?.status ?? null);
    const valueChanged = nextValue !== (before?.value ?? null);
    const noteChanged = nextNote !== (before?.note ?? null);

    setCellTarget(null);

    void (async () => {
      try {
        if (statusChanged) {
          await setStatus(taskId, date, statusDraft);
        }
        if (valueChanged) {
          await setValue(taskId, date, nextValue);
        }
        if (noteChanged) {
          await setNote(taskId, date, nextNote);
        }
      } catch (error) {
        console.error("[grid] 保存格子失败", error);
      }
    })();
  };

  /** 概览点击：回到详细缩放，并把该日期放到可视区中间。 */
  const zoomToDate = (date: string) => {
    const index = dates.indexOf(date);
    if (index < 0) {
      return;
    }
    const element = scrollerRef.current;
    const width = element?.clientWidth || effectiveWidth;
    const dateViewport = Math.max(0, width - taskColWidth);
    const nextSize = 32;
    const nextWidths = buildDateColumnWidths(
      dates,
      data.checkins.values(),
      nextSize,
    );
    const nextOffsets = buildColumnOffsets(nextWidths);
    const nextTotal = taskColWidth + nextOffsets[nextOffsets.length - 1];
    const max = Math.max(0, nextTotal - width);
    const target = Math.min(
      Math.max(
        0,
        nextOffsets[index] +
          (nextWidths[index] ?? nextSize) / 2 -
          dateViewport / 2,
      ),
      max,
    );

    if (element) {
      element.scrollLeft = target;
    }
    setScrollLeft(target);
    void useSettingsStore.getState().update({ gridZoom: nextSize });
  };

  const setZoom = (next: number) => {
    void useSettingsStore.getState().update({ gridZoom: next });
  };

  const rangeLabel = t("grid.range", {
    start: format(parseISO(data.axis.start), "MM/dd"),
    end: format(parseISO(data.axis.end), "MM/dd"),
    days: dates.length,
  });

  return (
    <>
      <header className="flex flex-none items-center gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("grid.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {rangeLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label={t("grid.mode.aria")}
            className="flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
          >
            <button
              type="button"
              aria-pressed={!overview}
              onClick={() => setZoom(32)}
              className={clsx(
                "rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[var(--text-2xs)]",
                !overview
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "text-[var(--color-text-muted)]",
              )}
            >
              {t("grid.mode.detail")}
            </button>
            <button
              type="button"
              aria-pressed={overview}
              onClick={() => setZoom(16)}
              className={clsx(
                "rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[var(--text-2xs)]",
                overview
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "text-[var(--color-text-muted)]",
              )}
            >
              {t("grid.mode.overview")}
            </button>
          </div>
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("grid.today")}
          </button>
        </div>
      </header>

      <div
        data-grid-filters
        className="flex flex-none flex-wrap items-center gap-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]"
      >
        <span>{t("grid.filter.label")}</span>
        <div
          role="group"
          aria-label={t("grid.filter.aria")}
          className="flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
        >
          {(["all", "voluntary", "forced"] as const).map((category) => (
            <button
              key={category}
              type="button"
              data-filter-category={category}
              aria-pressed={filter.category === category}
              onClick={() => setGridFilter({ category })}
              className={clsx(
                "rounded-[var(--radius-pill)] px-2 py-0.5",
                filter.category === category
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "hover:bg-[var(--state-hover)]",
              )}
            >
              {t(
                category === "all"
                  ? "grid.filter.all"
                  : category === "voluntary"
                    ? "grid.filter.voluntary"
                    : "grid.filter.forced",
              )}
            </button>
          ))}
        </div>

        <select
          data-filter-task
          aria-label={t("grid.filter.task")}
          value={filter.taskId ?? ""}
          onChange={(event) =>
            setGridFilter({ taskId: event.target.value || null })
          }
          className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)]"
        >
          <option value="">{t("grid.filter.allTasks")}</option>
          {data.tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>

        <label className="flex shrink-0 items-center gap-1">
          {t("grid.filter.from")}
          <DateField
            data-filter-from
            value={filter.from}
            onChange={(next) => setGridFilter({ from: next })}
            aria-label={t("grid.filter.from")}
            allowClear
            className="w-[124px] shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)]"
          />
        </label>
        <label className="flex shrink-0 items-center gap-1">
          {t("grid.filter.to")}
          <DateField
            data-filter-to
            value={filter.to}
            onChange={(next) => setGridFilter({ to: next })}
            aria-label={t("grid.filter.to")}
            allowClear
            className="w-[124px] shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)]"
          />
        </label>

        {filterActive ? (
          <button
            type="button"
            data-filter-clear
            onClick={() =>
              setGridFilter({
                category: "all",
                taskId: null,
                from: null,
                to: null,
              })
            }
            className="rounded-[var(--radius-control)] px-2 py-0.5 hover:bg-[var(--state-hover)]"
          >
            {t("grid.filter.clear")}
          </button>
        ) : null}
      </div>

      {!ready ? (
        <GridSkeleton />
      ) : allRows.length === 0 ? (
        <section
          data-grid-empty
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            {t(
              data.tasks.length > 0 ? "grid.filter.empty" : "grid.empty",
            )}
          </p>
          {data.tasks.length > 0 && filterActive ? (
            <p className="text-[var(--text-2xs)] text-[var(--color-text-muted)] opacity-70">
              {t("grid.filter.emptyHint")}
            </p>
          ) : null}
        </section>
      ) : (
        <section
          ref={cardRef}
          data-grid-zoom={cellSize}
          data-grid-scroll={scrollLeft}
          data-mode={overview ? "overview" : "detail"}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
        >
          <div
            className="pointer-events-none absolute top-0 z-30 flex h-[22px] items-center border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[10px] text-[var(--color-text-muted)]"
            style={{ left: taskColWidth }}
          >
            {monthLabel}
          </div>

          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            className="relative z-0 min-h-0 flex-1 overflow-auto"
            data-grid-scroller
          >
            <div style={{ width: totalWidth }} data-grid-content>
              {/* 月份带：只画分隔刻度，月份文字用上面的跟随 pill。 */}
              <div
                className="sticky top-0 z-20 flex bg-[var(--color-surface)]"
                style={{ height: MONTH_ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-40 shrink-0 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)]"
                  style={{ width: taskColWidth, height: MONTH_ROW_HEIGHT }}
                />
                <div
                  className="relative border-b border-[var(--color-border)]"
                  style={{
                    width: columnsTotalWidth,
                    height: MONTH_ROW_HEIGHT,
                  }}
                >
                  {ticks.map((tick) => (
                    <span
                      key={tick.key}
                      data-month-tick={tick.key}
                      className="absolute top-0 h-full border-l border-[var(--color-border)]"
                      style={{ left: columnOffsets[tick.index] ?? 0 }}
                    />
                  ))}
                </div>
              </div>

              {/* 日期 / 星期 */}
              <div
                className="sticky z-20 flex bg-[var(--color-surface)]"
                style={{ top: MONTH_ROW_HEIGHT, height: DATE_ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-40 flex shrink-0 items-center border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]"
                  style={{ width: taskColWidth, height: DATE_ROW_HEIGHT }}
                >
                  {t("grid.corner")}
                </div>
                <div style={{ width: viewportWindow.leftPad }} />
                {visibleDates.map((date, index) => (
                  <DateHeader
                    key={date}
                    date={date}
                    width={visibleWidths[index] ?? cellSize}
                    isToday={date === data.today}
                    overview={overview}
                    language={data.settings.language}
                  />
                ))}
                <div style={{ width: viewportWindow.rightPad }} />
              </div>

              {groups.map((group) => (
                <GridGroup
                  key={group.key}
                  groupKey={group.key}
                  rows={group.rows}
                  open={!collapsed[group.key]}
                  onToggle={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.key]: !current[group.key],
                    }))
                  }
                  dates={visibleDates}
                  widths={visibleWidths}
                  taskColWidth={taskColWidth}
                  leftPad={viewportWindow.leftPad}
                  rightPad={viewportWindow.rightPad}
                  totalWidth={totalWidth}
                  rowHeight={rowHeight}
                  groupHeight={groupHeight}
                  overview={overview}
                  today={data.today}
                  states={data.states}
                  checkins={data.checkins}
                  focused={focused}
                  defaultFocus={defaultFocus}
                  onFocusCell={(rowKey, taskId, date) =>
                    setFocused({ rowKey, taskId, date })
                  }
                  onOpenEditor={openEditor}
                  onReorder={(fromId, toId) =>
                    handleReorder(group.key, fromId, toId)
                  }
                  dragEnabled={!filterActive}
                  onZoomDate={zoomToDate}
                  nameHistoryCounts={nameHistoryCounts}
                  expandedNames={expandedNames}
                  onToggleNameHistory={toggleNameHistory}
                />
              ))}
            </div>
          </div>

          {cellTarget ? (
            <div
              data-cell-editor
              className="absolute z-40 w-[240px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-popover)]"
              style={{ left: cellTarget.left, top: cellTarget.top }}
            >
              <div className="mb-1 flex items-center gap-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
                <span className="truncate">
                  {format(parseISO(cellTarget.date), "MM/dd")}{" "}
                  {cellTarget.taskName}
                </span>
                <span className="ml-auto shrink-0">
                  {t("grid.cell.title")}
                </span>
              </div>

              <div
                role="group"
                aria-label={t("grid.cell.status")}
                className="mb-1.5 flex gap-1"
              >
                {(
                  [
                    { value: "done", label: t("grid.cell.done") },
                    { value: "missed", label: t("grid.cell.missed") },
                    { value: "skipped", label: t("grid.cell.skipped") },
                    { value: null, label: t("grid.cell.clear") },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={statusDraft === option.value}
                    onClick={() => setStatusDraft(option.value)}
                    className={clsx(
                      "flex-1 rounded-[var(--radius-control)] px-1 py-0.5 text-[10px]",
                      statusDraft === option.value
                        ? "bg-[var(--color-voluntary)] font-semibold text-white"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                {t("grid.cell.value")}
                <input
                  value={valueDraft}
                  aria-label={t("grid.cell.value")}
                  placeholder={t("grid.cell.valuePlaceholder")}
                  onChange={(event) => setValueDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setCellTarget(null);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[10px] text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                />
              </label>

              <textarea
                value={noteDraft}
                aria-label={t("grid.note.title")}
                placeholder={t("grid.note.placeholder")}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setCellTarget(null);
                  }
                }}
                className="h-14 w-full resize-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 text-xs text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              />

              <div className="mt-1.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setCellTarget(null)}
                  className="rounded-[var(--radius-control)] px-2 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
                >
                  {t("grid.note.cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveCell}
                  className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2 py-1 text-[var(--text-2xs)] font-semibold text-white"
                >
                  {t("grid.note.save")}
                </button>
              </div>
            </div>
          ) : null}

          <footer className="flex h-[30px] flex-none items-center gap-1.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[10px] text-[var(--color-text-muted)]">
            <span>{t("grid.taskCount", { count: allRows.length })}</span>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span>{t("grid.dayCount", { count: dates.length })}</span>
            <span className="ml-auto">{t("grid.zoomHint")}</span>
          </footer>
        </section>
      )}
    </>
  );
}

function GridSkeleton() {
  const t = useT();
  const bar =
    "animate-pulse rounded-[var(--radius-pill)] bg-[var(--state-hover)] motion-reduce:animate-none";

  return (
    <section
      data-grid-skeleton
      aria-busy="true"
      aria-label={t("grid.loading")}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
    >
      <div className="flex h-[56px] flex-none items-center gap-2 border-b border-[var(--color-border)] px-3">
        <span className={clsx(bar, "h-2.5 w-20")} />
        <span className={clsx(bar, "ml-auto h-5 w-16")} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-[56px] items-end gap-1 border-b border-[var(--color-border)] px-3 pb-2">
          {Array.from({ length: SKELETON_COLUMNS }, (_, column) => (
            <span key={column} className={clsx(bar, "h-2 flex-1")} />
          ))}
        </div>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <div
            key={row}
            className="flex h-[34px] items-center gap-1 border-b border-[var(--color-border)] px-3"
          >
            <span className={clsx(bar, "h-2.5 w-24 shrink-0")} />
            {Array.from({ length: SKELETON_COLUMNS }, (_, column) => (
              <span
                key={column}
                className={clsx(bar, "h-3 flex-1 rounded-[3px]")}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex h-[30px] flex-none items-center gap-2 border-t border-[var(--color-border)] px-3">
        <span className={clsx(bar, "h-2 w-16")} />
        <span className={clsx(bar, "ml-auto h-2 w-24")} />
      </div>
    </section>
  );
}

function DateHeader({
  date,
  width,
  isToday,
  overview,
  language,
}: {
  date: string;
  width: number;
  isToday: boolean;
  overview: boolean;
  language: Language;
}) {
  const parsed = parseISO(date);
  return (
    <div
      data-date-header={date}
      data-today={isToday ? "" : undefined}
      className={clsx(
        "flex shrink-0 flex-col items-center justify-center gap-px border-b border-l tabular-nums",
        overview ? "text-[9px]" : "text-[var(--text-2xs)]",
        isToday
          ? "font-bold text-[var(--color-voluntary)]"
          : "text-[var(--color-text)]",
      )}
      style={{
        width,
        height: DATE_ROW_HEIGHT,
        background: isToday
          ? "color-mix(in srgb, var(--color-voluntary) 9%, transparent)"
          : undefined,
        borderLeftColor:
          "color-mix(in srgb, var(--color-border) 55%, transparent)",
      }}
    >
      <b className="font-medium leading-none">{format(parsed, "d")}</b>
      {overview ? null : (
        <small className="text-[9px] font-normal leading-none text-[var(--color-text-muted)]">
          {format(parsed, "EEEEEE", { locale: dateLocale(language) })}
        </small>
      )}
    </div>
  );
}

function GridGroup({
  groupKey,
  rows,
  open,
  onToggle,
  dates,
  widths,
  taskColWidth,
  leftPad,
  rightPad,
  totalWidth,
  rowHeight,
  groupHeight,
  overview,
  today,
  states,
  checkins,
  focused,
  defaultFocus,
  onFocusCell,
  onOpenEditor,
  onReorder,
  dragEnabled,
  onZoomDate,
  nameHistoryCounts,
  expandedNames,
  onToggleNameHistory,
}: {
  groupKey: GroupKey;
  rows: GridRow[];
  open: boolean;
  onToggle: () => void;
  dates: string[];
  widths: number[];
  taskColWidth: number;
  leftPad: number;
  rightPad: number;
  totalWidth: number;
  rowHeight: number;
  groupHeight: number;
  overview: boolean;
  today: string;
  states: Map<string, CellState>;
  checkins: Map<string, Checkin>;
  focused: { rowKey: string; taskId: string; date: string } | null;
  defaultFocus: { rowKey: string; taskId: string; date: string } | null;
  onFocusCell: (rowKey: string, taskId: string, date: string) => void;
  onOpenEditor: (taskId: string, date: string, taskName: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  dragEnabled: boolean;
  onZoomDate: (date: string) => void;
  nameHistoryCounts: Map<string, number>;
  expandedNames: Set<string>;
  onToggleNameHistory: (taskId: string) => void;
}) {
  const t = useT();
  const meta = GROUP_META[groupKey];
  const label = t(meta.labelKey);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const taskCount = new Set(rows.map((row) => row.task.id)).size;

  return (
    <>
      <div className="flex" style={{ width: totalWidth, height: groupHeight }}>
        <button
          type="button"
          data-group-header={groupKey}
          aria-expanded={open}
          aria-label={t(open ? "grid.collapse" : "grid.expand", {
            group: label,
          })}
          onClick={onToggle}
          style={{ width: taskColWidth, height: groupHeight }}
          className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[var(--text-2xs)] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
        >
          <span className="w-2 text-[9px]">{open ? "▾" : "▸"}</span>
          <i
            className="h-[11px] w-[3px] rounded-[2px]"
            style={{ background: meta.color }}
          />
          {label}
          <span className="ml-auto pr-1 font-normal tabular-nums">
            {taskCount}
          </span>
        </button>
        <div
          className="flex-1 border-b border-[var(--color-border)] bg-[var(--color-surface)]"
          style={{ minWidth: 0, height: groupHeight }}
        />
      </div>

      {open
        ? rows.map((row) => (
            <div
              key={row.key}
              data-grid-row={row.key}
              data-name-current={row.current ? "" : undefined}
              data-disabled={row.disabled ? "" : undefined}
              data-dragging={draggingId === row.task.id ? "" : undefined}
              data-drop-target={dropTargetId === row.task.id ? "" : undefined}
              className={clsx(
                "group/row flex",
                draggingId === row.task.id && "opacity-60",
              )}
              style={{
                width: totalWidth,
                minHeight: rowHeight,
                boxShadow:
                  dropTargetId === row.task.id
                    ? "inset 0 2px 0 var(--color-voluntary)"
                    : undefined,
              }}
              onDragOver={
                dragEnabled
                  ? (event) => {
                      if (!draggingId || draggingId === row.task.id) {
                        return;
                      }
                      event.preventDefault();
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = "move";
                      }
                      setDropTargetId(row.task.id);
                    }
                  : undefined
              }
              onDragLeave={
                dragEnabled
                  ? () =>
                      setDropTargetId((current) =>
                        current === row.task.id ? null : current,
                      )
                  : undefined
              }
              onDrop={
                dragEnabled
                  ? (event) => {
                      event.preventDefault();
                      if (draggingId && draggingId !== row.task.id) {
                        onReorder(draggingId, row.task.id);
                      }
                      setDraggingId(null);
                      setDropTargetId(null);
                    }
                  : undefined
              }
              onDragEnd={
                dragEnabled
                  ? () => {
                      setDraggingId(null);
                      setDropTargetId(null);
                    }
                  : undefined
              }
            >
              <div
                draggable={dragEnabled}
                onDragStart={
                  dragEnabled
                    ? (event) => {
                        setDraggingId(row.task.id);
                        if (event.dataTransfer) {
                          event.dataTransfer.setData(
                            "text/plain",
                            row.task.id,
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }
                      }
                    : undefined
                }
                title={dragEnabled ? t("grid.drag") : undefined}
                data-task-name={row.key}
                style={{ width: taskColWidth, minHeight: rowHeight }}
                className={clsx(
                  "sticky left-0 z-10 flex shrink-0 cursor-grab items-center gap-1.5 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2 active:cursor-grabbing",
                  overview ? "text-[var(--text-2xs)]" : "text-xs",
                  (row.disabled || !row.current) &&
                    "text-[var(--color-text-muted)]",
                )}
              >
                <i
                  className="size-[5px] shrink-0 rounded-full"
                  style={{
                    background:
                      groupKey === "disabled"
                        ? "var(--color-border-strong)"
                        : meta.color,
                    opacity: row.disabled || !row.current ? 0.35 : 1,
                  }}
                />
                <span
                  className="min-w-0 break-words"
                  title={
                    row.current
                      ? undefined
                      : t("grid.nameHistory.range", {
                          start: format(
                            parseISO(row.namePeriod.start),
                            "MM/dd",
                          ),
                          end: row.namePeriod.end
                            ? format(
                                parseISO(row.namePeriod.end),
                                "MM/dd",
                              )
                            : t("manage.ongoing"),
                        })
                  }
                >
                  {row.current ? null : (
                    <span aria-hidden="true" className="mr-0.5 opacity-60">
                      ↳
                    </span>
                  )}
                  {row.name}
                </span>
                {row.current &&
                (nameHistoryCounts.get(row.task.id) ?? 0) > 0 ? (
                  <button
                    type="button"
                    data-name-history-toggle={row.task.id}
                    aria-expanded={expandedNames.has(row.task.id)}
                    aria-label={t(
                      expandedNames.has(row.task.id)
                        ? "grid.nameHistory.hide"
                        : "grid.nameHistory",
                      { count: nameHistoryCounts.get(row.task.id) ?? 0 },
                    )}
                    title={t("grid.nameHistory", {
                      count: nameHistoryCounts.get(row.task.id) ?? 0,
                    })}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleNameHistory(row.task.id);
                    }}
                    className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--color-border)] px-1 text-[9px] leading-4 tabular-nums hover:bg-[var(--state-hover)]"
                  >
                    {expandedNames.has(row.task.id) ? "▾" : "▸"}{" "}
                    {nameHistoryCounts.get(row.task.id)}
                  </button>
                ) : null}
                {dragEnabled ? (
                  <span
                    aria-hidden="true"
                    className="ml-auto shrink-0 text-[9px] text-[var(--color-border-strong)] opacity-0 group-hover/row:opacity-100"
                  >
                    ⋮⋮
                  </span>
                ) : null}
              </div>

              <div style={{ width: leftPad }} />
              {dates.map((date, index) => {
                const stateKey = checkinKey(row.key, date);
                const state = states.get(stateKey) ?? "none";
                const checkin = checkins.get(checkinKey(row.task.id, date));
                const note = checkin?.note ?? null;
                const value = checkin?.value ?? null;
                const isFocused =
                  focused?.rowKey === row.key &&
                  focused.date === date;
                const isDefault =
                  defaultFocus?.rowKey === row.key &&
                  defaultFocus.date === date;
                return (
                  <GridCell
                    key={date}
                    rowKey={row.key}
                    taskId={row.task.id}
                    taskName={row.name}
                    date={date}
                    state={state}
                    value={value}
                    width={widths[index] ?? 32}
                    height={rowHeight}
                    isToday={date === today}
                    overview={overview}
                    focused={isFocused}
                    tabIndex={isFocused || (!focused && isDefault) ? 0 : -1}
                    hasNote={Boolean(note)}
                    disabled={
                      row.disabled || (!overview && state === "none")
                    }
                    onFocus={() => onFocusCell(row.key, row.task.id, date)}
                    onOpenEditor={() =>
                      onOpenEditor(row.task.id, date, row.name)
                    }
                    onActivate={
                      overview ? () => onZoomDate(date) : undefined
                    }
                  />
                );
              })}
              <div style={{ width: rightPad }} />
            </div>
          ))
        : null}
    </>
  );
}

const TODAY_TINT =
  "color-mix(in srgb, var(--color-voluntary) 8%, transparent)";

function overviewBackground(state: CellState): string | undefined {
  switch (state) {
    case "done":
      return "var(--color-voluntary)";
    case "missed":
      return "color-mix(in srgb, var(--color-missed) 55%, var(--color-surface))";
    case "skipped":
      return "color-mix(in srgb, var(--color-forced) 35%, var(--color-surface))";
    case "none":
      return "var(--color-na)";
    case "pending":
      return undefined;
  }
}

function GridCell({
  rowKey,
  taskId,
  taskName,
  date,
  state,
  value,
  width,
  height,
  isToday,
  overview,
  focused,
  tabIndex,
  hasNote,
  disabled,
  onFocus,
  onOpenEditor,
  onActivate,
}: {
  rowKey: string;
  taskId: string;
  taskName: string;
  date: string;
  state: CellState;
  value: string | null;
  width: number;
  height: number;
  isToday: boolean;
  overview: boolean;
  focused: boolean;
  tabIndex: number;
  hasNote: boolean;
  disabled: boolean;
  onFocus: () => void;
  onOpenEditor: () => void;
  onActivate?: () => void;
}) {
  const t = useT();
  const symbol = state === "none" ? "▫" : CELL_SYMBOLS[state];
  const text = !overview && value ? value : symbol;
  const canEdit = !overview && !disabled;
  const canNote =
    !overview &&
    (state === "done" || state === "missed" || state === "skipped");
  const statusLabel = t(CELL_LABEL_KEYS[state]);
  const ariaLabel = value
    ? `${t("checkin.aria", { task: taskName, status: statusLabel })} · ${value}`
    : t("checkin.aria", { task: taskName, status: statusLabel });

  /** 今天列绿底只覆盖真要打卡的三态；「今天不做」和区间外保持自己的底色。 */
  const tinted = state === "pending" || state === "done" || state === "missed";
  const todayTint = isToday && tinted ? TODAY_TINT : undefined;
  const background = overview
    ? (overviewBackground(state) ?? todayTint)
    : (todayTint ?? (state === "none" ? "var(--color-na)" : undefined));

  return (
    <div
      className="group relative flex shrink-0"
      style={{ width, minHeight: height }}
    >
      <button
        type="button"
        data-grid-cell={taskId}
        data-task={taskId}
        data-row={rowKey}
        data-date={date}
        data-state={state}
        data-today={isToday ? "" : undefined}
        data-today-tint={todayTint ? "" : undefined}
        data-focused={focused ? "" : undefined}
        data-value={value ?? undefined}
        tabIndex={tabIndex}
        disabled={disabled}
        title={`${taskName} · ${format(parseISO(date), "MM/dd")}${
          value ? ` · ${value}` : ""
        }`}
        aria-label={ariaLabel}
        onFocus={onFocus}
        onClick={onActivate}
        onDoubleClick={canEdit ? onOpenEditor : undefined}
        onContextMenu={
          canEdit
            ? (event) => {
                event.preventDefault();
                onOpenEditor();
              }
            : undefined
        }
        className={clsx(
          "flex w-full min-w-0 items-center justify-center border-b border-l tabular-nums outline-none",
          overview ? "text-[0px]" : value ? "px-0.5 text-[10px]" : "text-xs",
          !overview &&
            state === "done" &&
            "font-semibold text-[var(--color-voluntary)]",
          !overview && state === "missed" && "text-[var(--color-missed)]",
          !overview &&
            state === "skipped" &&
            "text-[var(--color-text-muted)]",
          !overview && state === "pending" && "text-[var(--color-text)]",
          disabled
            ? "cursor-not-allowed"
            : overview
              ? "cursor-zoom-in hover:brightness-105"
              : "cursor-default hover:bg-[var(--state-hover)]",
        )}
        style={{
          minHeight: height,
          background,
          color:
            !overview && state === "none"
              ? "color-mix(in srgb, var(--color-text) 28%, transparent)"
              : undefined,
          boxShadow: focused
            ? "inset 0 0 0 2px var(--color-voluntary)"
            : isToday
              ? "inset -1px 0 0 color-mix(in srgb, var(--color-voluntary) 45%, transparent)"
              : undefined,
          borderLeftColor:
            "color-mix(in srgb, var(--color-border) 50%, transparent)",
          borderBottomColor:
            "color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        <span
          aria-hidden="true"
          className="max-w-full break-words text-center leading-tight"
        >
          {overview ? "" : text}
        </span>
      </button>

      {canNote ? (
        <button
          type="button"
          data-note-button={checkinKey(taskId, date)}
          tabIndex={focused ? 0 : -1}
          aria-label={t(hasNote ? "grid.note.has" : "grid.note.add")}
          title={t("grid.note.title")}
          onClick={(event) => {
            event.stopPropagation();
            onOpenEditor();
          }}
          className={clsx(
            "absolute right-0 top-0 grid size-3 place-items-center rounded-bl-[4px] text-[8px] leading-none",
            hasNote
              ? "bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]"
              : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--state-active)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <span aria-hidden="true">{hasNote ? "•" : "✎"}</span>
        </button>
      ) : null}
    </div>
  );
}
