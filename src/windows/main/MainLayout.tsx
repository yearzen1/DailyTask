import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { MessageKey } from "../../shared/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore, type ViewName } from "../../stores/uiStore";
import { useUpdateStore } from "../../stores/updateStore";
import { Icon, type IconName } from "../../ui/Icon";
import { useT } from "../../ui/useT";
import {
  DEFAULT_NAV_ORDER,
  moveNavItem,
  readNavOrder,
  sanitizeNavOrder,
  writeNavOrder,
} from "./navOrder";
import Manage from "./views/Manage";
import Settings from "./views/Settings";
import Stats from "./views/Stats";
import TaskGrid from "./views/TaskGrid";
import Today from "./views/Today";
import Todos from "./views/Todos";

const NAV_BY_VIEW: Record<
  ViewName,
  { labelKey: MessageKey; icon: IconName }
> = {
  today: { labelKey: "nav.today", icon: "today" },
  grid: { labelKey: "nav.grid", icon: "grid" },
  todos: { labelKey: "nav.todos", icon: "todo" },
  manage: { labelKey: "nav.manage", icon: "manage" },
  stats: { labelKey: "nav.stats", icon: "stats" },
  settings: { labelKey: "nav.settings", icon: "settings" },
};

/** 只有按住超过这个时长，侧栏才显示抓取光标。 */
const LONG_PRESS_MS = 300;

function renderView(view: ViewName) {
  switch (view) {
    case "today":
      return <Today />;
    case "grid":
      return <TaskGrid />;
    case "todos":
      return <Todos />;
    case "manage":
      return <Manage />;
    case "stats":
      return <Stats />;
    case "settings":
      return <Settings />;
  }
}

export function MainLayout() {
  const t = useT();
  const currentView = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const hasUpdate = useUpdateStore((state) => state.available !== null);
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const navOrderSetting = useSettingsStore((state) => state.settings.navOrder);
  const updateSettings = useSettingsStore((state) => state.update);
  const [order, setOrder] = useState<ViewName[]>(readNavOrder);
  const [dragging, setDragging] = useState<ViewName | null>(null);
  const [grabCursor, setGrabCursor] = useState<ViewName | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const migrated = useRef(false);
  const dragRef = useRef<{
    view: ViewName;
    startY: number;
    active: boolean;
  } | null>(null);
  const gapRef = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  useEffect(
    () => () => {
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
      }
    },
    [],
  );

  // settings 表是唯一事实来源；首次启动把旧 localStorage 顺序迁过去。
  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }
    if (navOrderSetting.length > 0) {
      const next = sanitizeNavOrder(navOrderSetting);
      setOrder(next);
      writeNavOrder(next);
      migrated.current = true;
      return;
    }
    if (!migrated.current) {
      migrated.current = true;
      const cached = readNavOrder();
      if (cached.join("|") !== DEFAULT_NAV_ORDER.join("|")) {
        void updateSettings({ navOrder: cached }).catch((error: unknown) => {
          console.error("[nav] 迁移侧栏顺序失败", error);
        });
        return;
      }
    }
    setOrder([...DEFAULT_NAV_ORDER]);
    writeNavOrder(DEFAULT_NAV_ORDER);
  }, [navOrderSetting, settingsLoaded, updateSettings]);

  const applyOrder = (next: ViewName[]) => {
    setOrder(next);
    writeNavOrder(next);
    void updateSettings({ navOrder: next }).catch((error: unknown) => {
      console.error("[nav] 保存侧栏顺序失败", error);
    });
  };

  const updateGap = (next: number | null) => {
    gapRef.current = next;
    setGap(next);
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    view: ViewName,
  ) => {
    if (event.button > 0) {
      return;
    }
    dragRef.current = { view, startY: event.clientY, active: false };
    suppressClick.current = false;
    clearHold();
    setGrabCursor(null);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setGrabCursor(view);
    }, LONG_PRESS_MS);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < 4) {
        return;
      }
      drag.active = true;
      suppressClick.current = true;
      clearHold();
      setGrabCursor(null);
      setDragging(drag.view);
    }
    const nav = navRef.current;
    if (!nav) {
      return;
    }
    const rect = nav.getBoundingClientRect();
    const step = rect.height / order.length;
    const raw = Math.round((event.clientY - rect.top) / step);
    updateGap(Math.max(0, Math.min(order.length, raw)));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    clearHold();
    setGrabCursor(null);
    const targetGap = gapRef.current;
    if (drag?.active && targetGap !== null) {
      const from = order.indexOf(drag.view);
      const to = from < targetGap ? targetGap - 1 : targetGap;
      if (to !== from) {
        applyOrder(moveNavItem(order, from, to));
      }
    }
    setDragging(null);
    updateGap(null);
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    view: ViewName,
  ) => {
    if (!event.altKey) {
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const from = order.indexOf(view);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= order.length) {
      return;
    }
    applyOrder(moveNavItem(order, from, to));
  };

  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <aside className="flex w-[var(--nav-width)] shrink-0 flex-col gap-0.5 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-3">
        <nav
          ref={navRef}
          aria-label={t("nav.aria")}
          className="flex flex-col gap-0.5"
        >
          {order.map((view, index) => {
            const item = NAV_BY_VIEW[view];
            const active = view === currentView;
            const draggingThis = dragging === view;
            return (
              <div key={view} className="relative">
                {gap === index ? <DropLine position="top" /> : null}
                {index === order.length - 1 && gap === order.length ? (
                  <DropLine position="bottom" />
                ) : null}
                <button
                  type="button"
                  data-nav-item={view}
                  data-dragging={draggingThis ? "" : undefined}
                  title={t("nav.dragHint")}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    setView(view);
                  }}
                  onPointerDown={(event) => beginDrag(event, view)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                  onKeyDown={(event) => handleKeyDown(event, view)}
                  className={`${
                    active
                      ? "bg-[var(--state-selected)] font-semibold text-[var(--color-voluntary)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
                  } flex h-9 w-full touch-none cursor-default items-center gap-2 rounded-[var(--radius-control)] px-2 text-left ${
                    draggingThis
                      ? "cursor-grabbing opacity-50"
                      : grabCursor === view
                        ? "cursor-grab"
                        : ""
                  }`}
                >
                  <Icon name={item.icon} />
                  {t(item.labelKey)}
                  {view === "settings" && hasUpdate ? (
                    <span
                      data-update-dot
                      aria-label={t("update.dot")}
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--color-missed)]"
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto px-2 py-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("app.footer", { version: __APP_VERSION__ })}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        {renderView(currentView)}
      </section>
    </div>
  );
}

/** 拖拽时的插入位置指示线，绝对定位于相邻两项之间，不改变布局。 */
function DropLine({ position }: { position: "top" | "bottom" }) {
  return (
    <span
      aria-hidden="true"
      data-nav-gap={position}
      className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-[var(--color-voluntary)] ${
        position === "top" ? "-top-px" : "-bottom-px"
      }`}
    />
  );
}
