import { clsx } from "clsx";

/** 复制结果轻提示：固定底部居中，不拦截点击。 */
export function CopyToast({
  message,
  error = false,
  placement = "window",
}: {
  message: string | null;
  error?: boolean;
  placement?: "window" | "widget";
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-error={error ? "true" : undefined}
      className={clsx(
        "pointer-events-none fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-popover)]",
        placement === "widget" ? "bottom-2" : "bottom-4",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "size-1.5 rounded-full",
          error ? "bg-[var(--color-missed)]" : "bg-[var(--color-voluntary)]",
        )}
      />
      {message}
    </div>
  );
}
