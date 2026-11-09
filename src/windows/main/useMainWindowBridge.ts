import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { onWidgetExpand } from "../../shared/events";

/**
 * 挂件只发失效信号，主窗口自己负责唤回：show → 解除最小化 → 聚焦。
 * 这样挂件不需要 window 权限，也不会和主窗口抢窗口控制权。
 */
export function useMainWindowBridge(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void onWidgetExpand(async ({ source }) => {
      if (source !== "widget") {
        return;
      }

      const window = getCurrentWindow();
      await window.show();
      await window.unminimize();
      await window.setFocus();
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch((error: unknown) => {
        console.error("[window] 无法监听挂件展开事件", error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
