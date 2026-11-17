import type { ReactNode } from "react";

export type IconName =
  | "today"
  | "grid"
  | "todo"
  | "manage"
  | "stats"
  | "settings"
  | "filter"
  | "sun"
  | "sliders"
  | "window"
  | "database"
  | "refresh"
  | "check";

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
  filter: <path d="M3 5h14l-5.4 6.2v4.6L8.4 17v-5.8L3 5z" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 6h14M3 14h14" />
      <circle cx="7.5" cy="6" r="2" fill="var(--color-surface)" />
      <circle cx="13" cy="14" r="2" fill="var(--color-surface)" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.6" />
      <path d="M3 7.5h14M5.5 5.8h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="10" cy="5" rx="6" ry="2.4" />
      <path d="M4 5v10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V5M4 10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
    </>
  ),
  refresh: (
    <>
      <path d="M16 10a6 6 0 1 1-1.9-4.4" />
      <path d="M16.2 3.2v3.8h-3.8" />
    </>
  ),
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8.5" />,
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
