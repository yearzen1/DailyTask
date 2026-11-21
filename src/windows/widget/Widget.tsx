import { PhysicalPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { format, parseISO } from "date-fns";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { nextCellState } from "../../domain/settle";
import type { CellState } from "../../domain/types";
import { emitWidgetExpand, onWidgetMenuAction } from "../../shared/events";
import { useCheckinsStore } from "../../stores/checkinsStore";
import {
  useTodayData,
  type CategoryStat,
  type DueTodoItem,
  type TodayTask,
  type TodayTypeGroup,
} from "../../stores/selectors/today";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTodosStore } from "../../stores/todosStore";
import { CopyToast } from "../../ui/CopyToast";
import { typeColorVar, typeDisplayName } from "../../ui/taskType";
import { applyTheme } from "../../ui/theme";
import { useCopyFeedback } from "../../ui/useCopyFeedback";
import { useT } from "../../ui/useT";
import {
  applyWidgetLayout,
  openCapsuleMenu,
  readCollapsedPreference,
  readSidePreference,
  writeCollapsedPreference,
  writeSidePreference,
  type WidgetSide,
} from "./capsule";
import {
  closeWidgetMenu,
  destroyWidgetMenu,
  ensureWidgetMenu,
  openWidgetMenu,
} from "./widgetMenu";

const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TODOS_GROUP_KEY = "__todos";
/** 展开后等启动稳定再预热；闲置超过这个时间就把菜单窗口还给系统。 */
const MENU_PREWARM_MS = 1200;
const MENU_IDLE_MS = 5 * 60 * 1000;

/**
 * 展开态与「今日」页内容一致：日期、完成率、自愿/被迫分项、全部任务、全部到期待办。
 * 标题与进度固定，中间内容滚动；高度预算见 docs/reference/windows-and-tray.md（内容区 240px）。
 */
