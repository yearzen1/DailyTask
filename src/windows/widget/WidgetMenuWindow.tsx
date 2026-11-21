import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { CheckinStatus } from "../../domain/types";
import { onWidgetMenuOpen } from "../../shared/events";
import { copyText } from "../../ui/clipboard";
import { MenuItem, MenuSeparator } from "../../ui/MenuSurface";
import { applyTheme } from "../../ui/theme";
import { computeMenuPlacement, MENU_SHADOW_PAD } from "./menuPlacement";
import {
  closeWidgetMenu,
  sendWidgetMenuAction,
  type WidgetMenuPayload,
} from "./widgetMenu";

const STATUS_ICON: Record<string, string> = {
  done: "✓",
  missed: "✗",
  skipped: "–",
  clear: "",
};

/**
 * 独立菜单窗口：挂件把数据交给 Rust，这里只负责画和回传动作。
 * 挂件窗口只有 260×360，菜单必须画在窗口外，所以单独开一个透明窗口。
 */
export function WidgetMenuWindow() {
  const [payload, setPayload] = useState<WidgetMenuPayload | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const lastRequest = useRef<string | null>(null);
  const placedFor = useRef<string | null>(null);

  const applyPayload = useCallback((next: WidgetMenuPayload) => {
    if (lastRequest.current === next.requestId) {
      return;
    }
    lastRequest.current = next.requestId;
    applyTheme(next.theme);
    setPayload(next);
  }, []);

  // 首次打开走挂载读取；之后窗口复用，由 Rust 推 `widget-menu:open`。
  useEffect(() => {
    let active = true;
    void invoke<WidgetMenuPayload | null>("read_widget_menu")
      .then((next) => {
        if (active && next) {
          applyPayload(next);
        }
      })
      .catch((error: unknown) => {
        console.error("[widget-menu] 读取菜单数据失败", error);
      });
    return () => {
      active = false;
    };
  }, [applyPayload]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void onWidgetMenuOpen((next) => {
      applyPayload(next);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error: unknown) => {
        console.error("[widget-menu] 监听打开事件失败", error);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyPayload]);

  useLayoutEffect(() => {
    if (!payload || placedFor.current === payload.requestId) {
      return;
    }
    const requestId = payload.requestId;
    placedFor.current = requestId;
    let frame = 0;
    let attempts = 0;

    // 窗口复用后内容高度会变，每次打开都重新量；首帧排不出来时再等两帧。
    const measure = () => {
      const node = card.current;
      if (!node || placedFor.current !== requestId) {
        return;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 && attempts < 20) {
        attempts += 1;
        frame = window.requestAnimationFrame(measure);
        return;
      }
      const placement = computeMenuPlacement({
        menu: {
          width: rect.width >= 40 ? rect.width : 196,
          height: rect.height >= 40 ? rect.height : 240,
        },
        anchor: payload.anchor,
        widget: payload.widget,
        workArea: payload.workArea,
        scaleFactor: payload.scaleFactor,
      });
      void invoke("place_widget_menu", {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      }).catch((error: unknown) => {
        console.error("[widget-menu] 定位菜单失败", error);
      });
    };

    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [payload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeWidgetMenu().catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!payload) {
    return null;
  }

  const { labels, kind, current } = payload;
  const skipActive = current === "skipped";

  const runAction = (status: CheckinStatus | null) => {
    void sendWidgetMenuAction({
      kind,
      id: payload.id,
      action: "status",
      status,
    }).catch((error: unknown) => {
      console.error("[widget-menu] 回传状态失败", error);
    });
  };

  const copyName = async () => {
    const copied = await copyText(payload.name);
    try {
      await sendWidgetMenuAction({
        kind,
        id: payload.id,
        action: "copy",
        copied,
      });
    } catch (error) {
      console.error("[widget-menu] 回传复制结果失败", error);
    }
  };

  return (
    <div style={{ padding: MENU_SHADOW_PAD }}>
      <div
        ref={card}
        role="menu"
        aria-label={labels.menu}
        className="widget-menu-card"
      >
        <div className="widget-menu-head">
          <p className="widget-menu-title" title={payload.name}>
            {payload.name}
          </p>
          <button
            type="button"
            data-menu-close
            aria-label={labels.close}
            onClick={() => {
              void closeWidgetMenu().catch(() => undefined);
            }}
            className="widget-menu-close"
          >
            ✕
          </button>
        </div>

        <MenuItem onClick={() => void copyName()}>{labels.copy}</MenuItem>

        {kind === "task" ? (
          <>
            <MenuSeparator />
            <div className="widget-menu-group">
              <i aria-hidden="true" />
              {labels.status}
            </div>
            <StatusItem
              state="done"
              label={labels.done}
              current={current}
              onPick={() => runAction("done")}
            />
            <StatusItem
              state="missed"
              label={labels.missed}
              current={current}
              onPick={() => runAction("missed")}
            />
            <StatusItem
              state="skipped"
              label={skipActive ? labels.unskip : labels.skipped}
              current={current}
              onPick={() => runAction(skipActive ? null : "skipped")}
            />
            <StatusItem
              state="clear"
              label={labels.clear}
              current={current}
              muted
              onPick={() => runAction(null)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatusItem({
  state,
  label,
  current,
  muted = false,
  onPick,
}: {
  state: "done" | "missed" | "skipped" | "clear";
  label: string;
  current: string | null;
  muted?: boolean;
  onPick: () => void;
}) {
  return (
    <MenuItem
      data-state={state}
      onClick={onPick}
      style={muted ? { color: "var(--color-text-muted)" } : undefined}
    >
      <span
        aria-hidden="true"
        className="widget-menu-icon"
        data-state={state}
      >
        {STATUS_ICON[state] ?? ""}
      </span>
      <span>{label}</span>
      {current === state ? (
        <span aria-hidden="true" className="widget-menu-current">
          ✓
        </span>
      ) : null}
    </MenuItem>
  );
}
