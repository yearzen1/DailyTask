import { clsx } from "clsx";
import { memo } from "react";

import type { CellState } from "../../../domain/settle";
import { CELL_SYMBOLS } from "../../../ui/CheckCell";

const TODAY_TINT =
  "color-mix(in srgb, var(--color-voluntary) 8%, transparent)";

/** 概览色块：按状态给底色，`pending` 交给今天的浅绿。 */
function overviewBackground(state: CellState): string | undefined {
  switch (state) {
    case "done":
      return "var(--color-voluntary)";
    case "missed":
      return "color-mix(in srgb, var(--color-missed) 55%, var(--color-surface))";
    case "skipped":
      return "color-mix(in srgb, var(--color-forced) 35%, var(--color-surface))";
    case "none":
      return "var(--color-na)";
    case "pending":
      return undefined;
  }
}

let renderCount = 0;

/** 测试专用：真实渲染次数。`memo` 命中时不会增长，生产构建里会被摇掉。 */
export function gridCellRenderCount(): number {
  return renderCount;
}

export interface GridCellProps {
  rowKey: string;
  taskId: string;
  taskName: string;
  date: string;
  dateLabel: string;
  /** `t("checkin.aria", { task, status: "" })`：行级预生成，格子里只拼状态。 */
  ariaPrefix: string;
  state: CellState;
  value: string | null;
  width: number;
  height: number;
  isToday: boolean;
  overview: boolean;
  focused: boolean;
  tabIndex: number;
  hasNote: boolean;
  disabled: boolean;
  noteAddLabel: string;
  noteHasLabel: string;
  noteTitle: string;
}

/**
 * 格子只吃值属性，不接收回调：聚焦 / 点击 / 双击 / 右键 / 备注全部由滚动容器
 * 事件委托处理，这样 `memo` 才能真正跳过重渲染。
 */
export const GridCell = memo(function GridCell({
  rowKey,
  taskId,
  taskName,
  date,
  dateLabel,
  ariaPrefix,
  state,
  value,
  width,
  height,
  isToday,
  overview,
  focused,
  tabIndex,
  hasNote,
  disabled,
  noteAddLabel,
  noteHasLabel,
  noteTitle,
}: GridCellProps) {
  if (import.meta.env.MODE === "test") {
    renderCount += 1;
  }

  const symbol = state === "none" ? "▫" : CELL_SYMBOLS[state];
  const text = !overview && value ? value : symbol;
  const canNote =
    !overview && (state === "done" || state === "missed" || state === "skipped");
  const ariaLabel = value ? `${ariaPrefix} · ${value}` : ariaPrefix;

  /** 今天列绿底只覆盖真要打卡的三态；「今天不做」和区间外保持自己的底色。 */
  const tinted = state === "pending" || state === "done" || state === "missed";
  const todayTint = isToday && tinted ? TODAY_TINT : undefined;
  const background = overview
    ? (overviewBackground(state) ?? todayTint)
    : (todayTint ?? (state === "none" ? "var(--color-na)" : undefined));

  return (
    <div
      className="group relative flex shrink-0"
      style={{ width, minHeight: height }}
      data-cell-row={rowKey}
      data-cell-task={taskId}
      data-cell-date={date}
    >
      <button
        type="button"
        data-grid-cell={taskId}
        data-task={taskId}
        data-row={rowKey}
        data-date={date}
        data-state={state}
        data-today={isToday ? "" : undefined}
        data-today-tint={todayTint ? "" : undefined}
        data-focused={focused ? "" : undefined}
        data-value={value ?? undefined}
        tabIndex={tabIndex}
        disabled={disabled}
        title={`${taskName} · ${dateLabel}${value ? ` · ${value}` : ""}`}
        aria-label={ariaLabel}
        className={clsx(
          "flex w-full min-w-0 items-center justify-center border-b border-l tabular-nums outline-none",
          overview ? "text-[0px]" : value ? "px-0.5 text-[10px]" : "text-xs",
          !overview &&
            state === "done" &&
            "font-semibold text-[var(--color-voluntary)]",
          !overview && state === "missed" && "text-[var(--color-missed)]",
          !overview &&
            state === "skipped" &&
            "text-[var(--color-text-muted)]",
          !overview && state === "pending" && "text-[var(--color-text)]",
          disabled
            ? "cursor-not-allowed"
            : overview
              ? "cursor-zoom-in hover:brightness-105"
              : "cursor-default hover:bg-[var(--state-hover)]",
        )}
        style={{
          minHeight: height,
          background,
          color:
            !overview && state === "none"
              ? "color-mix(in srgb, var(--color-text) 28%, transparent)"
              : undefined,
          boxShadow: focused
            ? "inset 0 0 0 2px var(--color-voluntary)"
            : isToday
              ? "inset -1px 0 0 color-mix(in srgb, var(--color-voluntary) 45%, transparent)"
              : undefined,
          borderLeftColor:
            "color-mix(in srgb, var(--color-border) 50%, transparent)",
          borderBottomColor:
            "color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        <span
          aria-hidden="true"
          className="max-w-full break-words text-center leading-tight"
        >
          {overview ? "" : text}
        </span>
      </button>

      {canNote ? (
        <button
          type="button"
          data-note-button={`${taskId}|${date}`}
          tabIndex={focused ? 0 : -1}
          aria-label={hasNote ? noteHasLabel : noteAddLabel}
          title={noteTitle}
          className={clsx(
            "absolute right-0 top-0 grid size-3 place-items-center rounded-bl-[4px] text-[8px] leading-none",
            hasNote
              ? "bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]"
              : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--state-active)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <span aria-hidden="true">{hasNote ? "•" : "✎"}</span>
        </button>
      ) : null}
    </div>
  );
});
