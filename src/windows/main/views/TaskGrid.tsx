import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { GridRow, GridTypeGroup } from "../../../domain/grid";
import { monthTicks } from "../../../domain/grid";
import { checkinKey } from "../../../domain/keys";
import type { CellState } from "../../../domain/settle";
import {
  descendantTypeIds,
  flattenTypeTree,
  resolveTaskTypeId,
} from "../../../domain/taskTypes";
import type { Checkin, CheckinStatus } from "../../../domain/types";
import { dateLocale } from "../../../shared/i18n";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useGridData } from "../../../stores/selectors/grid";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useUiStore } from "../../../stores/uiStore";
import { DateField } from "../../../ui/DateField";
import { CELL_LABEL_KEYS } from "../../../ui/CheckCell";
import { Icon } from "../../../ui/Icon";
import {
  buildColumnOffsets,
  buildDateColumnWidths,
  buildTaskColumnWidth,
  findColumnAtOffset,
  scrollLeftForColumn,
  TASK_FONT_SIZE_DETAIL,
  TASK_FONT_SIZE_OVERVIEW,
} from "../../../ui/gridColumnLayout";
import { typeColorVar, typeDisplayName } from "../../../ui/taskType";
import {
  RENDERED_CELL_BUDGET,
  useHorizontalWindowByOffsets,
} from "../../../ui/useHorizontalWindow";
import { useLocale, useT } from "../../../ui/useT";
import { DateHeader } from "./DateHeader";
import { GridCell } from "./GridCell";

const MONTH_ROW_HEIGHT = 24;
const DATE_ROW_HEIGHT = 40;
const GROUP_ROW_HEIGHT = 28;
const TASK_ROW_HEIGHT = 36;
const MIN_ZOOM = 14;
const MAX_ZOOM = 44;
const ZOOM_STEP = 2;
/** 骨架只画少量占位块，加载完成前不生成真实日期列。 */
const SKELETON_ROWS = 7;
const SKELETON_COLUMNS = 12;

type GroupKey = string;

/** 每格文案一类的常量，随语言变化重建一次。 */
interface GridLabels {
  status: Record<CellState, string>;
  noteAdd: string;
  noteHas: string;
  noteTitle: string;
  drag: string;
}

/** 分组只在自身数据变化时重渲染：聚焦、滚动都不该让整组格子重新构图。 */
const GridGroup = memo(GridGroupInner);

