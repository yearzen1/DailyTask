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
        "flex shrink-0 flex-col items-center justify-center gap-px border-b border-l tabular-nums",
        overview ? "text-[9px]" : "text-[var(--text-2xs)]",
        isToday
          ? "font-bold text-[var(--color-voluntary)]"
          : "text-[var(--color-text)]",
      )}
      style={{
        width,
        height,
        background: isToday
          ? "color-mix(in srgb, var(--color-voluntary) 9%, transparent)"
          : undefined,
        borderLeftColor:
          "color-mix(in srgb, var(--color-border) 55%, transparent)",
      }}
    >
      <b className="font-medium leading-none">{day}</b>
      {overview ? null : (
        <small className="text-[9px] font-normal leading-none text-[var(--color-text-muted)]">
          {weekday}
        </small>
      )}
    </div>
  );
});
