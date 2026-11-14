import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";

import { useStats, type TaskStat } from "../../../stores/selectors/stats";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

export default function Stats() {
  const t = useT();
  const { rows } = useStats();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const historyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.current) {
        counts.set(row.task.id, (counts.get(row.task.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  const toggleHistory = (taskId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const visibleRows = rows.filter(
    (row) => row.current || expanded.has(row.task.id),
  );

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("stats.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {t("stats.subtitle")}
        </span>
      </header>

      {rows.length === 0 ? (
        <section
          data-stats-empty
          className={`${CARD} flex min-h-0 flex-1 items-center justify-center`}
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("stats.empty")}
          </p>
        </section>
      ) : (
        <section className={`${CARD} min-h-0 flex-1 overflow-auto`}>
          <table data-stats-table className="w-full border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-[var(--color-surface)] text-left text-xs text-[var(--color-text-muted)]">
                <th className="h-9 border-b border-[var(--color-border)] px-4 font-medium">
                  {t("stats.col.task")}
                </th>
                <th className="h-9 w-[140px] border-b border-[var(--color-border)] px-4 font-medium">
                  {t("stats.col.streak")}
                </th>
                <th className="h-9 w-[280px] border-b border-[var(--color-border)] px-4 font-medium">
                  {t("stats.col.rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <StatsRow
                  key={row.key}
                  row={row}
                  historyCount={
                    row.current ? (historyCounts.get(row.task.id) ?? 0) : 0
                  }
                  expanded={expanded.has(row.task.id)}
                  onToggle={() => toggleHistory(row.task.id)}
                />
              ))}
            </tbody>
          </table>

          <p className="m-0 border-t border-[var(--color-border)] px-4 py-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t("stats.note")}
          </p>
        </section>
      )}
    </>
  );
}

function StatsRow({
  row,
  historyCount,
  expanded,
  onToggle,
}: {
  row: TaskStat;
  historyCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const percent = Math.round(row.rate * 100);
  const color =
    row.task.category === "voluntary"
      ? "var(--color-voluntary)"
      : "var(--color-forced)";
  const range = t("stats.range", {
    start: format(parseISO(row.namePeriod.start), "MM/dd"),
    end: row.namePeriod.end
      ? format(parseISO(row.namePeriod.end), "MM/dd")
      : t("manage.ongoing"),
  });

  return (
    <tr
      data-stats-row={row.key}
      data-current={row.current ? "" : undefined}
      data-streak={row.streak}
      data-rate={percent}
      className={`border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--state-hover)] ${
        row.current ? "" : "text-[var(--color-text-muted)]"
      }`}
    >
      <td className="h-[38px] px-4">
        <div className="flex items-center gap-2">
          <i
            aria-hidden="true"
            className="size-[5px] shrink-0 rounded-full"
            style={{ background: color, opacity: row.current ? 1 : 0.35 }}
          />
          <span className="min-w-0 truncate">{row.name}</span>
          {row.current ? null : (
            <span className="shrink-0 text-[var(--text-2xs)] tabular-nums">
              {range}
            </span>
          )}
          {row.current && historyCount > 0 ? (
            <button
              type="button"
              data-name-history-toggle={row.task.id}
              aria-expanded={expanded}
              onClick={onToggle}
              className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--color-border)] px-1.5 py-px text-[var(--text-2xs)] hover:bg-[var(--state-hover)]"
            >
              {t(
                expanded ? "stats.nameHistory.hide" : "stats.nameHistory",
                { count: historyCount },
              )}
            </button>
          ) : null}
          <span className="shrink-0 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t(
              row.task.category === "voluntary"
                ? "manage.category.voluntary"
                : "manage.category.forced",
            )}
          </span>
        </div>
      </td>
      <td className="px-4 tabular-nums">
        {row.streak > 0 ? (
          <span className="rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-voluntary)_12%,transparent)] px-[7px] py-px text-[var(--text-2xs)] font-semibold text-[var(--color-voluntary)]">
            {t("stats.streakDays", { count: row.streak })}
          </span>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="px-4">
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-[160px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-na)]">
            <div
              className="h-full rounded-[var(--radius-pill)]"
              style={{ width: `${percent}%`, background: color }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
            {t("stats.rate", { percent })}
          </span>
        </div>
      </td>
    </tr>
  );
}
