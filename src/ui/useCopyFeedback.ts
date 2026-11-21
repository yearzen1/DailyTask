import { useCallback, useEffect, useRef, useState } from "react";

import { copyText } from "./clipboard";
import { useT } from "./useT";

const TOAST_MS = 1500;

/** 复制文本并给出短暂成功 / 失败提示。 */
export function useCopyFeedback() {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  /** 复制已在别处完成（如独立菜单窗口）时，只补一条提示。 */
  const notify = useCallback(
    (ok: boolean) => {
      setError(!ok);
      setMessage(t(ok ? "common.copied" : "common.copyFailed"));
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, TOAST_MS);
    },
    [t],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      notify(ok);
      return ok;
    },
    [notify],
  );

  return { message, error, copy, notify };
}
