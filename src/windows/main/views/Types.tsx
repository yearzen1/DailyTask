import { clsx } from "clsx";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";

import {
  descendantTypeIds,
  flattenTypeTree,
  isTypeDescendant,
  resolveTaskTypeId,
  resolveTaskTypes,
  sortedTasksByType,
} from "../../../domain/taskTypes";
import type { MessageKey } from "../../../shared/i18n";
import type { Task, TaskType, TaskTypeColor } from "../../../domain/types";
import {
  planTypeMove,
  typeDropZone,
  type TypeDropPosition,
} from "../../../domain/typeDrop";
import { useTaskTypesStore } from "../../../stores/taskTypesStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { ConfirmDeleteButton } from "../../../ui/ConfirmDeleteButton";
import {
  nextTypeColor,
  TYPE_COLORS,
  typeColorVar,
  typeColorVarForKey,
  typeDisplayName,
} from "../../../ui/taskType";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

const ERROR_KEYS: Record<string, MessageKey> = {
  "empty-name": "types.error.emptyName",
  "duplicate-name": "types.error.duplicateName",
  cycle: "types.error.cycle",
  "has-tasks": "types.error.hasTasks",
  "has-children": "types.error.hasChildren",
  "system-type": "types.error.systemType",
  "not-found": "types.error.notFound",
};

type Dialog =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; type: TaskType }
  | null;

