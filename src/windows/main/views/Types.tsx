import { clsx } from "clsx";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import { logicalToday } from "../../../domain/date";
import { isRetired } from "../../../domain/grid";
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
import { useDayNow } from "../../../stores/dayStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTaskTypesStore } from "../../../stores/taskTypesStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { ConfirmDeleteButton } from "../../../ui/ConfirmDeleteButton";
import { Icon } from "../../../ui/Icon";
import {
  nextTypeColor,
  TYPE_COLORS,
  typeColorVar,
  typeColorVarForKey,
  typeDisplayName,
} from "../../../ui/taskType";
import { useT } from "../../../ui/useT";
import { TaskTypePicker } from "./TaskTypePicker";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

const ERROR_KEYS: Record<string, MessageKey> = {
  "empty-name": "types.error.emptyName",
  "duplicate-name": "types.error.duplicateName",
  cycle: "types.error.cycle",
  "has-tasks": "types.error.hasTasks",
  "has-children": "types.error.hasChildren",
  "last-type": "types.error.lastType",
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const selectedNode = selectedId
    ? flat.find((node) => node.type.id === selectedId)
    : undefined;
  const selected = selectedNode?.type ?? null;

  useEffect(() => {
    if (selectedId && flat.some((node) => node.type.id === selectedId)) {
      return;
    }
    setSelectedId(flat[0]?.type.id ?? null);
  }, [flat, selectedId]);

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

      <section
        className={`${CARD} flex min-h-0 flex-1 flex-col overflow-hidden`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {visibleRows.map((node) => {
            const type = node.type;
            const count = subtreeCount(type.id);
            const children = hasChildren(type.id);
            const open = !collapsed.has(type.id);
            const name = typeDisplayName(type, t);
            const drop = dropTarget?.id === type.id ? dropTarget.position : null;
            const isSelected = selectedId === type.id;

            return (
              <li key={type.id} data-type-row={type.id}>
                <div
                  onClick={() => setSelectedId(type.id)}
                  draggable
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
                      );
                      dropOn(draggingId, type, position);
                    }
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  data-dragging={draggingId === type.id ? "" : undefined}
                  data-drop-position={drop ?? undefined}
                  data-selected={isSelected ? "" : undefined}
                  aria-current={isSelected ? "true" : undefined}
                  className={clsx(
                    "group relative flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 hover:bg-[var(--state-hover)]",
                    isSelected && "bg-[var(--state-selected)]",
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
                  {Array.from({ length: node.depth }, (_, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-0 h-full w-px bg-[var(--color-border)]"
                      style={{ left: 14 + index * 18 }}
                    />
                  ))}
                  {isSelected ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-[2px] bg-[var(--color-voluntary)]"
                    />
                  ) : null}

                  <span
                    aria-hidden="true"
                    title={t("grid.drag")}
                    className={clsx(
                      "shrink-0 cursor-grab text-[9px] leading-none text-[var(--color-border-strong)] opacity-0 transition-opacity group-hover:opacity-100",
                      isSelected && "opacity-100",
                    )}
                  >
                    ⋮⋮
                  </span>

                  <button
                    type="button"
                    aria-label={t(
                      open ? "common.collapseSection" : "common.expandSection",
                      { section: name },
                    )}
                    aria-expanded={open}
                    data-type-collapse={type.id}
                    disabled={!children}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCollapse(type.id);
                    }}
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
                  <span className="shrink-0 text-[var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
                    {count}
                  </span>
                </div>
              </li>
            );
          })}
          </ul>
        </div>

        {selected && selectedNode ? (
          <TypeDetailDock
            type={selected}
            path={selectedNode.path}
            count={subtreeCount(selected.id)}
            directTasks={tasksByType.get(selected.id) ?? []}
            types={tree}
            canDelete={tree.length > 1}
            onAddTask={() => setAssignTarget(selected)}
            onEdit={() => setDialog({ mode: "edit", type: selected })}
            onAddChild={() =>
              setDialog({ mode: "create", parentId: selected.id })
            }
          />
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

function TypeDetailDock({
  type,
  path,
  count,
  directTasks,
  types,
  canDelete,
  onAddTask,
  onEdit,
  onAddChild,
}: {
  type: TaskType;
  path: TaskType[];
  count: number;
  directTasks: Task[];
  types: TaskType[];
  canDelete: boolean;
  onAddTask: () => void;
  onEdit: () => void;
  onAddChild: () => void;
}) {
  const t = useT();
  const name = typeDisplayName(type, t);
  const trail = path.slice(0, -1);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [moveOpen, setMoveOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const moveTargets = useMemo(() => {
    const excluded = descendantTypeIds(types, type.id);
    return flattenTypeTree(types).filter(
      (node) => !excluded.has(node.type.id),
    );
  }, [types, type.id]);
  const canMoveOut = moveTargets.length > 0;
  const selectedTasks = directTasks.filter((task) =>
    selectedTaskIds.has(task.id),
  );
  const allSelected =
    directTasks.length > 0 &&
    directTasks.every((task) => selectedTaskIds.has(task.id));

  useEffect(() => {
    setSelectedTaskIds(new Set());
    setMoveOpen(false);
  }, [type.id]);

  useEffect(() => {
    const available = new Set(directTasks.map((task) => task.id));
    setSelectedTaskIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (available.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [directTasks]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedTaskIds.size > 0 &&
        selectedTaskIds.size < directTasks.length;
    }
  }, [selectedTaskIds, directTasks.length]);

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((current) => {
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
    setSelectedTaskIds(
      allSelected ? new Set() : new Set(directTasks.map((task) => task.id)),
    );
  };

  return (
    <section
      data-type-dock
      className="flex max-h-[45%] min-h-0 flex-none flex-col border-t border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-4"
    >
      <div className="flex flex-none items-start gap-4">
        <div className="min-w-0 flex-1">
          {trail.length > 0 ? (
            <div className="text-[var(--text-2xs)] text-[var(--color-text-muted)]">
              {trail.map((item) => typeDisplayName(item, t)).join(" / ")}
            </div>
          ) : null}
          <div className="mt-0.5 flex items-center gap-2">
            <i
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: typeColorVar(type) }}
            />
            <h2 className="m-0 text-[var(--text-md)] font-semibold">{name}</h2>
            <span className="text-xs text-[var(--color-text-muted)]">
              {t("types.tasksCount", { count })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-dock-action="add-task"
            onClick={onAddTask}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-3 py-1 text-[var(--text-2xs)] font-semibold text-white"
          >
            ＋ {t("types.addTask")}
          </button>
          <button
            type="button"
            data-dock-action="edit"
            onClick={onEdit}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[var(--text-2xs)] text-[var(--color-text)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.edit")}
          </button>
          <button
            type="button"
            data-dock-action="add-child"
            onClick={onAddChild}
            className="rounded-[var(--radius-control)] px-2 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--color-text)]"
          >
            ＋ {t("types.addChild")}
          </button>
          <ConfirmDeleteButton
            data-dock-action="delete"
            name={name}
            description={t("types.deleteHint")}
            errorMessage={t("types.deleteFailed")}
            disabled={!canDelete}
            title={!canDelete ? t("types.error.lastType") : undefined}
            onConfirm={async (confirmation) => {
              await useTaskTypesStore.getState().remove(type.id, confirmation);
            }}
            className="rounded-[var(--radius-control)] px-2 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--color-missed)] disabled:opacity-30"
          >
            {t("manage.delete")}
          </ConfirmDeleteButton>
        </div>
      </div>

      <div className="my-3 h-px flex-none bg-[var(--color-border)]" />

      <div className="flex flex-none items-center gap-2 text-[var(--text-2xs)] font-semibold text-[var(--color-text-muted)]">
        <span aria-hidden="true" className="size-4 shrink-0" />
        <span>{t("types.taskList")}</span>
        <span className="font-normal tabular-nums">{directTasks.length}</span>
        {directTasks.length > 0 ? (
          <div className="ml-auto flex items-center gap-3 font-normal">
            <label className="inline-flex cursor-pointer items-center gap-1">
              <input
                ref={selectAllRef}
                type="checkbox"
                data-dock-select-all
                checked={allSelected}
                onChange={toggleAll}
                aria-label={t("types.selectAll")}
                className="size-4 cursor-pointer accent-[var(--color-voluntary)]"
              />
              {t("types.selectAll")}
            </label>
            <button
              type="button"
              data-dock-action="move-out"
              disabled={selectedTaskIds.size === 0 || !canMoveOut}
              title={!canMoveOut ? t("types.noMoveTarget") : undefined}
              onClick={() => setMoveOpen(true)}
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--text-2xs)] text-[var(--color-text)] hover:bg-[var(--state-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {selectedTaskIds.size > 0
                ? t("types.moveOutSelected", {
                    count: selectedTaskIds.size,
                  })
                : t("types.moveOut")}
            </button>
          </div>
        ) : null}
      </div>

      {directTasks.length === 0 ? (
        <p className="m-0 py-1 pl-8 pr-2 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.detailEmpty")} · {t("types.detailEmptyHint")}
        </p>
      ) : (
        <ul
          data-type-task-list
          className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0"
        >
          {directTasks.map((task) => {
            const checked = selectedTaskIds.has(task.id);
            return (
              <li
                key={task.id}
                className="border-t border-[var(--color-border)] first:border-t-0"
              >
                <label
                  data-dock-task={task.id}
                  className={clsx(
                    "flex min-h-[34px] cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 hover:bg-[var(--state-hover)] focus-within:shadow-[var(--focus-ring)]",
                    checked && "bg-[var(--state-selected)]",
                  )}
                >
                  <input
                    type="checkbox"
                    data-dock-task-check={task.id}
                    checked={checked}
                    onChange={() => toggleTask(task.id)}
                    aria-label={t("types.selectTask", { name: task.name })}
                    className="size-4 cursor-pointer accent-[var(--color-voluntary)]"
                  />
                  <Icon
                    name="task"
                    className="size-4 shrink-0 text-[var(--color-text-muted)]"
                  />
                  <span
                    className={clsx(
                      "min-w-0 flex-1 wrap-anywhere text-sm",
                      checked && "font-semibold",
                    )}
                  >
                    {task.name}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {moveOpen && selectedTasks.length > 0 ? (
        <MoveTasksDialog
          source={type}
          tasks={selectedTasks}
          types={types}
          onClose={() => setMoveOpen(false)}
        />
      ) : null}
    </section>
  );
}

function MoveTasksDialog({
  source,
  tasks,
  types,
  onClose,
}: {
  source: TaskType;
  tasks: Task[];
  types: TaskType[];
  onClose: () => void;
}) {
  const t = useT();
  const assignType = useTasksStore((state) => state.assignType);
  const excluded = useMemo(
    () => descendantTypeIds(types, source.id),
    [types, source.id],
  );
  const targets = useMemo(
    () =>
      flattenTypeTree(types).filter(
        (node) => !excluded.has(node.type.id),
      ),
    [types, excluded],
  );
  const [targetId, setTargetId] = useState(
    () => targets[0]?.type.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (targetId === "" || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await assignType(
        tasks.map((task) => task.id),
        targetId,
      );
      onClose();
    } catch {
      setError(t("types.moveOutFailed"));
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
        aria-label={t("types.moveOutTitle", {
          name: typeDisplayName(source, t),
        })}
        data-move-out-dialog
        onSubmit={(event) => void submit(event)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex w-[420px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">
          {t("types.moveOutTitle", {
            name: typeDisplayName(source, t),
          })}
        </h2>
        <p className="m-0 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.moveOutHint")}
        </p>

        <div className="flex flex-wrap gap-1">
          {tasks.map((task) => (
            <span
              key={task.id}
              data-move-out-task={task.id}
              className="inline-flex min-h-6 max-w-full items-center rounded-[var(--radius-pill)] bg-[var(--state-selected)] px-2 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-secondary)]"
            >
              <span className="min-w-0 wrap-anywhere">{task.name}</span>
            </span>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.field.targetType")}
          <TaskTypePicker
            value={targetId}
            onChange={setTargetId}
            types={types}
            excludeIds={excluded}
            dataAttribute="move-out"
            ariaLabel={t("types.field.targetType")}
          />
        </label>

        <div className="flex items-start gap-1 rounded-[var(--radius-control)] bg-[var(--color-surface-2)] p-2 text-[var(--text-2xs)] leading-normal text-[var(--color-text-tertiary)]">
          <span aria-hidden="true">ⓘ</span>
          <span>{t("types.moveOutNote")}</span>
        </div>

        {error ? (
          <p className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
            {t("types.selectedCount", { count: tasks.length })}
          </span>
          <button
            type="button"
            data-move-out-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            data-move-out-submit
            disabled={targetId === "" || pending}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t("types.moveOutSelected", { count: tasks.length })}
          </button>
        </div>
      </form>
    </div>
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
  const now = useDayNow();
  const dayStartHour = useSettingsStore(
    (state) => state.settings.dayStartHour,
  );
  const today = useMemo(
    () => logicalToday(now, dayStartHour),
    [now, dayStartHour],
  );
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
      tasks.filter(
        (task) =>
          !excluded.has(resolveTaskTypeId(task)) && !isRetired(task, today),
      ),
      types,
    );
  }, [tasks, types, target.id, today]);
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
          {t("types.addTasksHint")} · {t("types.disabledHiddenHint")}
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
                  className="flex min-h-[34px] cursor-pointer items-center gap-2 border-b border-[var(--color-border)] px-3 py-1 last:border-b-0 hover:bg-[var(--state-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() => toggle(task.id)}
                  />
                  <span className="min-w-0 flex-1 wrap-anywhere text-xs">
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
  const [color, setColor] = useState<TaskTypeColor | null>(
    type ? (type.color ?? null) : nextTypeColor(types.length),
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

  const canSubmit = type?.name === null || name.trim().length > 0;

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
          name: trimmed === "" && type.name === null ? null : trimmed,
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
              type && type.name === null
                ? typeDisplayName(type, t)
                : t("types.namePlaceholder")
            }
            onChange={(event) => setName(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("types.field.parent")}
          <select
            data-type-parent
            value={parent}
            onChange={(event) => setParent(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
