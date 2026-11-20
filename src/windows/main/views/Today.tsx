import { format, parseISO } from "date-fns";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { nextCellState } from "../../../domain/settle";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import {
  useTodayData,
  type CategoryStat,
  type DueTodoItem,
  type TodayTask,
  type TodayTypeGroup,
} from "../../../stores/selectors/today";
import { useTodosStore } from "../../../stores/todosStore";
import { CheckCell } from "../../../ui/CheckCell";
import { Chip } from "../../../ui/Chip";
import { CopyToast } from "../../../ui/CopyToast";
import { MenuHeading, MenuItem, MenuSurface } from "../../../ui/MenuSurface";
import { ProgressRing } from "../../../ui/ProgressRing";
import { typeColorVar, typeDisplayName } from "../../../ui/taskType";
import { useCopyFeedback } from "../../../ui/useCopyFeedback";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";
const MENU_WIDTH = 208;
const MENU_HEIGHT = 96;

type TodayMenu = {
  kind: "task" | "todo";
  name: string;
  x: number;
  y: number;
};

export default function Today() {
  const t = useT();
  const data = useTodayData();
  const setStatus = useCheckinsStore((state) => state.setStatus);
  const setValue = useCheckinsStore((state) => state.setValue);
  const setTodoDone = useTodosStore((state) => state.setDone);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<TodayMenu | null>(null);
  const { message: copyMessage, error: copyError, copy } = useCopyFeedback();
  const dueTodosCollapsed = collapsed.has("__todos");

  const openMenu = (
    kind: TodayMenu["kind"],
    name: string,
    event: ReactMouseEvent,
  ) => {
    event.preventDefault();
    setMenu({
      kind,
      name,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - MENU_WIDTH - 8)),
      y: Math.min(
        event.clientY,
        Math.max(8, window.innerHeight - MENU_HEIGHT - 8),
      ),
    });
  };

  const copyMenuName = () => {
    if (!menu) {
      return;
    }
    const name = menu.name;
    setMenu(null);
    void copy(name);
  };

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };
    const onScroll = () => setMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  const toggleSection = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
        <h1 className="m-0 text-lg font-semibold tracking-[.2px]">
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
        <div className="ml-auto flex flex-wrap items-center gap-6">
          {data.typeStats.map((item) => (
            <SplitStat
              key={item.type.id}
              label={typeDisplayName(item.type, t)}
              color={typeColorVar(item.type)}
              stat={item.stat}
            />
          ))}
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
        {data.groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
            {t("today.empty")}
          </p>
        ) : (
          data.groups.map((group) => (
            <TaskGroup
              key={group.type.id}
              group={group}
              title={typeDisplayName(group.type, t)}
              color={typeColorVar(group.type)}
              open={!collapsed.has(group.type.id)}
              hidden={group.path
                .slice(0, -1)
                .some((ancestor) => collapsed.has(ancestor.id))}
              onToggle={() => toggleSection(group.type.id)}
              onToggleRow={toggle}
              onSkip={toggleSkip}
              onValue={saveValue}
              onMenu={(row, event) => openMenu("task", row.task.name, event)}
            />
          ))
        )}
      </section>

      {data.dueTodos.length > 0 ? (
        <section className={`${CARD} p-2`}>
          <button
            type="button"
            aria-expanded={!dueTodosCollapsed}
            aria-label={t(
              dueTodosCollapsed
                ? "common.expandSection"
                : "common.collapseSection",
              { section: t("today.dueTodos") },
            )}
            onClick={() => toggleSection("__todos")}
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
              {dueTodosCollapsed ? "▸" : "▾"}
            </span>
            <span className="ml-auto font-normal tabular-nums">
              {data.todoStat.done} / {data.todoStat.total}
            </span>
          </button>
          {dueTodosCollapsed ? null : (
            <>
              {data.overdueTodos.map((item) => (
                <DueTodoRow
                  key={item.todo.id}
                  item={item}
                  onToggle={() => toggleTodo(item)}
                  onMenu={(event) => openMenu("todo", item.todo.title, event)}
                />
              ))}
              {data.todayTodos.map((item) => (
                <DueTodoRow
                  key={item.todo.id}
                  item={item}
                  onToggle={() => toggleTodo(item)}
                  onMenu={(event) => openMenu("todo", item.todo.title, event)}
                />
              ))}
            </>
          )}
        </section>
      ) : null}
      </div>

      {menu ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("common.close")}
            onClick={() => setMenu(null)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <MenuSurface
            data-today-menu={menu.kind}
            label={t(menu.kind === "task" ? "today.menu.task" : "todos.menu")}
            style={{ left: menu.x, top: menu.y }}
            className="fixed w-[208px]"
          >
            <MenuHeading wrap onClose={() => setMenu(null)}>
              {menu.name}
            </MenuHeading>
            <MenuItem onClick={copyMenuName}>{t("common.copyName")}</MenuItem>
          </MenuSurface>
        </>
      ) : null}
      <CopyToast message={copyMessage} error={copyError} />
    </>
  );
}

/** 单区块内按「逾期 → 今天」排列，红条/红 chip 与黄 chip 做视觉分组。 */
function DueTodoRow({
  item,
  onToggle,
  onMenu,
}: {
  item: DueTodoItem;
  onToggle: () => void;
  onMenu: (event: ReactMouseEvent) => void;
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
      onContextMenu={onMenu}
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
  group,
  title,
  color,
  open,
  hidden,
  onToggle,
  onToggleRow,
  onSkip,
  onValue,
  onMenu,
}: {
  group: TodayTypeGroup;
  title: string;
  color: string;
  open: boolean;
  hidden: boolean;
  onToggle: () => void;
  onToggleRow: (row: TodayTask) => void;
  onSkip: (row: TodayTask) => void;
  onValue: (row: TodayTask, value: string) => void;
  onMenu: (row: TodayTask, event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { rows, stat, depth } = group;

  useEffect(() => {
    if (!open) {
      setEditingId(null);
    }
  }, [open]);

  if (hidden) {
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
        style={{ paddingLeft: 8 + depth * 16 }}
        className="flex h-[34px] w-full items-center gap-2 rounded-[var(--radius-control)] pr-2 text-left text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
              onContextMenu={(event) => onMenu(row, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleRow(row);
                }
              }}
              style={{ paddingLeft: 20 + depth * 16 }}
              className="group flex min-h-[34px] cursor-pointer items-center gap-3 rounded-[var(--radius-control)] py-1 pr-2 hover:bg-[var(--state-hover)] active:bg-[var(--state-active)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <CheckCell
                state={row.state}
                taskName={row.task.name}
                onClick={() => onToggleRow(row)}
              />
              <span
                className={
                  row.state === "skipped"
                    ? "min-w-0 flex-1 wrap-anywhere text-[var(--color-text-muted)] line-through"
                    : row.state === "done"
                      ? "min-w-0 flex-1 wrap-anywhere text-[var(--color-text-muted)]"
                      : "min-w-0 flex-1 wrap-anywhere"
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