export default function Types() {
  const t = useT();
  const types = useTaskTypesStore((state) => state.types);
  const tasks = useTasksStore((state) => state.tasks);
  const moveType = useTaskTypesStore((state) => state.move);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [assignTarget, setAssignTarget] = useState<TaskType | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    () => new Set(),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: TypeDropPosition;
  } | null>(null);

  const tree = useMemo(() => resolveTaskTypes(types), [types]);
  const flat = useMemo(() => flattenTypeTree(tree), [tree]);
  const tasksByType = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const typeId = resolveTaskTypeId(task);
      const list = map.get(typeId);
      if (list) {
        list.push(task);
      } else {
        map.set(typeId, [task]);
      }
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
    }
    return map;
  }, [tasks]);

  const subtreeCount = (typeId: string): number => {
    const subtree = descendantTypeIds(tree, typeId);
    let count = 0;
    for (const id of subtree) {
      count += tasksByType.get(id)?.length ?? 0;
    }
    return count;
  };

  const hasChildren = (typeId: string) =>
    tree.some((type) => type.parentId === typeId);

  const visibleRows = flat.filter(
    (node) =>
      !node.path
        .slice(0, -1)
        .some((ancestor) => collapsed.has(ancestor.id)),
  );

  const toggleCollapse = (typeId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  const toggleTasks = (typeId: string) => {
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  const dropOn = (
    sourceId: string,
    target: TaskType,
    position: TypeDropPosition,
  ) => {
    const plan = planTypeMove(tree, sourceId, target.id, position);
    if (!plan) {
      return;
    }
    void moveType(sourceId, plan.parentId, plan.index);
    if (position === "inside") {
      setCollapsed((current) => {
        if (!current.has(target.id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    }
  };

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("types.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {t("types.count", { count: flat.length })}
        </span>
        <button
          type="button"
          data-types-new
          onClick={() => setDialog({ mode: "create", parentId: null })}
          className="ml-auto rounded-[var(--radius-pill)] bg-[var(--color-voluntary)] px-3 py-1 text-[var(--text-2xs)] font-semibold text-white"
        >
          ＋ {t("types.new")}
        </button>
      </header>

      <section className={`${CARD} min-h-0 flex-1 overflow-auto p-2`}>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {visibleRows.map((node) => {
            const type = node.type;
            const directTasks = tasksByType.get(type.id) ?? [];
            const count = subtreeCount(type.id);
            const children = hasChildren(type.id);
            const open = !collapsed.has(type.id);
            const showTasks = expandedTasks.has(type.id);
            const name = typeDisplayName(type, t);
            const drop = dropTarget?.id === type.id ? dropTarget.position : null;

            return (
              <li key={type.id} data-type-row={type.id}>
                <div
                  draggable={type.systemKey === null}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", type.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(type.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event: DragEvent) => {
                    if (draggingId === null || draggingId === type.id) {
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    const raw = typeDropZone(
                      event.clientY,
                      rect.top,
                      rect.height,
                      type.systemKey !== null,
                    );
                    const valid =
                      planTypeMove(tree, draggingId, type.id, raw) !== null;
                    setDropTarget({
                      id: type.id,
                      position: valid ? raw : "invalid",
                    });
                    if (valid) {
                      event.preventDefault();
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = "move";
                      }
                    } else if (event.dataTransfer) {
                      event.dataTransfer.dropEffect = "none";
                    }
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    ) {
                      setDropTarget((current) =>
                        current?.id === type.id ? null : current,
                      );
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId !== null) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position = typeDropZone(
                        event.clientY,
                        rect.top,
                        rect.height,
                        type.systemKey !== null,
                      );
                      dropOn(draggingId, type, position);
                    }
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  data-dragging={draggingId === type.id ? "" : undefined}
                  data-drop-position={drop ?? undefined}
                  className={clsx(
                    "group flex min-h-[38px] items-center gap-2 rounded-[var(--radius-control)] px-2 hover:bg-[var(--state-hover)]",
                    draggingId === type.id && "opacity-60",
                    drop === "inside" &&
                      "bg-[color-mix(in_srgb,var(--color-voluntary)_8%,var(--color-surface))]",
                    drop === "invalid" && "cursor-no-drop",
                  )}
                  style={{
                    paddingLeft: 8 + node.depth * 18,
                    boxShadow:
                      drop === "before"
                        ? "inset 0 2px 0 var(--color-voluntary)"
                        : drop === "after"
                          ? "inset 0 -2px 0 var(--color-voluntary)"
                          : drop === "inside"
                            ? "inset 0 0 0 1px var(--color-voluntary)"
                            : drop === "invalid"
                              ? "inset 0 0 0 1px var(--color-missed)"
                              : undefined,
                  }}
                >
                  <button
                    type="button"
                    aria-label={t(open ? "common.collapseSection" : "common.expandSection", {
                      section: name,
                    })}
                    aria-expanded={open}
                    data-type-collapse={type.id}
                    disabled={!children}
                    onClick={() => toggleCollapse(type.id)}
                    className={clsx(
                      "grid size-4 shrink-0 place-items-center rounded-[3px] text-[10px]",
                      children
                        ? "text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
                        : "invisible",
                    )}
                  >
                    {open ? "▾" : "▸"}
                  </button>

                  <i
                    aria-hidden="true"
                    className="size-[7px] shrink-0 rounded-full"
                    style={{ background: typeColorVar(type) }}
                  />
                  {type.systemKey === null ? (
                    <span
                      aria-hidden="true"
                      title={t("grid.drag")}
                      className="shrink-0 cursor-grab text-[9px] leading-none text-[var(--color-border-strong)]"
                    >
                      ⋮⋮
                    </span>
                  ) : null}

                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {drop === "inside" ? (
                    <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-voluntary)] px-1.5 py-px text-[10px] font-semibold text-white">
                      {t("types.dropInside")}
                    </span>
                  ) : null}
                  {drop === "invalid" ? (
                    <span className="shrink-0 text-[10px] text-[var(--color-missed)]">
                      {t("types.dropInvalid")}
                    </span>
                  ) : null}
                  {type.systemKey !== null ? (
                    <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--state-hover)] px-1.5 py-px text-[10px] text-[var(--color-text-muted)]">
                      {t("types.builtin")}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
                    {t("types.tasksCount", { count })}
                  </span>

                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      data-type-action="add-task"
                      onClick={() => setAssignTarget(type)}
                      className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
                    >
                      ＋{t("types.addTask")}
                    </button>
                    <button
                      type="button"
                      data-type-action="add-child"
                      onClick={() =>
                        setDialog({ mode: "create", parentId: type.id })
                      }
                      className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
                    >
                      ＋{t("types.addChild")}
                    </button>
                    <button
                      type="button"
                      data-type-action="edit"
                      onClick={() => setDialog({ mode: "edit", type })}
                      className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
                    >
                      {t("manage.edit")}
                    </button>
                    <ConfirmDeleteButton
                      data-type-action="delete"
                      name={name}
                      description={t("types.deleteHint")}
                      errorMessage={t("types.deleteFailed")}
                      disabled={type.systemKey !== null}
                      onConfirm={async (confirmation) => {
                        await useTaskTypesStore
                          .getState()
                          .remove(type.id, confirmation);
                      }}
                      className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--color-missed)] disabled:opacity-30"
                    >
                      {t("manage.delete")}
                    </ConfirmDeleteButton>
                  </div>

                  {directTasks.length > 0 ? (
                    <button
                      type="button"
                      data-type-tasks-toggle={type.id}
                      aria-expanded={showTasks}
                      aria-label={t(
                        showTasks ? "types.collapseTasks" : "types.expandTasks",
                        { name },
                      )}
                      onClick={() => toggleTasks(type.id)}
                      className="shrink-0 rounded-[var(--radius-control)] px-1 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
                    >
                      {showTasks ? "▾" : "▸"}
                    </button>
                  ) : null}
                </div>

                {showTasks ? (
                  <ul
                    data-type-task-list={type.id}
                    className="m-0 mb-1 ml-6 flex list-none flex-col gap-px border-l border-[var(--color-border)] pl-3"
                  >
                    {directTasks.map((task) => (
                      <li
                        key={task.id}
                        className="truncate py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)]"
                      >
                        {task.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        {tree.every((type) => type.systemKey !== null) ? (
          <p className="m-0 px-2 py-3 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t("types.empty")}
          </p>
        ) : null}
      </section>

      {dialog ? (
        <TypeDialog
          mode={dialog.mode}
          type={dialog.mode === "edit" ? dialog.type : null}
          parentId={dialog.mode === "create" ? dialog.parentId : null}
          types={tree}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {assignTarget !== null ? (
        <AssignTasksDialog
          target={assignTarget}
          types={tree}
          tasks={tasks}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}
    </>
  );
}

function AssignTasksDialog({
  target,
  types,
  tasks,
  onClose,
}: {
  target: TaskType;
  types: TaskType[];
  tasks: Task[];
  onClose: () => void;
}) {
  const t = useT();
  const assignType = useTasksStore((state) => state.assignType);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pathById = useMemo(
    () => new Map(flattenTypeTree(types).map((node) => [node.type.id, node.path])),
    [types],
  );
  const candidates = useMemo(() => {
    const excluded = descendantTypeIds(types, target.id);
    return sortedTasksByType(
      tasks.filter((task) => !excluded.has(resolveTaskTypeId(task))),
      types,
    );
  }, [tasks, types, target.id]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return candidates;
    }
    return candidates.filter((task) =>
      task.name.toLowerCase().includes(needle),
    );
  }, [candidates, query]);
  const allSelected =
    filtered.length > 0 && filtered.every((task) => selected.has(task.id));

  const toggle = (taskId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) {
        filtered.forEach((task) => next.delete(task.id));
      } else {
        filtered.forEach((task) => next.add(task.id));
      }
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0 || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await assignType([...selected], target.id);
      onClose();
    } catch {
      setError(t("types.addTaskFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label={t("manage.cancel")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("types.addTasksTitle", {
          name: typeDisplayName(target, t),
        })}
        data-assign-dialog
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex max-h-[calc(100vh-48px)] w-[440px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">
          {t("types.addTasksTitle", { name: typeDisplayName(target, t) })}
        </h2>
        <p className="m-0 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.addTasksHint")}
        </p>

        <div className="flex items-center gap-2">
          <input
            autoFocus
            data-assign-search
            value={query}
            aria-label={t("types.searchTasks")}
            placeholder={t("types.searchTasks")}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          <button
            type="button"
            data-assign-toggle-all
            onClick={toggleAll}
            className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {allSelected ? t("types.clearAll") : t("types.selectAll")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-border)]">
          {filtered.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-[var(--text-2xs)] text-[var(--color-text-muted)]">
              {t("types.noAvailableTasks")}
            </p>
          ) : (
            filtered.map((task) => {
              const path = pathById.get(resolveTaskTypeId(task));
              const currentType = path
                ? path.map((type) => typeDisplayName(type, t)).join(" / ")
                : "";
              return (
                <label
                  key={task.id}
                  data-assign-task={task.id}
                  className="flex min-h-[34px] cursor-pointer items-center gap-2 border-b border-[var(--color-border)] px-3 last:border-b-0 hover:bg-[var(--state-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() => toggle(task.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {task.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                    {currentType}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {error ? (
          <p className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
            {t("types.selectedCount", { count: selected.size })}
          </span>
          <button
            type="button"
            data-assign-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="button"
            data-assign-submit
            disabled={selected.size === 0 || pending}
            onClick={() => void submit()}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t("types.addSelected", { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeDialog({
  mode,
  type,
  parentId,
  types,
  onClose,
}: {
  mode: "create" | "edit";
  type: TaskType | null;
  parentId: string | null;
  types: TaskType[];
  onClose: () => void;
}) {
  const t = useT();
  const create = useTaskTypesStore((state) => state.create);
  const update = useTaskTypesStore((state) => state.update);
  const [name, setName] = useState(type?.name ?? "");
  const [parent, setParent] = useState(
    type?.parentId ?? parentId ?? "",
  );
  const [color, setColor] = useState<TaskTypeColor>(
    type?.color ?? nextTypeColor(types.length),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const flat = useMemo(() => flattenTypeTree(types), [types]);
  const parentOptions = flat.filter((node) => {
    if (type === null) {
      return true;
    }
    return (
      node.type.id !== type.id &&
      !isTypeDescendant(types, type.id, node.type.id)
    );
  });

  const canSubmit = type?.systemKey != null || name.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (mode === "create") {
        await create({
          name: name.trim(),
          parentId: parent === "" ? null : parent,
          color,
        });
      } else if (type) {
        const trimmed = name.trim();
        await update(type.id, {
          name: trimmed === "" && type.systemKey !== null ? null : trimmed,
          parentId: parent === "" ? null : parent,
          color,
        });
      }
      onClose();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(ERROR_KEYS[code] ?? t("types.error.saveFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label={t("manage.cancel")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/25"
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t(mode === "create" ? "types.newTitle" : "types.editTitle", {
          name: type ? typeDisplayName(type, t) : "",
        })}
        data-type-dialog={mode}
        onSubmit={(event) => void submit(event)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">
          {t(mode === "create" ? "types.newTitle" : "types.editTitle", {
            name: type ? typeDisplayName(type, t) : "",
          })}
        </h2>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.field.name")}
          <input
            autoFocus
            data-type-name
            value={name}
            placeholder={
              type?.systemKey
                ? typeDisplayName(type, t)
                : t("types.namePlaceholder")
            }
            onChange={(event) => setName(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          {type?.systemKey ? (
            <button
              type="button"
              data-type-restore-name
              onClick={() => setName("")}
              className="self-start text-[var(--text-2xs)] text-[var(--color-voluntary)] hover:underline"
            >
              {t("types.restoreName")}
            </button>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.field.parent")}
          <select
            data-type-parent
            value={parent}
            disabled={type?.systemKey != null}
            onChange={(event) => setParent(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
          >
            <option value="">{t("types.parentNone")}</option>
            {parentOptions.map((node) => (
              <option key={node.type.id} value={node.type.id}>
                {`${"\u3000".repeat(node.depth)}${typeDisplayName(node.type, t)}`}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 p-0 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t("types.field.color")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {TYPE_COLORS.map((option) => (
              <label
                key={option}
                className={clsx(
                  "flex cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[var(--text-2xs)]",
                  color === option
                    ? "border-[var(--color-border-strong)] bg-[var(--state-active)] font-semibold"
                    : "border-[var(--color-border)]",
                )}
              >
                <input
                  type="radio"
                  name="type-color"
                  value={option}
                  data-type-color-option={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                  className="sr-only"
                />
                <i
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: typeColorVarForKey(option) }}
                />
                {t(`types.color.${option}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p
            data-type-error
            className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-1.5">
          <button
            type="button"
            data-type-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            data-type-submit
            disabled={!canSubmit || pending}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t(mode === "create" ? "types.submit" : "types.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
