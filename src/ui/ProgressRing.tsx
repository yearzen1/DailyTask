import { useT } from "./useT";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ProgressRingProps {
  done: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  done,
  total,
  size = 96,
  strokeWidth = 8,
}: ProgressRingProps) {
  const t = useT();
  const ratio = total === 0 ? 0 : Math.min(done / total, 1);
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={t("progress.aria", { done, total })}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--color-na)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--color-voluntary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{
            transition: "stroke-dashoffset .32s cubic-bezier(.4, 0, .2, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center gap-[3px] font-semibold tabular-nums">
        <span style={{ fontSize: size >= 80 ? "var(--text-lg)" : "var(--text-sm)" }}>
          {done}
        </span>
        <small className="relative top-[3px] text-xs font-normal text-[var(--color-text-muted)]">
          / {total}
        </small>
      </div>
    </div>
  );
}
