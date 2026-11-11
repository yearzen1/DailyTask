import { clsx } from "clsx";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

/**
 * 应用内浮层菜单的统一外壳：待办右键、挂件任务菜单共用。
 * 胶囊右键走系统原生菜单，不在这里。
 */
export interface MenuSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

export function MenuSurface({
  label,
  className,
  children,
  ...rest
}: MenuSurfaceProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={clsx(
        "z-50 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-popover)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MenuHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={clsx(
        "m-0 truncate px-1 pb-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export interface MenuItemProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
}

export function MenuItem({
  danger,
  className,
  type = "button",
  ...rest
}: MenuItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className={clsx(
        "flex h-7 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-xs hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        danger ? "text-[var(--color-missed)]" : "text-[var(--color-text)]",
        className,
      )}
      {...rest}
    />
  );
}

export function MenuSeparator() {
  return (
    <div
      aria-hidden="true"
      data-menu-separator
      className="my-1 h-px bg-[var(--color-border)]"
    />
  );
}
