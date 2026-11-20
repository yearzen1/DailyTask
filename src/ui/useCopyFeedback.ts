import { useEffect, useRef, useState } from "react";

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

  const copy = async (text: string) => {
    const ok = await copyText(text);
    setError(!ok);
    setMessage(t(ok ? "common.copied" : "common.copyFailed"));
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setMessage(null);
    }, TOAST_MS);
    return ok;
  };

  return { message, error, copy };
}
