import { format, parseISO } from "date-fns";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { MessageKey } from "../../../shared/i18n";
import {
  useTodoGroups,
  type TodoGroup,
  type TodoGroupKey,
  type TodoItem,
} from "../../../stores/selectors/todos";
import { useTodosStore } from "../../../stores/todosStore";
import { ConfirmDeleteButton } from "../../../ui/ConfirmDeleteButton";
import { DateField } from "../../../ui/DateField";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

const GROUP_META: Record<TodoGroupKey, { labelKey: MessageKey; color: string }> =
  {
    overdue: { labelKey: "todos.group.overdue", color: "var(--color-missed)" },
    today: { labelKey: "todos.group.today", color: "var(--color-warning)" },
    thisWeek: {
      labelKey: "todos.group.week",
      color: "var(--color-border-strong)",
    },
    later: { labelKey: "todos.group.later", color: "var(--color-border-strong)" },
    done: { labelKey: "todos.group.done", color: "var(--color-voluntary)" },
  };

export default function Todos() {
  const t = useT();
  const data = useTodoGroups();
  const update = useTodosStore((state) => state.update);
  const remove = useTodosStore((state) => state.remove);
  const [doneOpen, setDoneOpen] = useState(false);
  const [menu, setMenu] = useState<{
    todo: TodoItem["todo"];
    x: number;
    y: number;
  } | null>(null);
  const [dueDraft, setDueDraft] = useState("");

  const done = data.groups.find((group) => group.key === "done");
  const open = data.groups.filter((group) => group.key !== "done");
  const hasTodos = data.groups.some((group) => group.items.length > 0);

  const openMenu = (item: TodoItem, event: ReactMouseEvent) => {
    event.preventDefault();
    setDueDraft(item.todo.dueDate ?? "");
    setMenu({
      todo: item.todo,
      x: Math.min(event.clientX, Math.max(0, window.innerWidth - 232)),
      y: Math.min(event.clientY, Math.max(0, window.innerHeight - 190)),
    });
  };

  const saveDueDate = (dueDate: string | null) => {
    if (!menu) {
      return;
    }
    void update(menu.todo.id, { dueDate });
    setMenu(null);
  };

  // 右键菜单只开一个：Esc / 点遮罩 / 滚动都关掉。
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

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("todos.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {t("todos.pending", { count: data.pendingCount })}
        </span>
      </header>

      <TodoForm />

      {!hasTodos ? (
        <section
          data-todos-empty
          aria-live="polite"
          className={`${CARD} flex min-h-0 flex-1 items-center justify-center`}
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("todos.empty")}
          </p>
        </section>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {open
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <TodoSection
                key={group.key}
                group={group}
                today={data.today}
                onContextMenu={openMenu}
              />
            ))}

          {done && done.items.length > 0 ? (
            <section data-todo-group="done">
              <button
                type="button"
                data-done-toggle
                aria-expanded={doneOpen}
                onClick={() => setDoneOpen((current) => !current)}
                className="flex h-[34px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
              >
                <span className="w-2 text-[9px]">{doneOpen ? "▾" : "▸"}</span>
                <i
                  className="h-3 w-[3px] rounded-[2px]"
                  style={{ background: GROUP_META.done.color }}
                />
                {t(GROUP_META.done.labelKey)}
                <span className="ml-auto font-normal tabular-nums">
                  {done.items.length}
                </span>
              </button>
              {doneOpen ? (
                <div className={`${CARD} p-2`}>
                  {done.items.map((item) => (
                    <TodoRow
                      key={item.todo.id}
                      item={item}
                      today={data.today}
                      onContextMenu={openMenu}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {menu ? (
        <>
          <button
            type="button"
            aria-label={t("todos.menu.close")}
            tabIndex={-1}
            onClick={() => setMenu(null)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            data-todo-menu
            aria-label={t("todos.menu")}
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-50 w-[216px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-popover)]"
          >
            <p className="mb-1 truncate px-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
              {menu.todo.title}
            </p>
            <label className="flex items-center gap-1.5 px-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
              {t("todos.menu.date")}
              <DateField
                data-menu-date
                autoFocus
                value={dueDraft || null}
                onChange={(next) => setDueDraft(next ?? "")}
                aria-label={t("todos.menu.date")}
                align="right"
                className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)]"
              />
            </label>
            <div className="mt-1.5 flex justify-end gap-1">
              <button
                type="button"
                data-menu-clear
                onClick={() => saveDueDate(null)}
                className="rounded-[var(--radius-control)] px-2 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
              >
                {t("todos.menu.clear")}
              </button>
              <button
                type="button"
                data-menu-save
                onClick={() => saveDueDate(dueDraft || null)}
                className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2 py-1 text-[var(--text-2xs)] font-semibold text-white"
              >
                {t("todos.menu.save")}
              </button>
            </div>
            <ConfirmDeleteButton
              role="menuitem"
              data-menu-delete
              name={menu.todo.title}
              aria-label={t("todos.deleteAria", { title: menu.todo.title })}
              onConfirm={async (confirmation) => {
                await remove(menu.todo.id, confirmation);
                setMenu(null);
              }}
              className="mt-1 w-full rounded-[var(--radius-control)] px-2 py-1 text-left text-[var(--text-2xs)] text-[var(--color-missed)] hover:bg-[var(--state-hover)]"
            >
              {t("todos.menu.delete")}
            </ConfirmDeleteButton>
          </div>
        </>
      ) : null}
    </>
  );
}

/** 新增：标题必填，截止日期可空（空 = 「以后」）。 */
function TodoForm() {
  const t = useT();
  const create = useTodosStore((state) => state.create);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const canSubmit = title.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    void create({ title: title.trim(), dueDate: dueDate || null });
    setTitle("");
    setDueDate("");
  };

  return (
    <form
      data-todo-form
      onSubmit={submit}
      className={`${CARD} flex flex-none items-center gap-2 px-3 py-2`}
    >
      <textarea
        data-todo-input
        rows={1}
        value={title}
        aria-label={t("todos.addPlaceholder")}
        placeholder={t("todos.addPlaceholder")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className="field-sizing-content min-h-[20px] max-h-24 min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none"
      />
      <DateField
        data-todo-due
        value={dueDate || null}
        onChange={(next) => setDueDate(next ?? "")}
        aria-label={t("todos.dueLabel")}
        allowClear
        className="w-[132px] rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)]"
      />
      <button
        type="submit"
        data-todo-add
        disabled={!canSubmit}
        className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
      >
        {t("todos.add")}
      </button>
    </form>
  );
}

function TodoSection({
  group,
  today,
  onContextMenu,
}: {
  group: TodoGroup;
  today: string;
  onContextMenu: (item: TodoItem, event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const meta = GROUP_META[group.key];

  return (
    <section
      data-todo-group={group.key}
      className={`${CARD} p-2`}
      aria-label={t(meta.labelKey)}
    >
      <div className="flex h-[34px] items-center gap-2 px-2 text-xs font-semibold text-[var(--color-text-muted)]">
        <i className="h-3 w-[3px] rounded-[2px]" style={{ background: meta.color }} />
        {t(meta.labelKey)}
        <span className="ml-auto font-normal tabular-nums">
          {group.items.length}
        </span>
      </div>
      {group.items.map((item) => (
        <TodoRow
          key={item.todo.id}
          item={item}
          today={today}
          onContextMenu={onContextMenu}
        />
      ))}
    </section>
  );
}

function TodoRow({
  item,
  today,
  onContextMenu,
}: {
  item: TodoItem;
  today: string;
  onContextMenu: (item: TodoItem, event: ReactMouseEvent) => void;
}) {
  const t = useT();
  const setDone = useTodosStore((state) => state.setDone);
  const update = useTodosStore((state) => state.update);
  const remove = useTodosStore((state) => state.remove);
  const { todo, overdueDays } = item;
  const overdue = overdueDays > 0;
  const dueToday = todo.dueDate === today;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const finished = useRef(false);

  const startEditing = () => {
    finished.current = false;
    setDraft(todo.title);
    setEditing(true);
  };

  const commit = () => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    setEditing(false);
    const next = draft.trim();
    if (!next || next === todo.title) {
      setDraft(todo.title);
      return;
    }
    void update(todo.id, { title: next });
  };

  return (
    <div
      data-todo={todo.id}
      data-overdue={overdue ? "" : undefined}
      data-done={todo.done ? "" : undefined}
      onContextMenu={(event) => onContextMenu(item, event)}
      className={`group relative flex min-h-[34px] items-center gap-3 rounded-[var(--radius-control)] px-2 py-1 hover:bg-[var(--state-hover)] ${
        overdue
          ? "pl-5 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-[2px] before:bg-[var(--color-missed)]"
          : ""
      }`}
    >
      <button
        type="button"
        data-toggle-done
        aria-label={t(todo.done ? "todos.markUndone" : "todos.markDone", {
          title: todo.title,
        })}
        aria-pressed={todo.done}
        onClick={() => void setDone(todo.id, !todo.done)}
        className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] text-[10px] leading-none ${
          todo.done
            ? "border-[var(--color-voluntary)] bg-[var(--color-voluntary)] text-white"
            : "border-[var(--color-border-strong)] text-transparent hover:border-[var(--color-voluntary)]"
        }`}
      >
        <span aria-hidden="true">✓</span>
      </button>

      {editing ? (
        <textarea
          autoFocus
          rows={1}
          data-todo-title-input
          value={draft}
          aria-label={t("todos.rename")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              finished.current = true;
              setDraft(todo.title);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="field-sizing-content min-h-[24px] max-h-32 min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1.5 py-[2px] text-sm leading-5 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
            todo.done ? "text-[var(--color-text-muted)] line-through" : ""
          }`}
        >
          {todo.title}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {todo.dueDate ? (
          <span data-due={todo.dueDate}>
            {format(parseISO(todo.dueDate), "MM/dd")}
          </span>
        ) : (
          <span>{t("todos.noDue")}</span>
        )}
        {overdue ? (
          <span className="rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-missed)_12%,transparent)] px-[7px] py-px text-[var(--text-2xs)] font-semibold text-[var(--color-missed)]">
            {t("todos.overdueDays", { days: overdueDays })}
          </span>
        ) : dueToday ? (
          <span className="rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-[7px] py-px text-[var(--text-2xs)] font-semibold text-[var(--color-warning)]">
            {t("todos.dueToday")}
          </span>
        ) : item.daysLeft !== null ? (
          <span
            data-days-left={item.daysLeft}
            className="rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-[7px] py-px text-[var(--text-2xs)] font-semibold text-[var(--color-warning)]"
          >
            {t("deadline.inDays", { days: item.daysLeft })}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        data-todo-rename
        aria-label={t("todos.rename")}
        onClick={startEditing}
        className="shrink-0 rounded-[var(--radius-control)] px-1 text-xs text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--state-active)] focus:opacity-100 group-hover:opacity-100"
      >
        <span aria-hidden="true">✎</span>
      </button>
      <DateField
        variant="icon"
        data-todo-date
        value={todo.dueDate}
        onChange={(next) => void update(todo.id, { dueDate: next })}
        aria-label={t("todos.editDue", { title: todo.title })}
        allowClear
        className="shrink-0 opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      />
      <ConfirmDeleteButton
        data-todo-delete
        name={todo.title}
        aria-label={t("todos.deleteAria", { title: todo.title })}
        onConfirm={(confirmation) => remove(todo.id, confirmation)}
        className="shrink-0 rounded-[var(--radius-control)] px-1 text-xs text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--state-active)] hover:text-[var(--color-missed)] focus:opacity-100 group-hover:opacity-100"
      >
        <span aria-hidden="true">✕</span>
      </ConfirmDeleteButton>
    </div>
  );
}
