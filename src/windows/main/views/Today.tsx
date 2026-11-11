import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

import { nextCellState } from "../../../domain/settle";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import {
  useTodayData,
  type CategoryStat,
  type DueTodoItem,
  type TodayTask,
} from "../../../stores/selectors/today";
import { useTodosStore } from "../../../stores/todosStore";
import { CheckCell } from "../../../ui/CheckCell";
import { Chip } from "../../../ui/Chip";
import { ProgressRing } from "../../../ui/ProgressRing";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

export default function Today() {
  const t = useT();
  const data = useTodayData();
  const setStatus = useCheckinsStore((state) => state.setStatus);
  const setValue = useCheckinsStore((state) => state.setValue);
  const setTodoDone = useTodosStore((state) => state.setDone);
  const [collapsed, setCollapsed] = useState({
    voluntary: false,
    forced: false,
    dueTodos: false,
  });

  const toggleSection = (key: keyof typeof collapsed) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleTodo = (item: DueTodoItem) => {
    void setTodoDone(item.todo.id, !item.todo.done);
  };

  const toggle = (row: TodayTask) => {
    void setStatus(row.task.id, data.today, nextCellState(row.state));
  };

  const saveValue = (row: TodayTask, value: string) => {
    void setValue(row.task.id, data.today, value.trim() === "" ? null : value);
  };

  const toggleSkip = (row: TodayTask) => {
    void setStatus(
      row.task.id,
      data.today,
      row.state === "skipped" ? null : "skipped",
    );
  };

  const total = data.progress.applicable - data.progress.skipped;
  const statusText =
    total === 0
      ? t("today.noTasks")
      : data.progress.pending > 0
        ? t("today.remaining", { count: data.progress.pending })
        : t("today.allDone");

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("today.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {data.dateLabel}
        </span>
      </header>

      <div
        data-today-scroll
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
      >
        <section className={`${CARD} flex items-center gap-6 px-6 py-4`}>
        <ProgressRing done={data.progress.done} total={total} />
        <div className="flex flex-col gap-0.5">
          <div>{t("today.doneOfTotal", { done: data.progress.done, total })}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {t("today.rate", {
              percent: Math.round(data.progress.ratio * 100),
              status: statusText,
            })}
          </div>
        </div>
        <div className="ml-auto flex gap-6">
          <SplitStat
            label={t("today.category.voluntary")}
            color="var(--color-voluntary)"
            stat={data.voluntaryStat}
          />
          <SplitStat
            label={t("today.category.forced")}
            color="var(--color-forced)"
            stat={data.forcedStat}
          />
          {data.todoStat.total > 0 ? (
            <SplitStat
              label={t("today.category.todos")}
              color="var(--color-warning)"
              stat={data.todoStat}
            />
          ) : null}
        </div>
      </section>

      <section className={`${CARD} p-2`}>
        {data.voluntary.length === 0 && data.forced.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
            {t("today.empty")}
          </p>
        ) : (
          <>
            <TaskGroup
              title={t("today.group.voluntary")}
              color="var(--color-voluntary)"
              rows={data.voluntary}
              stat={data.voluntaryStat}
              open={!collapsed.voluntary}
              onToggle={() => toggleSection("voluntary")}
              onToggleRow={toggle}
              onSkip={toggleSkip}
              onValue={saveValue}
            />
            <TaskGroup
              title={t("today.group.forced")}
              color="var(--color-forced)"
              rows={data.forced}
              stat={data.forcedStat}
              open={!collapsed.forced}
              onToggle={() => toggleSection("forced")}
              onToggleRow={toggle}
              onSkip={toggleSkip}
              onValue={saveValue}
            />
          </>
        )}
      </section>

      {data.dueTodos.length > 0 ? (
        <section className={`${CARD} p-2`}>
          <button
            type="button"
            aria-expanded={!collapsed.dueTodos}
            aria-label={t(
              collapsed.dueTodos
                ? "common.expandSection"
                : "common.collapseSection",
              { section: t("today.dueTodos") },
            )}
            onClick={() => toggleSection("dueTodos")}
            className="flex h-[34px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <i
              aria-hidden="true"
              data-todo-bar
              className="h-3 w-[3px] rounded-[2px]"
              style={{ background: "var(--color-warning)" }}
            />
            <span className="truncate">{t("today.dueTodos")}</span>
            <span aria-hidden="true" className="shrink-0 text-xs leading-none">
              {collapsed.dueTodos ? "▸" : "▾"}
            </span>
            <span className="ml-auto font-normal tabular-nums">
              {data.todoStat.done} / {data.todoStat.total}
            </span>
          </button>
          {collapsed.dueTodos ? null : (
            <>
              {data.overdueTodos.map((item) => (
                <DueTodoRow
                  key={item.todo.id}
                  item={item}
                  onToggle={() => toggleTodo(item)}
                />
              ))}
              {data.todayTodos.map((item) => (
                <DueTodoRow
                  key={item.todo.id}
                  item={item}
                  onToggle={() => toggleTodo(item)}
                />
              ))}
            </>
          )}
        </section>
      ) : null}
      </div>
    </>
  );
}

