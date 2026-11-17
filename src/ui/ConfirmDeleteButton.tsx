import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { DeleteConfirmation } from "../shared/deleteConfirmation";
import { useT } from "./useT";

export interface ConfirmDeleteButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> {
  /** 被删除对象的显示名，用于标题与描述。 */
  name: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  errorMessage?: string;
  /** 只在用户在确认框里点「确认删除」后调用。 */
  onConfirm: (confirmation: DeleteConfirmation) => void | Promise<void>;
  children: ReactNode;
}

/**
 * 所有删除入口的统一封装：触发器 + 二次确认 + 失败提示。
 * ConfirmDialog 不单独导出，避免页面绕过确认直接调用删除。
 */
export function ConfirmDeleteButton({
  name,
  description,
  confirmLabel,
  cancelLabel,
  errorMessage,
  onConfirm,
  children,
  type = "button",
  disabled,
  ...triggerProps
}: ConfirmDeleteButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelText = cancelLabel ?? t("common.cancel");
  const confirmText = confirmLabel ?? t("common.confirmDelete");
  const failureText = errorMessage ?? t("common.deleteFailed");

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const close = () => {
    if (!pending) {
      setOpen(false);
      setError(null);
    }
  };

  const confirm = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(Object.freeze({}) as DeleteConfirmation);
      setOpen(false);
    } catch (cause) {
      console.error("[delete] 删除失败", cause);
      setError(failureText);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        {...triggerProps}
        type={type}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setOpen(true);
        }}
      >
        {children}
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <button
                type="button"
                aria-label={t("common.close")}
                tabIndex={-1}
                onClick={close}
                className="absolute inset-0 cursor-default bg-black/25"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("common.deleteTitle", { name })}
                data-confirm-delete
                className="relative z-10 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
              >
                <h2 className="m-0 text-sm font-semibold">
                  {t("common.deleteTitle", { name })}
                </h2>
                <p className="m-0 text-[11px] text-[var(--color-text-muted)]">
                  {description ?? t("common.deleteHint")}
                </p>
                {error ? (
                  <p
                    data-confirm-delete-error
                    className="m-0 text-[11px] text-[var(--color-missed)]"
                  >
                    {error}
                  </p>
                ) : null}
                <div className="mt-1 flex justify-end gap-1.5">
                  <button
                    type="button"
                    autoFocus
                    data-confirm-delete-cancel
                    disabled={pending}
                    onClick={close}
                    className="rounded-[var(--radius-control)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] disabled:opacity-40"
                  >
                    {cancelText}
                  </button>
                  <button
                    type="button"
                    data-confirm-delete-submit
                    disabled={pending}
                    onClick={() => void confirm()}
                    className="rounded-[var(--radius-control)] bg-[var(--color-missed)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  >
                    {pending ? t("common.deleting") : confirmText}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
