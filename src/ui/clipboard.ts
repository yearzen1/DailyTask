/**
 * 复制文本到系统剪贴板。
 * 优先 Clipboard API，失败或不可用时回退到隐藏 textarea + execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 继续走兼容路径：部分 WebView 没有剪贴板权限。
    }
  }

  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return (
      typeof document.execCommand === "function" &&
      document.execCommand("copy")
    );
  } catch {
    return false;
  } finally {
    textarea.remove();
    active?.focus();
  }
}
