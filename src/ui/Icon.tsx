import type { ReactNode } from "react";

export type IconName =
  | "today"
  | "grid"
  | "todo"
  | "manage"
  | "types"
  | "stats"
  | "settings";

const PATHS: Record<IconName, ReactNode> = {
  today: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7.5 3v3M12.5 3v3M7 12l1.6 1.6L12.5 10" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M3 8h14M3 12.5h14M8 3v14M12.5 3v14" />
    </>
  ),
  todo: (
    <>
      <path d="M8 5h9M8 10h9M8 15h6" />
      <circle cx="4.5" cy="5" r="1.2" />
      <circle cx="4.5" cy="10" r="1.2" />
      <circle cx="4.5" cy="15" r="1.2" />
    </>
  ),
  manage: (
    <>
      <path d="M4 5h12M4 10h12M4 15h12" />
      <circle cx="7" cy="5" r="1.6" fill="var(--color-surface)" />
      <circle cx="13" cy="10" r="1.6" fill="var(--color-surface)" />
      <circle cx="6" cy="15" r="1.6" fill="var(--color-surface)" />
    </>
  ),
  types: (
    <>
      <rect x="3" y="3" width="5" height="4" rx="1" />
      <rect x="12" y="9" width="5" height="4" rx="1" />
      <rect x="12" y="15" width="5" height="4" rx="1" />
      <path d="M5.5 7v5.5H12M5.5 12.5V17H12M5.5 12.5H14.5M5.5 17H14.5" />
    </>
  ),
  stats: (
    <>
      <path d="M3.5 16.5V11M8 16.5V6M12.5 16.5V8.5M17 16.5V4" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.8" />
      <path d="M10 2.8v1.8M10 15.4v1.8M2.8 10h1.8M15.4 10h1.8M4.9 4.9l1.3 1.3M13.8 13.8l1.3 1.3M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3" />
    </>
  ),
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