export function Widget() {
  const t = useT();
  const data = useTodayData();
  const setStatus = useCheckinsStore((state) => state.setStatus);
  const setValue = useCheckinsStore((state) => state.setValue);
  const setTodoDone = useTodosStore((state) => state.setDone);
  const alwaysOnTop = useSettingsStore((state) => state.settings.alwaysOnTop);
  const theme = useSettingsStore((state) => state.settings.theme);
  const updateSettings = useSettingsStore((state) => state.update);
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [side, setSide] = useState<WidgetSide>(readSidePreference);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const { message: copyMessage, error: copyError, notify } = useCopyFeedback();
  const initialCollapsed = useRef(collapsed);
  const initialSide = useRef(side);
  const today = data.today;
  const todayRef = useRef(today);
  todayRef.current = today;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const setStatusRef = useRef(setStatus);
  setStatusRef.current = setStatus;
  const menuIdle = useRef<number | null>(null);

  const clearMenuIdle = useCallback(() => {
    if (menuIdle.current !== null) {
      window.clearTimeout(menuIdle.current);
      menuIdle.current = null;
    }
  }, []);

  const recycleMenu = useCallback(() => {
    clearMenuIdle();
    void destroyWidgetMenu().catch((error: unknown) => {
      console.error("[widget] 回收菜单窗口失败", error);
    });
  }, [clearMenuIdle]);

  /** 每次打开菜单都重新计时；长时间不右键就销毁窗口，不占那一个渲染进程。 */
  const armMenuIdle = useCallback(() => {
    clearMenuIdle();
    menuIdle.current = window.setTimeout(() => {
      menuIdle.current = null;
      recycleMenu();
    }, MENU_IDLE_MS);
  }, [clearMenuIdle, recycleMenu]);

  const prewarmMenu = useCallback(() => {
    void ensureWidgetMenu()
      .then(() => {
        armMenuIdle();
      })
      .catch((error: unknown) => {
        console.error("[widget] 预热菜单窗口失败", error);
      });
  }, [armMenuIdle]);

  useEffect(() => {
    void getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch((error: unknown) => {
      console.error("[widget] 更新置顶状态失败", error);
    });
  }, [alwaysOnTop]);

  // 主窗切换主题后，挂件通过 settings:changed 重读设置并重放主题。
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 启动时如果上次是胶囊态，直接贴到记住的一侧。
  useEffect(() => {
    if (initialCollapsed.current) {
      void applyWidgetLayout(true, initialSide.current).catch(
        (error: unknown) => {
          console.error("[widget] 恢复胶囊态失败", error);
        },
      );
    }
  }, []);

  // 展开态才预热；胶囊态不常驻菜单窗口。
  useEffect(() => {
    if (initialCollapsed.current) {
      return;
    }
    const timer = window.setTimeout(prewarmMenu, MENU_PREWARM_MS);
    return () => window.clearTimeout(timer);
  }, [prewarmMenu]);

  // 收起成胶囊或卸载时销毁菜单窗口，把那一个渲染进程还给系统。
  useEffect(() => {
    if (!collapsed) {
      return;
    }
    recycleMenu();
  }, [collapsed, recycleMenu]);

  useEffect(
    () => () => {
      clearMenuIdle();
      void destroyWidgetMenu().catch(() => undefined);
    },
    [clearMenuIdle],
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const setCapsule = (next: boolean) => {
    writeCollapsedPreference(next);
    setCollapsed(next);
    if (next) {
      // 先立刻收起菜单，随后的 collapsed effect 会销毁窗口。
      void closeWidgetMenu().catch(() => undefined);
    } else {
      prewarmMenu();
    }
    // 不记住分组折叠：每次从胶囊展开都回到全展开。
    setCollapsedGroups(new Set());
    void applyWidgetLayout(next, next ? undefined : side)
      .then((used) => {
        if (used) {
          writeSidePreference(used);
          setSide(used);
        }
      })
      .catch((error: unknown) => {
        console.error("[widget] 调整挂件尺寸失败", error);
      });
  };

  /** 拖动结束后吸附到最近的左/右边缘。 */
  const snapCapsule = () => {
    void applyWidgetLayout(true)
      .then((used) => {
        if (used) {
          writeSidePreference(used);
          setSide(used);
        }
      })
      .catch((error: unknown) => {
        console.error("[widget] 吸附胶囊失败", error);
      });
  };

  const togglePin = () => {
    void updateSettings({ alwaysOnTop: !alwaysOnTop }).catch(
      (error: unknown) => {
        console.error("[widget] 保存置顶设置失败", error);
      },
    );
  };

  const rowCount = data.groups.reduce(
    (total, group) => total + group.rows.length,
    0,
  );
  const completed = data.progress.done;
  const total = data.progress.applicable - data.progress.skipped;
  const percent = Math.round(data.progress.ratio * 100);
  const statusText =
    total === 0
      ? t("today.noTasks")
      : data.progress.pending > 0
        ? t("today.remaining", { count: data.progress.pending })
        : t("today.allDone");
  const dueTodos = [...data.overdueTodos, ...data.todayTodos];
  const ratio = total === 0 ? 0 : completed / total;

  const cycle = (row: TodayTask) => {
    void setStatus(
      row.task.id,
      data.today,
      nextCellState(row.state),
    ).catch((error: unknown) => {
      console.error("[widget] 切换任务状态失败", error);
    });
  };

  const saveValue = (row: TodayTask, value: string) => {
    void setValue(
      row.task.id,
      data.today,
      value.trim() === "" ? null : value.trim(),
    ).catch((error: unknown) => {
      console.error("[widget] 保存记录值失败", error);
    });
  };

  const toggleTodo = (item: DueTodoItem) => {
    void setTodoDone(item.todo.id, !item.todo.done);
  };

  const openTaskMenu = (row: TodayTask, event: ReactMouseEvent) => {
    event.preventDefault();
    void openWidgetMenu({
      kind: "task",
      id: row.task.id,
      name: row.task.name,
      state: row.state,
      theme,
      clientX: event.clientX,
      clientY: event.clientY,
    })
      .then(() => {
        armMenuIdle();
      })
      .catch((error: unknown) => {
        console.error("[widget] 打开任务菜单失败", error);
      });
  };

  const openTodoMenu = (item: DueTodoItem, event: ReactMouseEvent) => {
    event.preventDefault();
    void openWidgetMenu({
      kind: "todo",
      id: item.todo.id,
      name: item.todo.title,
      state: "none",
      theme,
      clientX: event.clientX,
      clientY: event.clientY,
    })
      .then(() => {
        armMenuIdle();
      })
      .catch((error: unknown) => {
        console.error("[widget] 打开待办菜单失败", error);
      });
  };

  // 菜单在独立窗口里：点完一项由 Rust 转发回来，这里只负责落库和提示。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void onWidgetMenuAction((action) => {
      if (action.action === "copy") {
        notifyRef.current(action.copied === true);
        return;
      }
      if (action.kind === "task" && action.action === "status") {
        void setStatusRef
          .current(action.id, todayRef.current, action.status ?? null)
          .catch((error: unknown) => {
            console.error("[widget] 更新任务状态失败", error);
          });
      }
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error: unknown) => {
        console.error("[widget] 监听任务菜单失败", error);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 挂件滚动或卸载时菜单就失效了：它画在窗口外，不会跟着内容一起动。
  useEffect(() => {
    const close = () => {
      void closeWidgetMenu().catch(() => undefined);
    };
    const scroller = document.querySelector("[data-widget-scroll]");
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, true);
    // 菜单拿不到前台焦点时收不到 blur，这里再兜一层：点挂件 / 按 Esc 都关。
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    return () => {
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
      close();
    };
  }, [collapsed]);

  if (collapsed) {
    return (
      <WidgetCapsule
        done={completed}
        total={total}
        side={side}
        label={t("widget.expandCapsule", { done: completed, total })}
        hint={t("widget.capsuleHint")}
        onExpand={() => setCapsule(false)}
        onDragEnd={snapCapsule}
      />
    );
  }

  return (
    <div className="h-full w-full p-2">
      <section className="group relative flex h-full select-none flex-col overflow-hidden rounded-[var(--radius-widget)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-[var(--shadow-widget)]">
        <div className="relative z-[1] flex h-full flex-col">
          <header className="relative flex h-[22px] shrink-0 items-center">
            <div
              data-tauri-drag-region
              className="flex h-full min-w-0 flex-1 items-center pr-1"
            >
              <span className="truncate text-[12.5px] font-semibold">
                {t("today.title")} · {data.dateLabel}
              </span>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 flex h-[22px] items-center gap-px bg-[var(--color-surface)] pl-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              <WidgetAction
                label={t("widget.expand")}
                onClick={() =>
                  void emitWidgetExpand({ source: "widget" })
                    .then(() => setCapsule(true))
                    .catch((error: unknown) => {
                      console.error("[widget] 展开主窗口失败", error);
                    })
                }
              >
                <path d="M6.5 2.5h-4v4M9.5 13.5h4v-4M2.5 2.5l4.5 4.5M13.5 13.5L9 9" />
              </WidgetAction>
              <WidgetAction
                label={t(alwaysOnTop ? "widget.unpin" : "widget.pin")}
                active={alwaysOnTop}
                onClick={togglePin}
              >
                <path d="M8 1.8v4.4M4.8 6.2h6.4L10 10H6L4.8 6.2zM8 10.2v4" />
              </WidgetAction>
              <WidgetAction
                label={t("widget.collapse")}
                onClick={() => setCapsule(true)}
              >
                <path d="M6 3.5L10.5 8 6 12.5" />
              </WidgetAction>
            </div>
          </header>

          <div className="my-1 flex min-h-[50px] shrink-0 items-center gap-3">
            <div
              role="img"
              aria-label={t("progress.aria", { done: completed, total })}
              className="relative size-10 shrink-0"
            >
              <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
                <circle
                  cx="20"
                  cy="20"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="color-mix(in srgb, var(--color-text) 12%, transparent)"
                  strokeWidth="4"
                />
                <circle
                  cx="20"
                  cy="20"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--color-voluntary)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
                  transform="rotate(-90 20 20)"
                  style={{
                    transition:
                      "stroke-dashoffset .3s cubic-bezier(.4, 0, .2, 1)",
                  }}
                />
              </svg>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <b className="text-sm tabular-nums">
                  {completed} / {total}
                </b>
                <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
                  {percent}%
                </span>
                <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                  · {statusText}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-muted)]">
                {data.typeStats.map((item) => (
                  <CategoryCount
                    key={item.type.id}
                    label={typeDisplayName(item.type, t)}
                    color={typeColorVar(item.type)}
                    stat={item.stat}
                  />
                ))}
                {data.todoStat.total > 0 ? (
                  <CategoryCount
                    label={t("today.category.todos")}
                    color="var(--color-warning)"
                    stat={data.todoStat}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div
            data-widget-scroll
            className="widget-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5"
          >
            {rowCount === 0 ? (
              <p className="m-0 py-2 text-center text-[11px] text-[var(--color-text-muted)]">
                {t("today.empty")}
              </p>
            ) : (
              data.groups.map((group) => (
                <WidgetTaskGroup
                  key={group.type.id}
                  group={group}
                  title={typeDisplayName(group.type, t)}
                  color={typeColorVar(group.type)}
                  open={!collapsedGroups.has(group.type.id)}
                  hidden={group.path
                    .slice(0, -1)
                    .some((ancestor) => collapsedGroups.has(ancestor.id))}
                  onToggle={() => toggleGroup(group.type.id)}
                  onCycle={cycle}
                  onValue={saveValue}
                  onMenu={openTaskMenu}
                />
              ))
            )}

            {dueTodos.length > 0 ? (
              <div className={rowCount > 0 ? "mt-1" : ""}>
                <button
                  type="button"
                  aria-expanded={!collapsedGroups.has(TODOS_GROUP_KEY)}
                  aria-label={t(
                    collapsedGroups.has(TODOS_GROUP_KEY)
                      ? "common.expandSection"
                      : "common.collapseSection",
                    { section: t("today.dueTodos") },
                  )}
                  onClick={() => toggleGroup(TODOS_GROUP_KEY)}
                  className="flex h-5 w-full items-center gap-1.5 rounded-[4px] px-1 text-left text-[10.5px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <i
                    aria-hidden="true"
                    data-todo-bar
                    className="h-3 w-[3px] shrink-0 rounded-[2px]"
                    style={{ background: "var(--color-warning)" }}
                  />
                  <span className="truncate">{t("today.dueTodos")}</span>
                  <span aria-hidden="true" className="shrink-0 text-[11px] leading-none">
                    {collapsedGroups.has(TODOS_GROUP_KEY) ? "▸" : "▾"}
                  </span>
                  <span className="ml-auto shrink-0 font-normal tabular-nums">
                    {data.todoStat.done} / {data.todoStat.total}
                  </span>
                </button>
                {collapsedGroups.has(TODOS_GROUP_KEY)
                  ? null
                  : dueTodos.map((item) => (
                      <WidgetTodoRow
                        key={item.todo.id}
                        item={item}
                        onToggle={() => toggleTodo(item)}
                        onMenu={(event) => openTodoMenu(item, event)}
                      />
                    ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <CopyToast
        message={copyMessage}
        error={copyError}
        placement="widget"
      />
    </div>
  );
}

function WidgetCapsule({
  done,
  total,
  side,
  label,
  hint,
  onExpand,
  onDragEnd,
}: {
  done: number;
  total: number;
  side: WidgetSide;
  label: string;
  hint: string;
  onExpand: () => void;
  onDragEnd: () => void;
}) {
  const t = useT();
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const startWindow = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const suppressClick = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent) => {
    if (event.button > 0) {
      return;
    }
    dragStart.current = {
      x: event.screenX || event.clientX,
      y: event.screenY || event.clientY,
    };
    startWindow.current = null;
    dragged.current = false;
    suppressClick.current = false;
    // 捕获指针，保证移动超出胶囊范围后仍能收到 pointermove。
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void getCurrentWindow()
      .outerPosition()
      .then((position) => {
        startWindow.current = { x: position.x, y: position.y };
      })
      .catch((error: unknown) => {
        console.error("[widget] 读取挂件位置失败", error);
      });
  };

  const handlePointerMove = (event: ReactPointerEvent) => {
    const start = dragStart.current;
    const origin = startWindow.current;
    if (!start || !origin) {
      return;
    }
    const dx = (event.screenX || event.clientX) - start.x;
    const dy = (event.screenY || event.clientY) - start.y;
    if (!dragged.current && Math.hypot(dx, dy) < 4) {
      return;
    }
    dragged.current = true;
    suppressClick.current = true;
    const scale = window.devicePixelRatio || 1;
    void getCurrentWindow()
      .setPosition(
        new PhysicalPosition(
          Math.round(origin.x + dx * scale),
          Math.round(origin.y + dy * scale),
        ),
      )
      .catch((error: unknown) => {
        console.error("[widget] 拖动挂件失败", error);
      });
  };

  const handlePointerUp = () => {
    dragStart.current = null;
    startWindow.current = null;
    if (dragged.current) {
      dragged.current = false;
      onDragEnd();
    }
  };

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onExpand();
  };

  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    void openCapsuleMenu({
      expandLabel: t("widget.capsuleExpand"),
      hideLabel: t("widget.hideCapsule"),
      onExpand,
    }).catch((error: unknown) => {
      console.error("[widget] 打开胶囊菜单失败", error);
    });
  };

  const rounded =
    side === "right"
      ? "rounded-l-[var(--radius-pill)]"
      : "rounded-r-[var(--radius-pill)]";

  return (
    <div className="h-full w-full p-1">
      <button
        type="button"
        data-widget-capsule
        data-widget-side={side}
        aria-label={label}
        title={hint}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`flex h-full w-full items-center justify-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[var(--color-text)] shadow-[var(--shadow-widget)] transition-colors hover:border-[var(--color-voluntary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${rounded}`}
      >
        <span
          aria-hidden="true"
          className="text-[10px] leading-none text-[var(--color-text-muted)]"
        >
          {side === "right" ? "‹" : "›"}
        </span>
        <span className="text-[11px] leading-none">
          {t("widget.capsuleExpand")}
        </span>
        <b className="text-[10px] leading-none tabular-nums text-[var(--color-text-muted)]">
          {done}/{total}
        </b>
      </button>
    </div>
  );
}

function WidgetAction({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "grid size-[18px] place-items-center rounded-[4px] bg-[var(--state-active)] text-[var(--color-text)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          : "grid size-[18px] place-items-center rounded-[4px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      }
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

const ROW_SYMBOLS: Record<CellState, string> = {
  done: "✓",
  missed: "✗",
  skipped: "–",
  pending: "",
  none: "",
};

const ROW_ICON: Record<CellState, string> = {
  done: "border-[var(--color-voluntary)] bg-[var(--color-voluntary)] text-white",
  missed:
    "border-[var(--color-missed)] text-[var(--color-missed)]",
  skipped:
    "border-dashed border-[var(--color-border-strong)] bg-[var(--color-na)] text-[var(--color-text-muted)]",
  pending: "border-[var(--color-border-strong)] text-transparent",
  none: "border-[var(--color-border-strong)] text-transparent",
};

function CategoryCount({
  label,
  color,
  stat,
}: {
  label: string;
  color: string;
  stat: CategoryStat;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
      <i className="size-2 rounded-full" style={{ background: color }} />
      {label} {stat.done} / {stat.total}
    </span>
  );
}

function WidgetTaskGroup({
  group,
  title,
  color,
  open,
  hidden,
  onToggle,
  onCycle,
  onValue,
  onMenu,
}: {
  group: TodayTypeGroup;
  title: string;
  color: string;
  open: boolean;
  hidden: boolean;
  onToggle: () => void;
  onCycle: (row: TodayTask) => void;
  onValue: (row: TodayTask, value: string) => void;
  onMenu: (row: TodayTask, event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const { rows, stat, depth } = group;
  if (hidden) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t(
          open ? "common.collapseSection" : "common.expandSection",
          { section: title },
        )}
        onClick={onToggle}
        style={{ paddingLeft: 4 + depth * 10 }}
        className="flex h-5 w-full items-center gap-1.5 rounded-[4px] pr-1 text-left text-[10.5px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <i
          aria-hidden="true"
          className="h-3 w-[3px] shrink-0 rounded-[2px]"
          style={{ background: color }}
        />
        <span className="truncate">{title}</span>
        <span aria-hidden="true" className="shrink-0 text-[11px] leading-none">
          {open ? "▾" : "▸"}
        </span>
        <span className="ml-auto shrink-0 font-normal tabular-nums">
          {stat.done} / {stat.total}
        </span>
      </button>
      {open
        ? rows.map((row) => (
            <div key={row.task.id} style={{ paddingLeft: depth * 10 }}>
              <WidgetTaskRow
                row={row}
                onCycle={() => onCycle(row)}
                onValue={(value) => onValue(row, value)}
                onMenu={(event) => onMenu(row, event)}
              />
            </div>
          ))
        : null}
    </div>
  );
}

function WidgetTaskRow({
  row,
  onCycle,
  onValue,
  onMenu,
}: {
  row: TodayTask;
  onCycle: () => void;
  onValue: (value: string) => void;
  onMenu: (event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.value ?? "");
  const finished = useRef(false);
  const nameClass =
    row.state === "skipped"
      ? "min-w-0 flex-1 wrap-anywhere text-[var(--color-text-muted)] line-through"
      : row.state === "done"
        ? "min-w-0 flex-1 wrap-anywhere text-[var(--color-text-muted)]"
        : "min-w-0 flex-1 wrap-anywhere";

  useEffect(() => {
    if (!editing) {
      setDraft(row.value ?? "");
    }
  }, [editing, row.value]);

  const startEditing = () => {
    finished.current = false;
    setDraft(row.value ?? "");
    setEditing(true);
  };

  const commit = () => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    setEditing(false);
    onValue(draft);
  };

  const cancel = () => {
    finished.current = true;
    setDraft(row.value ?? "");
    setEditing(false);
  };

  const base =
    "flex min-h-[26px] w-full items-center gap-[6px] rounded-[5px] px-1 py-0.5 pr-6 text-left text-xs";

  return (
    <div className="group relative" data-state={row.state}>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("widget.cycle", { task: row.task.name })}
        onClick={onCycle}
        onContextMenu={onMenu}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCycle();
          }
        }}
        className={`${base} cursor-pointer hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]`}
      >
        <span
          aria-hidden="true"
          className={`grid size-[17px] shrink-0 place-items-center rounded-[4px] border-[1.4px] text-[10px] font-bold leading-none ${ROW_ICON[row.state]}`}
        >
          {ROW_SYMBOLS[row.state]}
        </span>
        <span className={nameClass}>{row.task.name}</span>

        {editing ? (
          <input
            autoFocus
            data-widget-value-input
            value={draft}
            aria-label={t("widget.editValue", { task: row.task.name })}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            onBlur={commit}
            className="w-16 shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1 py-px text-[10px] text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        ) : (
          <button
            type="button"
            data-widget-value={row.value ?? undefined}
            aria-label={t("widget.editValue", { task: row.task.name })}
            onClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
            className={`max-w-[42%] shrink-0 truncate rounded-[var(--radius-pill)] px-1 text-[10px] tabular-nums text-[var(--color-text-muted)] hover:bg-[var(--state-active)] ${
              row.value
                ? "bg-[var(--state-hover)]"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
          >
            {row.value ?? t("today.addValue")}
          </button>
        )}
      </div>

      <button
        type="button"
        data-widget-task-menu
        aria-label={t("widget.menu.open", { task: row.task.name })}
        onClick={(event) => {
          event.stopPropagation();
          onMenu(event);
        }}
        className="absolute right-0 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-[3px] text-[11px] leading-none text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--state-active)] focus:opacity-100 group-hover:opacity-100"
      >
        <span aria-hidden="true">⋯</span>
      </button>
    </div>
  );
}

function WidgetTodoRow({
  item,
  onToggle,
  onMenu,
}: {
  item: DueTodoItem;
  onToggle: () => void;
  onMenu: (event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const { todo, overdueDays } = item;
  const overdue = overdueDays > 0;
  const done = todo.done;

  return (
    <button
      type="button"
      data-done={done ? "" : undefined}
      aria-pressed={done}
      aria-label={t(done ? "todos.markUndone" : "todos.markDone", {
        title: todo.title,
      })}
      onClick={onToggle}
      onContextMenu={onMenu}
      className="flex min-h-[26px] w-full items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-left text-[11.5px] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <span
        aria-hidden="true"
        className={`grid size-3 shrink-0 place-items-center rounded-full border-[1.4px] text-[8px] leading-none ${
          done
            ? "border-[var(--color-voluntary)] bg-[var(--color-voluntary)] text-white"
            : "border-[var(--color-border-strong)] text-transparent"
        }`}
      >
        ✓
      </span>
      <span
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
          done ? "text-[var(--color-text-muted)] line-through" : ""
        }`}
      >
        {todo.title}
      </span>
      <span className="shrink-0 text-[9.5px] tabular-nums text-[var(--color-text-muted)]">
        {format(parseISO(todo.dueDate as string), "MM/dd")}
      </span>
      <span
        className={
          overdue
            ? "shrink-0 text-[9.5px] font-semibold text-[var(--color-missed)]"
            : "shrink-0 text-[9.5px] font-semibold text-[var(--color-warning)]"
        }
      >
        {overdue
          ? t("today.overdueDays", { days: overdueDays })
          : t("today.dueToday")}
      </span>
    </button>
  );
}
