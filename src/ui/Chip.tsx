import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

/**
 * 语义 chip：日期、截止、逾期、状态统一走这里。
 * 颜色只用 tokens.css 的语义色，不在各页面手写 color-mix。
 */
export type ChipVariant =
  | "date"
  | "warning"
  | "danger"
  | "success"
  | "info"
  | "neutral";

const VARIANT_CLASS: Record<ChipVariant, string> = {
  date: "bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text-muted)]",
  warning:
    "bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]",
  danger:
    "bg-[color-mix(in_srgb,var(--color-missed)_12%,transparent)] text-[var(--color-missed)]",
  success:
    "bg-[color-mix(in_srgb,var(--color-voluntary)_12%,transparent)] text-[var(--color-voluntary)]",
  info: "bg-[color-mix(in_srgb,var(--color-forced)_12%,transparent)] text-[var(--color-forced)]",
  neutral: "bg-[var(--state-hover)] text-[var(--color-text-muted)]",
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  /** 挂件内使用更小的一档。 */
  size?: "sm" | "md";
}

export function Chip({
  variant = "neutral",
  size = "md",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] font-semibold leading-none",
        size === "md"
          ? "h-[18px] px-[7px] text-[var(--text-2xs)]"
          : "h-4 px-[6px] text-[10px]",
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