/** 单区块内按「逾期 → 今天」排列，红条/红 chip 与黄 chip 做视觉分组。 */
function DueTodoRow({
  item,
  onToggle,
}: {
  item: DueTodoItem;
  onToggle: () => void;
}) {
  const t = useT();
  const { todo, overdueDays } = item;
  const overdue = overdueDays > 0;
  const done = todo.done;

  return (
    <button
      type="button"
      data-group={overdue ? "overdue" : "today"}
      data-overdue={overdue ? "" : undefined}
      data-done={done ? "" : undefined}
      aria-pressed={done}
      aria-label={t(done ? "todos.markUndone" : "todos.markDone", {
        title: todo.title,
      })}
      onClick={onToggle}
      className={`relative flex min-h-[34px] w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-1 text-left hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        overdue
          ? "pl-5 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-[2px] before:bg-[var(--color-missed)]"
          : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] text-[10px] leading-none ${
          done
            ? "border-[var(--color-voluntary)] bg-[var(--color-voluntary)] text-white"
            : "border-[var(--color-border-strong)] text-transparent"
        }`}
      >
        ✓
      </span>
      <span
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
          done ? "text-[var(--color-text-muted)] line-through" : ""
        }`}
      >
        {todo.title}
      </span>
      <Chip
        variant={overdue ? "danger" : "warning"}
        className="ml-auto"
      >
        <span>{format(parseISO(todo.dueDate as string), "MM/dd")}</span>
        <span aria-hidden="true" className="opacity-50">
          ·
        </span>
        <span>
          {overdue
            ? t("today.overdueDays", { days: overdueDays })
            : t("today.dueToday")}
        </span>
      </Chip>
    </button>
  );
}

function SplitStat({
  label,
  color,
  stat,
}: {
  label: string;
  color: string;
  stat: CategoryStat;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <i className="size-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="tabular-nums">
        {stat.done} / {stat.total}
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  color,
  rows,
  stat,
  open,
  onToggle,
  onToggleRow,
  onSkip,
  onValue,
}: {
  title: string;
  color: string;
  rows: TodayTask[];
  stat: CategoryStat;
  open: boolean;
  onToggle: () => void;
  onToggleRow: (row: TodayTask) => void;
  onSkip: (row: TodayTask) => void;
  onValue: (row: TodayTask, value: string) => void;
}) {
  const t = useT();
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
    }
  }, [open]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t(
          open ? "common.collapseSection" : "common.expandSection",
          { section: title },
        )}
        onClick={onToggle}
        className="flex h-[34px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <i
          aria-hidden="true"
          className="h-3 w-[3px] rounded-[2px]"
          style={{ background: color }}
        />
        <span className="truncate">{title}</span>
        <span aria-hidden="true" className="shrink-0 text-xs leading-none">
          {open ? "▾" : "▸"}
        </span>
        <span className="ml-auto font-normal tabular-nums">
          {stat.done} / {stat.total}
        </span>
      </button>

      {open
        ? rows.map((row) => (
            <div
              key={row.task.id}
              role="button"
              tabIndex={0}
              data-status={row.state}
              onClick={() => onToggleRow(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleRow(row);
                }
              }}
              className="group flex h-[34px] cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 hover:bg-[var(--state-hover)] active:bg-[var(--state-active)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <CheckCell
                state={row.state}
                taskName={row.task.name}
                onClick={() => onToggleRow(row)}
              />
              <span
                className={
                  row.state === "skipped"
                    ? "min-w-0 flex-1 truncate text-[var(--color-text-muted)] line-through"
                    : row.state === "done"
                      ? "min-w-0 flex-1 truncate text-[var(--color-text-muted)]"
                      : "min-w-0 flex-1 truncate"
                }
              >
                {row.task.name}
              </span>
              {row.deadline !== null && row.deadlineDays !== null ? (
                <Chip
                  variant="warning"
                  data-deadline={row.deadline}
                  data-deadline-days={row.deadlineDays}
                >
                  <span>{format(parseISO(row.deadline), "MM/dd")}</span>
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <span>
                    {row.deadlineDays === 0
                      ? t("deadline.today")
                      : t("deadline.inDays", { days: row.deadlineDays })}
                  </span>
                </Chip>
              ) : null}
              {editingId === row.task.id ? (
                <ValueInput
                  initial={row.value ?? ""}
                  onCommit={(next) => {
                    setEditingId(null);
                    onValue(row, next);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button
                  type="button"
                  data-value={row.value ?? undefined}
                  aria-label={t("today.editValue")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingId(row.task.id);
                  }}
                  className={`shrink-0 rounded-[var(--radius-pill)] px-1.5 py-[2px] text-xs tabular-nums text-[var(--color-text-muted)] hover:bg-[var(--state-active)] ${
                    row.value
                      ? "bg-[var(--state-hover)]"
                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  }`}
                >
                  {row.value ?? t("today.addValue")}
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSkip(row);
                }}
                className={`ml-auto rounded-[var(--radius-control)] px-1.5 py-[3px] text-xs text-[var(--color-text-muted)] hover:bg-[var(--state-active)] ${
                  row.state === "skipped"
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                }`}
              >
                {row.state === "skipped" ? t("today.unskip") : t("today.skip")}
              </button>
            </div>
          ))
        : null}
    </div>
  );
}

/** 行内编辑自由值：Enter 提交、Esc 取消、失焦提交。 */
function ValueInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const cancelled = useRef(false);

  return (
    <input
      autoFocus
      value={value}
      aria-label={initial}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          onCommit(value);
        }
        if (event.key === "Escape") {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) {
          onCommit(value);
        }
      }}
      className="w-20 shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1.5 py-[2px] text-xs focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    />
  );
}
