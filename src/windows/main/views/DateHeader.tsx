import { clsx } from "clsx";
import { memo } from "react";

export interface DateHeaderProps {
  date: string;
  /** 日号，已格式化。 */
  day: string;
  /** 星期缩写；概览模式不显示。 */
  weekday: string;
  width: number;
  height: number;
  isToday: boolean;
  overview: boolean;
}

/** 日期 / 星期表头：文案由父级按窗口预生成，组件本身不碰日期库。 */
export const DateHeader = memo(function DateHeader({
  date,
  day,
  weekday,
  width,
  height,
  isToday,
  overview,
}: DateHeaderProps) {
  return (
    <div
      data-date-header={date}
      data-today={isToday ? "" : undefined}
      className={clsx(
        "flex shrink-0 flex-col items-center justify-center border-b border-l tabular-nums",
        overview ? "gap-0.5 text-[9px]" : "gap-0.5",
        isToday
          ? "text-[var(--color-voluntary)]"
          : "text-[var(--color-text-secondary)]",
      )}
      style={{
        width,
        height,
        background: isToday
          ? "color-mix(in srgb, var(--color-voluntary) 6%, transparent)"
          : undefined,
        borderLeftColor:
          "color-mix(in srgb, var(--color-border) 55%, transparent)",
      }}
    >
      <b
        data-today-pill={isToday ? "" : undefined}
        className={clsx(
          "flex items-center justify-center leading-none",
          isToday
            ? "size-[22px] rounded-[6px] bg-[var(--color-green-solid)] text-sm font-semibold text-[var(--color-on-green)]"
            : "font-medium text-sm",
        )}
      >
        {day}
      </b>
      {overview ? null : (
        <small
          className={clsx(
            "text-xs font-normal leading-none",
            isToday
              ? "text-[var(--color-voluntary)]"
              : "text-[var(--color-text-tertiary)]",
          )}
        >
          {weekday}
        </small>
      )}
    </div>
  );
});