export default function TaskGrid() {
  const t = useT();
  const locale = useLocale();
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

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(["disabled"]),
  );
  /** 历史名称段默认折叠；值是该任务展开过的 taskId 集合。 */
  const [expandedNames, setExpandedNames] = useState<Set<string>>(
    () => new Set(),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filterOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!filterAnchorRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setFilterOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

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
    filter.typeId !== null ||
    filter.taskId !== null ||
    filter.from !== null ||
    filter.to !== null;

  // 类型被删除后，筛选项也要失效，避免停在空网格。
  useEffect(() => {
    const known = new Set(
      flattenTypeTree(data.types).map((node) => node.type.id),
    );
    if (filter.typeId !== null && !known.has(filter.typeId)) {
      setGridFilter({ typeId: null });
    }
  }, [data.types, filter.typeId, setGridFilter]);

  const taskFontSize = overview
    ? TASK_FONT_SIZE_OVERVIEW
    : TASK_FONT_SIZE_DETAIL;
  /** 任务列与日期列都按内容取宽；同一列所有行共享同一宽度（含折叠的历史名称段）。 */
  const taskColWidth = useMemo(
    () =>
      buildTaskColumnWidth(
        data.groups.typeGroups.flatMap((group) => group.rows),
        taskFontSize,
      ),
    [data.groups.typeGroups, taskFontSize],
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

  /** 折叠状态 + 筛选后的分组；行数组要稳定，否则 memo 的分组每帧都白渲染。 */
  const groups = useMemo(() => {
    const selected =
      filter.typeId === null
        ? null
        : descendantTypeIds(data.types, filter.typeId);
    const filterRows = (group: GridTypeGroup) =>
      group.rows.filter(
        (row) =>
          (row.current || expandedNames.has(row.task.id)) &&
          (selected === null ||
            selected.has(resolveTaskTypeId(row.task))) &&
          (filter.taskId === null || row.task.id === filter.taskId),
      );

    const withRows = data.groups.typeGroups.map((group) => ({
      ...group,
      rows: filterRows(group),
    }));

    // 计数跟着筛选走：父组只数过滤后子树里的任务；名称段行按任务去重。
    const taskIdsByGroup = new Map<string, Set<string>>();
    for (const group of withRows) {
      const ids = new Set(group.rows.map((row) => row.task.id));
      if (group.disabled) {
        taskIdsByGroup.set(group.key, ids);
        continue;
      }
      for (const node of group.path) {
        const set = taskIdsByGroup.get(node.id) ?? new Set<string>();
        ids.forEach((id) => set.add(id));
        taskIdsByGroup.set(node.id, set);
      }
    }

    const visible = new Set<string>();
    for (const group of withRows) {
      if (group.rows.length === 0) {
        continue;
      }
      visible.add(group.key);
      for (const node of group.path) {
        visible.add(node.id);
      }
    }
    return withRows
      .filter((group) => visible.has(group.key))
      .map((group) => ({
        ...group,
        count: taskIdsByGroup.get(group.key)?.size ?? 0,
      }));
  }, [
    data.groups.typeGroups,
    data.types,
    expandedNames,
    filter.typeId,
    filter.taskId,
  ]);

  const allRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          !group.path
            .slice(0, -1)
            .some((ancestor) => collapsed.has(ancestor.id)),
      ),
    [groups, collapsed],
  );
  const visibleRows = useMemo(
    () =>
      visibleGroups
        .filter((group) => !collapsed.has(group.key))
        .flatMap((group) => group.rows),
    [visibleGroups, collapsed],
  );
  const rowByKey = useMemo(
    () => new Map(allRows.map((row) => [row.key, row])),
    [allRows],
  );
  const nameHistoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of data.groups.typeGroups) {
      for (const row of group.rows) {
        if (!row.current) {
          counts.set(row.task.id, (counts.get(row.task.id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [data.groups.typeGroups]);
  const labels = useMemo<GridLabels>(
    () => ({
      status: {
        done: t(CELL_LABEL_KEYS.done),
        missed: t(CELL_LABEL_KEYS.missed),
        skipped: t(CELL_LABEL_KEYS.skipped),
        pending: t(CELL_LABEL_KEYS.pending),
        none: t(CELL_LABEL_KEYS.none),
      },
      noteAdd: t("grid.note.add"),
      noteHas: t("grid.note.has"),
      noteTitle: t("grid.note.title"),
      drag: t("grid.drag"),
    }),
    [t, locale],
  );
  const typeFilterOptions = useMemo(
    () =>
      flattenTypeTree(data.types).map((node) => ({
        id: node.type.id,
        depth: node.depth,
        name: typeDisplayName(node.type, t),
      })),
    [data.types, t, locale],
  );

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

  /** 渲染行数决定列预算：行多了就少画几列，格子总数封在 2000 以内。 */
  const columnBudget = Math.floor(
    RENDERED_CELL_BUDGET / Math.max(1, visibleRows.length),
  );
  const viewportWindow = useHorizontalWindowByOffsets(
    scrollLeft,
    effectiveWidth,
    columnOffsets,
    taskColWidth,
    columnBudget,
  );
  const windowStart = viewportWindow.start;
  const windowEnd = viewportWindow.end;
  const visibleDates = useMemo(
    () => dates.slice(windowStart, windowEnd),
    [dates, windowStart, windowEnd],
  );
  const visibleWidths = useMemo(
    () => columnWidths.slice(windowStart, windowEnd),
    [columnWidths, windowStart, windowEnd],
  );
  /** 每格标题里的 MM/dd 只按窗口生成一次，格子里不再 parseISO。 */
  const dateLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const date of visibleDates) {
      map.set(date, format(parseISO(date), "MM/dd"));
    }
    return map;
  }, [visibleDates]);
  const headerCells = useMemo(
    () =>
      visibleDates.map((date) => {
        const parsed = parseISO(date);
        return {
          date,
          day: format(parsed, "d"),
          weekday: format(parsed, "EEEEEE", { locale: dateLocale(locale) }),
        };
      }),
    [visibleDates, locale],
  );
  const ticks = useMemo(() => monthTicks(dates), [dates]);

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
      // 值没变就完全别碰 state：否则挂载期的 clamp 会白白多提交一次。
      if (viewRef.current.scrollLeft !== next) {
        setScrollLeft(next);
      }
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

  // 挂载：量视口 + 一次性定位首屏，两次 setState 合并成一次提交。
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }
    const width = element.clientWidth || effectiveWidth;
    const target = Math.min(
      Math.max(
        0,
        scrollLeftForColumn(homeIndex, columnOffsets, width, taskColWidth),
      ),
      Math.max(0, totalWidth - width),
    );
    if (element.scrollLeft !== target) {
      element.scrollLeft = target;
    }
    setViewportWidth(width);
    if (viewRef.current.scrollLeft !== target) {
      setScrollLeft(target);
    }
  }, []);

  // 时间段筛选变化后：今天在范围内就回今天，否则回到范围开头。挂载时不重复跑。
  const filterEffectRan = useRef(false);
  useEffect(() => {
    if (!filterEffectRan.current) {
      filterEffectRan.current = true;
      return;
    }
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

  const toggleNameHistory = useCallback((taskId: string) => {
    setExpandedNames((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handleReorder = useCallback(
    (groupKey: GroupKey, fromId: string, toId: string) => {
      const group = data.groups.typeGroups.find(
        (item) => item.key === groupKey,
      );
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

      // 按类型树顺序展开成全局顺序，已停用任务排在最后。
      const allIds = data.groups.typeGroups.flatMap((item) => {
        const list =
          item.key === groupKey
            ? ids
            : [...new Set(item.rows.map((row) => row.task.id))];
        return list;
      });
      void reorder([...new Set(allIds)]);
    },
    [data.groups.typeGroups, reorder],
  );

  const defaultFocus = useMemo(
    () =>
      visibleRows.length > 0
        ? {
            rowKey: visibleRows[0].key,
            taskId: visibleRows[0].task.id,
            date: data.today,
          }
        : null,
    [visibleRows, data.today],
  );
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

  const activeFilterCount =
    (filter.typeId !== null ? 1 : 0) +
    (filter.taskId ? 1 : 0) +
    (filter.from || filter.to ? 1 : 0);
  const activeTaskName = filter.taskId
    ? (data.tasks.find((task) => task.id === filter.taskId)?.name ?? null)
    : null;
  const typeLabel =
    filter.typeId === null
      ? null
      : (typeFilterOptions.find((option) => option.id === filter.typeId)?.name ??
        null);
  const rangeLabelFilter = `${filter.from ? format(parseISO(filter.from), "MM/dd") : "…"} – ${
    filter.to ? format(parseISO(filter.to), "MM/dd") : "…"
  }`;
  const resetFilters = () =>
    setGridFilter({
      typeId: null,
      taskId: null,
      from: null,
      to: null,
    });

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
      Math.max(cellRect.left - cardRect.left - 100, 8),
      Math.max(8, cardRect.width - 272),
    );
    const top = Math.min(
      Math.max(cellRect.bottom - cardRect.top + 8, 8),
      Math.max(8, cardRect.height - 360),
    );
    const checkin = data.checkins.get(checkinKey(taskId, date));
    setStatusDraft(checkin?.status ?? null);
    setValueDraft(checkin?.value ?? "");
    setNoteDraft(checkin?.note ?? "");
    setCellTarget({ taskId, date, taskName, left, top });
  };

  /** 委托入口：从包住格子的 `[data-cell-row]` 反推行与日期。 */
  const openCellAt = (wrapper: Element | null) => {
    if (!wrapper || overview) {
      return;
    }
    const rowKey = (wrapper as HTMLElement).dataset.cellRow;
    const date = (wrapper as HTMLElement).dataset.cellDate;
    if (!rowKey || !date) {
      return;
    }
    const row = rowByKey.get(rowKey);
    if (!row || row.disabled || data.cellState(row, date) === "none") {
      return;
    }
    openEditor(row.task.id, date, row.name);
  };

  const handleGridClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    const groupHeader = target.closest<HTMLElement>("[data-group-header]");
    if (groupHeader) {
      const key = groupHeader.dataset.groupHeader;
      if (key) {
        setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }
      return;
    }
    const nameToggle = target.closest<HTMLElement>("[data-name-history-toggle]");
    if (nameToggle) {
      const taskId = nameToggle.dataset.nameHistoryToggle;
      if (taskId) {
        toggleNameHistory(taskId);
      }
      return;
    }
    if (target.closest("[data-note-button]")) {
      openCellAt(target.closest("[data-cell-row]"));
      return;
    }
    if (!overview) {
      return;
    }
    const wrapper = target.closest<HTMLElement>("[data-cell-row]");
    const date = wrapper?.dataset.cellDate;
    if (date) {
      zoomToDate(date);
    }
  };

  const handleGridFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    const wrapper = (event.target as Element).closest<HTMLElement>(
      "[data-cell-row]",
    );
    if (!wrapper) {
      return;
    }
    const { cellRow: rowKey, cellTask: taskId, cellDate: date } = wrapper.dataset;
    if (!rowKey || !taskId || !date) {
      return;
    }
    setFocused((current) =>
      current?.rowKey === rowKey && current.date === date
        ? current
        : { rowKey, taskId, date },
    );
  };

  const handleGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const wrapper = (event.target as Element).closest<HTMLElement>(
      "[data-cell-row]",
    );
    if (!wrapper) {
      return;
    }
    event.preventDefault();
    openCellAt(wrapper);
  };

  const handleGridDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    openCellAt(
      (event.target as Element).closest<HTMLElement>("[data-cell-row]"),
    );
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

  const axisStart = parseISO(data.axis.start);
  const axisEnd = parseISO(data.axis.end);
  const rangeStart = dates.length > 0 ? parseISO(dates[0]) : axisStart;
  const rangeEnd =
    dates.length > 0 ? parseISO(dates[dates.length - 1]) : axisEnd;
  const rangeFmt =
    rangeStart.getFullYear() === rangeEnd.getFullYear()
      ? "MM/dd"
      : "yyyy/MM/dd";
  const rangeLabel = t("grid.range", {
    start: format(rangeStart, rangeFmt),
    end: format(rangeEnd, rangeFmt),
    days: dates.length,
  });

  return (
    <>
      <header className="flex flex-none items-center gap-3">
        <h1 className="m-0 text-lg font-semibold leading-tight tracking-[-.01em]">
          {t("grid.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {rangeLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label={t("grid.mode.aria")}
            className="flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5"
          >
            <button
              type="button"
              aria-pressed={!overview}
              onClick={() => setZoom(32)}
              className={clsx(
                "rounded-[var(--radius-pill)] px-3 py-1 text-xs",
                !overview
                  ? "bg-[var(--color-surface)] font-semibold text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "text-[var(--color-text-tertiary)] hover:bg-[var(--state-hover)]",
              )}
            >
              {t("grid.mode.detail")}
            </button>
            <button
              type="button"
              aria-pressed={overview}
              onClick={() => setZoom(16)}
              className={clsx(
                "rounded-[var(--radius-pill)] px-3 py-1 text-xs",
                overview
                  ? "bg-[var(--color-surface)] font-semibold text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "text-[var(--color-text-tertiary)] hover:bg-[var(--state-hover)]",
              )}
            >
              {t("grid.mode.overview")}
            </button>
          </div>
          <button
            type="button"
            onClick={jumpToToday}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--state-hover)]"
          >
            <Icon
              name="today"
              className="size-3.5 text-[var(--color-text-tertiary)]"
            />
            {t("grid.today")}
          </button>
        </div>
      </header>

      <div
        ref={filterAnchorRef}
        data-grid-filters
        className="relative flex flex-none flex-wrap items-center gap-2"
      >
        <button
          type="button"
          data-filter-trigger
          aria-expanded={filterOpen}
          aria-controls="grid-filter-panel"
          onClick={() => setFilterOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--state-hover)]"
        >
          <Icon
            name="filter"
            className="size-3.5 text-[var(--color-text-tertiary)]"
          />
          {t("grid.filter.label")}
          {activeFilterCount > 0 ? (
            <span className="grid h-[17px] min-w-[17px] place-items-center rounded-[var(--radius-pill)] bg-[var(--color-green-solid)] px-1 text-[10px] font-bold tabular-nums text-[var(--color-on-green)]">
              {activeFilterCount}
            </span>
          ) : null}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          {typeLabel ? (
            <button
              type="button"
              data-filter-chip="type"
              aria-label={t("grid.filter.remove", { name: typeLabel })}
              onClick={() => setGridFilter({ typeId: null })}
              className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--state-selected)] px-2 text-xs text-[var(--color-voluntary)]"
            >
              {typeLabel}
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {activeTaskName ? (
            <button
              type="button"
              data-filter-chip="task"
              aria-label={t("grid.filter.remove", { name: activeTaskName })}
              onClick={() => setGridFilter({ taskId: null })}
              className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--state-selected)] px-2 py-0.5 text-left text-xs text-[var(--color-voluntary)]"
            >
              <span className="min-w-0 wrap-anywhere">{activeTaskName}</span>
              <span aria-hidden="true" className="shrink-0">
                ×
              </span>
            </button>
          ) : null}
          {filter.from || filter.to ? (
            <button
              type="button"
              data-filter-chip="range"
              aria-label={t("grid.filter.remove", { name: rangeLabelFilter })}
              onClick={() => setGridFilter({ from: null, to: null })}
              className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--state-selected)] px-2 text-xs tabular-nums text-[var(--color-voluntary)]"
            >
              {rangeLabelFilter}
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {filterActive ? (
            <button
              type="button"
              data-filter-clear
              onClick={resetFilters}
              className="h-6 rounded-[var(--radius-control)] px-2 text-xs text-[var(--color-text-tertiary)] hover:bg-[var(--state-hover)]"
            >
              {t("grid.filter.clear")}
            </button>
          ) : null}
        </div>

        <div
          role="group"
          aria-label={t("grid.filter.legend")}
          className="ml-auto flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <i className="grid size-4 place-items-center rounded-[4px] bg-[color-mix(in_srgb,var(--color-voluntary)_13%,transparent)] text-[10px] font-semibold not-italic text-[var(--color-voluntary)]">
              ✓
            </i>
            {t("grid.cell.done")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="grid size-4 place-items-center rounded-[4px] bg-[color-mix(in_srgb,var(--color-missed)_11%,transparent)] text-[10px] font-semibold not-italic text-[var(--color-missed)]">
              ✗
            </i>
            {t("grid.cell.missed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="grid size-4 place-items-center rounded-[4px] border border-dashed border-[var(--color-border-strong)] text-[10px] font-semibold not-italic text-[var(--color-text-tertiary)]">
              –
            </i>
            {t("grid.cell.skipped")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="size-4 rounded-[4px] border-[1.5px] border-[var(--color-border-strong)]" />
            {t("grid.cell.pending")}
          </span>
        </div>

        <div
          id="grid-filter-panel"
          data-filter-panel
          data-open={filterOpen ? "" : undefined}
          aria-hidden={!filterOpen}
          style={{ display: filterOpen ? undefined : "none" }}
          className="absolute left-0 top-[calc(100%+8px)] z-40 w-[360px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
        >
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <b className="text-sm font-semibold text-[var(--color-text)]">
              {t("grid.filter.label")}
            </b>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {t("grid.filter.hint")}
            </span>
          </div>

          <div className="mb-2.5 grid grid-cols-[52px_1fr] items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {t("grid.filter.type")}
            </span>
            <select
              data-filter-type
              aria-label={t("grid.filter.typeAria")}
              value={filter.typeId ?? ""}
              onChange={(event) =>
                setGridFilter({ typeId: event.target.value || null })
              }
              className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
            >
              <option value="">{t("grid.filter.allTypes")}</option>
              {typeFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${"\u3000".repeat(option.depth)}${option.name}`}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2.5 grid grid-cols-[52px_1fr] items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {t("grid.filter.taskLabel")}
            </span>
            <select
              data-filter-task
              aria-label={t("grid.filter.task")}
              value={filter.taskId ?? ""}
              onChange={(event) =>
                setGridFilter({ taskId: event.target.value || null })
              }
              className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
            >
              <option value="">{t("grid.filter.allTasks")}</option>
              {data.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-1 grid grid-cols-[52px_1fr] items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {t("grid.filter.time")}
            </span>
            <div className="flex w-full min-w-0 items-center gap-1.5">
              <DateField
                data-filter-from
                value={filter.from}
                onChange={(next) => setGridFilter({ from: next })}
                aria-label={t("grid.filter.from")}
                allowClear
                className="h-8 w-0 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
              />
              <span className="text-xs text-[var(--color-text-tertiary)]">
                –
              </span>
              <DateField
                data-filter-to
                value={filter.to}
                onChange={(next) => setGridFilter({ to: next })}
                aria-label={t("grid.filter.to")}
                allowClear
                align="right"
                className="h-8 w-0 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end border-t border-[var(--color-divider)] pt-3">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] bg-[var(--color-green-solid)] px-3 text-xs font-semibold text-[var(--color-on-green)] hover:brightness-95"
            >
              {t("grid.filter.close")}
            </button>
          </div>
        </div>
      </div>

      {!ready ? (
        <GridSkeleton />
      ) : allRows.length === 0 ? (
        <section
          data-grid-empty
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <p className="m-0 text-sm text-[var(--color-text-secondary)]">
            {t(
              data.tasks.length > 0 ? "grid.filter.empty" : "grid.empty",
            )}
          </p>
          {data.tasks.length > 0 && filterActive ? (
            <p className="m-0 text-xs text-[var(--color-text-tertiary)]">
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
            className="pointer-events-none absolute top-0 z-30 flex items-center border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text-secondary)]"
            style={{ left: taskColWidth, height: MONTH_ROW_HEIGHT }}
          >
            {monthLabel}
          </div>

          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onClick={handleGridClick}
            onFocus={handleGridFocus}
            onDoubleClick={handleGridDoubleClick}
            onContextMenu={handleGridContextMenu}
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
                  className="sticky left-0 z-40 flex shrink-0 items-center border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-tertiary)]"
                  style={{ width: taskColWidth, height: DATE_ROW_HEIGHT }}
                >
                  {t("grid.corner")}
                </div>
                <div style={{ width: viewportWindow.leftPad }} />
                {headerCells.map((cell, index) => (
                  <DateHeader
                    key={cell.date}
                    date={cell.date}
                    day={cell.day}
                    weekday={cell.weekday}
                    width={visibleWidths[index] ?? cellSize}
                    height={DATE_ROW_HEIGHT}
                    isToday={cell.date === data.today}
                    overview={overview}
                  />
                ))}
                <div style={{ width: viewportWindow.rightPad }} />
              </div>

              {visibleGroups.map((group) => (
                <GridGroup
                  key={group.key}
                  groupKey={group.key}
                  group={group}
                  label={
                    group.type
                      ? typeDisplayName(group.type, t)
                      : t("grid.group.disabled")
                  }
                  color={
                    group.type
                      ? typeColorVar(group.type)
                      : "var(--color-border-strong)"
                  }
                  open={!collapsed.has(group.key)}
                  dates={visibleDates}
                  dateLabels={dateLabels}
                  widths={visibleWidths}
                  taskColWidth={taskColWidth}
                  leftPad={viewportWindow.leftPad}
                  rightPad={viewportWindow.rightPad}
                  totalWidth={totalWidth}
                  rowHeight={rowHeight}
                  groupHeight={groupHeight}
                  overview={overview}
                  today={data.today}
                  stateOf={data.cellState}
                  checkins={data.checkins}
                  focused={focused}
                  defaultFocus={defaultFocus}
                  labels={labels}
                  onReorder={handleReorder}
                  dragEnabled={!filterActive}
                  nameHistoryCounts={nameHistoryCounts}
                  expandedNames={expandedNames}
                />
              ))}
            </div>
          </div>

          {cellTarget ? (
            <div
              data-cell-editor
              className="absolute z-40 w-[272px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
              style={{ left: cellTarget.left, top: cellTarget.top }}
            >
              <div className="mb-3 min-w-0">
                <div
                  data-cell-editor-title
                  className="wrap-anywhere text-sm font-semibold text-[var(--color-text)]"
                >
                  {format(parseISO(cellTarget.date), "MM/dd")}{" "}
                  {cellTarget.taskName}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                  {t("grid.cell.title")}
                </div>
              </div>

              <div
                role="group"
                aria-label={t("grid.cell.status")}
                className="mb-3 grid grid-cols-2 gap-1.5"
              >
                {(
                  [
                    {
                      value: "done",
                      label: t("grid.cell.done"),
                      icon: "✓",
                      tone: "bg-[var(--color-voluntary)] text-white",
                    },
                    {
                      value: "missed",
                      label: t("grid.cell.missed"),
                      icon: "✗",
                      tone: "bg-[var(--color-missed)] text-white",
                    },
                    {
                      value: "skipped",
                      label: t("grid.cell.skipped"),
                      icon: "–",
                      tone: "bg-[var(--color-forced)] text-white",
                    },
                    {
                      value: null,
                      label: t("grid.cell.clear"),
                      icon: "○",
                      tone: "bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={statusDraft === option.value}
                    onClick={() => setStatusDraft(option.value)}
                    className={clsx(
                      "flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2 text-xs",
                      statusDraft === option.value
                        ? "border-[var(--color-voluntary)] bg-[var(--state-selected)] font-semibold text-[var(--color-voluntary)]"
                        : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        "grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-bold leading-none",
                        statusDraft === option.value
                          ? option.tone
                          : "bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]",
                      )}
                    >
                      {option.icon}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="mb-2 flex flex-col gap-1.5">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {t("grid.cell.value")}
                </span>
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
                  className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-voluntary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                />
              </label>

              <label className="mb-3 flex flex-col gap-1.5">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {t("grid.note.title")}
                </span>
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
                  className="h-[52px] w-full resize-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-voluntary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                />
              </label>

              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setCellTarget(null)}
                  className="h-8 rounded-[var(--radius-control)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)]"
                >
                  {t("grid.note.cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveCell}
                  className="h-8 rounded-[var(--radius-control)] bg-[var(--color-green-solid)] px-3 text-xs font-semibold text-[var(--color-on-green)] hover:brightness-95"
                >
                  {t("grid.note.save")}
                </button>
              </div>
            </div>
          ) : null}

          <footer className="flex h-9 flex-none items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-tertiary)]">
            <span>{t("grid.taskCount", { count: allRows.length })}</span>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span>{t("grid.dayCount", { count: dates.length })}</span>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span className="tabular-nums">
              {t("grid.today")} {format(parseISO(data.today), "MM/dd")}
            </span>
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
      <div className="flex h-16 flex-none items-center gap-2 border-b border-[var(--color-border)] px-3">
        <span className={clsx(bar, "h-2.5 w-20")} />
        <span className={clsx(bar, "ml-auto h-5 w-16")} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-12 items-end gap-1 border-b border-[var(--color-border)] px-3 pb-2">
          {Array.from({ length: SKELETON_COLUMNS }, (_, column) => (
            <span key={column} className={clsx(bar, "h-2 flex-1")} />
          ))}
        </div>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <div
            key={row}
            className="flex h-9 items-center gap-1 border-b border-[var(--color-border)] px-3"
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

      <div className="flex h-9 flex-none items-center gap-2 border-t border-[var(--color-border)] px-3">
        <span className={clsx(bar, "h-2 w-16")} />
        <span className={clsx(bar, "ml-auto h-2 w-24")} />
      </div>
    </section>
  );
}

function GridGroupInner({
  groupKey,
  group,
  label,
  color,
  open,
  dates,
  dateLabels,
  widths,
  taskColWidth,
  leftPad,
  rightPad,
  totalWidth,
  rowHeight,
  groupHeight,
  overview,
  today,
  stateOf,
  checkins,
  focused,
  defaultFocus,
  labels,
  onReorder,
  dragEnabled,
  nameHistoryCounts,
  expandedNames,
}: {
  groupKey: GroupKey;
  group: GridTypeGroup;
  label: string;
  color: string;
  open: boolean;
  dates: string[];
  dateLabels: Map<string, string>;
  widths: number[];
  taskColWidth: number;
  leftPad: number;
  rightPad: number;
  totalWidth: number;
  rowHeight: number;
  groupHeight: number;
  overview: boolean;
  today: string;
  stateOf: (row: GridRow, date: string) => CellState;
  checkins: Map<string, Checkin>;
  focused: { rowKey: string; taskId: string; date: string } | null;
  defaultFocus: { rowKey: string; taskId: string; date: string } | null;
  labels: GridLabels;
  onReorder: (groupKey: GroupKey, fromId: string, toId: string) => void;
  dragEnabled: boolean;
  nameHistoryCounts: Map<string, number>;
  expandedNames: Set<string>;
}) {
  const t = useT();
  const rows = group.rows;
  const groupDepth = group.depth;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const taskCount = group.count;

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
          style={{ width: taskColWidth, height: groupHeight }}
          className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-b border-r border-[var(--color-border)] bg-[var(--color-surface-2)] pr-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)]"
        >
          <span
            className="flex min-w-0 flex-1 items-center gap-2"
            style={{ paddingLeft: 12 + groupDepth * 16 }}
          >
            <span className="w-3 text-xs text-[var(--color-text-tertiary)]">
              {open ? "▾" : "▸"}
            </span>
            <i
              className="h-3 w-[3px] shrink-0 rounded-[2px]"
              style={{ background: color }}
            />
            <span className="truncate">{label}</span>
            <span className="ml-auto shrink-0 pr-1 font-normal tabular-nums text-[var(--color-text-tertiary)]">
              {taskCount}
            </span>
          </span>
        </button>
        <div
          className="flex-1 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]"
          style={{ minWidth: 0, height: groupHeight }}
        />
      </div>

      {open
        ? rows.map((row) => {
            const ariaPrefix = t("checkin.aria", {
              task: row.name,
              status: "",
            });
            return (
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
                          onReorder(groupKey, draggingId, row.task.id);
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
                  title={dragEnabled ? labels.drag : undefined}
                  data-task-name={row.key}
                  style={{
                    width: taskColWidth,
                    minHeight: rowHeight,
                    paddingLeft: 8 + groupDepth * 16,
                  }}
                  className={clsx(
                    "sticky left-0 z-10 flex shrink-0 cursor-grab items-center gap-2 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 active:cursor-grabbing group-hover/row:bg-[var(--color-surface-2)]",
                    overview
                      ? "text-xs"
                      : "text-sm",
                    (row.disabled || !row.current) &&
                      "text-[var(--color-text-tertiary)]",
                  )}
                >
                  <i
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      background: group.type
                        ? typeColorVar(group.type)
                        : "var(--color-border-strong)",
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
                      className="shrink-0 whitespace-nowrap rounded-[4px] px-1 text-xs leading-4 tabular-nums text-[var(--color-text-tertiary)] hover:bg-[var(--state-hover)]"
                    >
                      {expandedNames.has(row.task.id) ? "▾" : "▸"}{" "}
                      {nameHistoryCounts.get(row.task.id)}
                    </button>
                  ) : null}
                  {dragEnabled ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-xs text-[var(--color-text-tertiary)] opacity-0 group-hover/row:opacity-100"
                    >
                      ⋮⋮
                    </span>
                  ) : null}
                </div>

                <div style={{ width: leftPad }} />
                {dates.map((date, index) => {
                  const state = stateOf(row, date);
                  const checkin = checkins.get(checkinKey(row.task.id, date));
                  const value = checkin?.value ?? null;
                  const isFocused =
                    focused?.rowKey === row.key && focused.date === date;
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
                      dateLabel={dateLabels.get(date) ?? ""}
                      ariaPrefix={`${ariaPrefix}${labels.status[state]}`}
                      state={state}
                      value={value}
                      width={widths[index] ?? 32}
                      height={rowHeight}
                      isToday={date === today}
                      overview={overview}
                      focused={isFocused}
                      tabIndex={isFocused || (!focused && isDefault) ? 0 : -1}
                      hasNote={Boolean(checkin?.note)}
                      disabled={row.disabled || (!overview && state === "none")}
                      noteAddLabel={labels.noteAdd}
                      noteHasLabel={labels.noteHas}
                      noteTitle={labels.noteTitle}
                    />
                  );
                })}
                <div style={{ width: rightPad }} />
              </div>
            );
          })
        : null}
    </>
  );
}
