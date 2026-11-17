import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import {
  useEffect,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { addDays } from "../../../domain/date";
import {
  normalizeEveryDays,
  validateInterval,
  type IntervalError,
} from "../../../domain/intervals";
import {
  MANAGE_COLUMNS,
  resetColumnWidth,
  sanitizeManageColumnWidths,
  type ManageColumnKey,
} from "../../../domain/manageColumns";
import { namePeriodsOf } from "../../../domain/names";
import type { MessageKey } from "../../../shared/i18n";
import type { Task } from "../../../domain/types";
import {
  useManageRows,
  type ManageRow,
  type ManageStatus,
} from "../../../stores/selectors/manage";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTaskTypesStore } from "../../../stores/taskTypesStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { Chip, type ChipVariant } from "../../../ui/Chip";
import { ConfirmDeleteButton } from "../../../ui/ConfirmDeleteButton";
import { DateField } from "../../../ui/DateField";
import { typeColorVar, typeDisplayName } from "../../../ui/taskType";
import { useT } from "../../../ui/useT";
import { TaskTypePicker } from "./TaskTypePicker";
import { useColumnResize } from "./useColumnResize";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

const STATUS_META: Record<
  ManageStatus,
  { labelKey: MessageKey; variant: ChipVariant }
> = {
  active: { labelKey: "manage.status.active", variant: "success" },
  scheduled: { labelKey: "manage.status.scheduled", variant: "warning" },
  endingToday: { labelKey: "manage.status.endingToday", variant: "warning" },
  endingLater: { labelKey: "manage.status.endingLater", variant: "warning" },
  disabled: { labelKey: "manage.status.disabled", variant: "neutral" },
};

const COLUMN_LABEL_KEY: Record<ManageColumnKey, MessageKey> = {
  task: "manage.col.task",
  category: "manage.col.category",
  start: "manage.col.start",
  end: "manage.col.end",
  status: "manage.col.status",
  actions: "manage.col.actions",
};

export default function Manage() {
  const t = useT();
  const { today, rows } = useManageRows();
  const [creating, setCreating] = useState(false);
  const storedWidths = useSettingsStore(
    (state) => state.settings.manageColumnWidths,
  );
  const saveSettings = useSettingsStore((state) => state.update);
  const [widths, setWidths] = useState(() =>
    sanitizeManageColumnWidths(storedWidths),
  );

  // 落库后（或其它窗口改了设置）以 settings 为准。
  useEffect(() => {
    setWidths(sanitizeManageColumnWidths(storedWidths));
  }, [storedWidths]);

  const persistWidths = (next: number[]) => {
    void saveSettings({ manageColumnWidths: next }).catch((error: unknown) => {
      console.error("[manage] 保存列宽失败", error);
    });
  };

  const resize = useColumnResize({
    widths,
    onChange: setWidths,
    onCommit: persistWidths,
  });

  const resetWidth = (index: number) => {
    const next = resetColumnWidth(widths, index);
    setWidths(next);
    persistWidths(next);
  };

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("manage.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {t("manage.count", { count: rows.length })}
        </span>
        <button
          type="button"
          data-manage-new
          onClick={() => setCreating(true)}
          className="ml-auto rounded-[var(--radius-pill)] bg-[var(--color-voluntary)] px-3 py-1 text-[var(--text-2xs)] font-semibold text-white"
        >
          ＋ {t("manage.new")}
        </button>
      </header>

      {rows.length === 0 ? (
        <section
          data-manage-empty
          className={`${CARD} flex min-h-0 flex-1 items-center justify-center`}
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("manage.empty")}
          </p>
        </section>
      ) : (
        <section className={`${CARD} min-h-0 flex-1 overflow-auto`}>
          <table
            data-manage-table
            className={clsx(
              "w-full table-fixed border-collapse text-sm",
              resize.resizing !== null && "cursor-col-resize select-none",
            )}
          >
            <colgroup>
              {MANAGE_COLUMNS.map((column, index) => (
                <col key={column} style={{ width: `${widths[index]}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 select-none bg-[var(--color-surface)] text-left text-xs text-[var(--color-text-muted)]">
                {MANAGE_COLUMNS.map((column, index) => (
                  <Th
                    key={column}
                    column={column}
                    resizable={index < MANAGE_COLUMNS.length - 1}
                    resizing={resize.resizing === index}
                    onReset={() => resetWidth(index)}
                    onResizeStart={(event) => resize.begin(index, event)}
                    onResizeMove={resize.move}
                    onResizeEnd={resize.end}
                  >
                    {t(COLUMN_LABEL_KEY[column])}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ManageTableRow key={row.task.id} row={row} today={today} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {creating ? (
        <CreateTaskDialog today={today} onClose={() => setCreating(false)} />
      ) : null}
    </>
  );
}

function CreateTaskDialog({
  today,
  onClose,
}: {
  today: string;
  onClose: () => void;
}) {
  const t = useT();
  const create = useTasksStore((state) => state.create);
  const types = useTaskTypesStore((state) => state.types);
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("voluntary");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [everyDays, setEveryDays] = useState("1");
  const error = validateInterval(startDate, endDate || null, null);
  const canSubmit =
    name.trim().length > 0 && startDate.length > 0 && error === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    void create({
      name: name.trim(),
      typeId,
      startDate,
      endDate: endDate || null,
      everyDays: normalizeEveryDays(Number(everyDays)),
    });
    onClose();
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
        aria-label={t("manage.newTitle")}
        data-new-task
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex w-[360px] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">{t("manage.newTitle")}</h2>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.name")}
          <input
            autoFocus
            data-new-name
            value={name}
            placeholder={t("manage.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.category")}
          <TaskTypePicker
            value={typeId}
            onChange={setTypeId}
            types={types}
            dataAttribute="new"
          />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.start")}
          <DateField
            data-new-start
            value={startDate || null}
            onChange={(next) => setStartDate(next ?? "")}
            aria-label={t("manage.field.start")}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.end")}
          <DateField
            data-new-end
            value={endDate || null}
            min={startDate || undefined}
            allowClear
            onChange={(next) => setEndDate(next ?? "")}
            aria-label={t("manage.field.end")}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
          <span className="leading-tight">{t("manage.deadlineHint")}</span>
        </label>

        {error ? (
          <p
            data-new-error
            className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]"
          >
            {t(INTERVAL_ERROR_KEY[error])}
          </p>
        ) : null}

        <EveryDaysField
          value={everyDays}
          onChange={setEveryDays}
          dataAttribute="new"
        />

        <div className="mt-1 flex justify-end gap-1.5">
          <button
            type="button"
            data-new-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            data-new-submit
            disabled={!canSubmit}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t("manage.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 间隔天数：1 = 每天；N = 以启用日为第 1 天，每 N 天一次。 */
function EveryDaysField({
  value,
  onChange,
  dataAttribute,
}: {
  value: string;
  onChange: (value: string) => void;
  dataAttribute: string;
}) {
  const t = useT();

  return (
    <label className="flex min-w-0 flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
      {t("manage.field.everyDays")}
      <input
        type="number"
        min={1}
        max={365}
        step={1}
        data-every-days={dataAttribute}
        value={value}
        aria-label={t("manage.field.everyDays")}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm tabular-nums text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <span className="leading-tight">{t("manage.everyDaysHint")}</span>
    </label>
  );
}

const INTERVAL_ERROR_KEY: Record<IntervalError, MessageKey> = {
  emptyStart: "manage.error.emptyStart",
  endBeforeStart: "manage.error.endBeforeStart",
  overlapsPrevious: "manage.error.overlapsPrevious",
};

/** 编辑任务：名称/类型 + 最新一段区间；更早区间只读，历史打卡不碰。 */
function EditTaskDialog({
  task,
  today,
  onClose,
}: {
  task: Task;
  today: string;
  onClose: () => void;
}) {
  const t = useT();
  const update = useTasksStore((state) => state.update);
  const types = useTaskTypesStore((state) => state.types);
  const rename = useTasksStore((state) => state.rename);
  const updateInterval = useTasksStore((state) => state.updateInterval);
  const sorted = [...task.intervals].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const latest = sorted[sorted.length - 1] ?? null;
  const previousEnd = sorted.length > 1 ? sorted[sorted.length - 2].end : null;
  const periods = namePeriodsOf(task);

  const [name, setName] = useState(task.name);
  const [typeId, setTypeId] = useState(task.typeId ?? task.category);
  const [typoOnly, setTypoOnly] = useState(true);
  const [start, setStart] = useState(latest?.start ?? "");
  const [end, setEnd] = useState(latest?.end ?? "");
  const [openEnded, setOpenEnded] = useState(latest?.end === null);
  const [everyDays, setEveryDays] = useState(
    String(latest?.everyDays ?? 1),
  );

  const error = validateInterval(
    start,
    openEnded ? null : end || null,
    previousEnd,
  );
  const canSubmit = name.trim().length > 0 && error === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed !== task.name) {
      void rename(
        task.id,
        trimmed,
        today,
        typoOnly ? "rewrite-current" : "from-today",
      );
    }
    if (typeId !== (task.typeId ?? task.category)) {
      void update(task.id, { typeId });
    }
    if (latest) {
      void updateInterval(latest.id, {
        start,
        end: openEnded ? null : end || null,
        everyDays: normalizeEveryDays(Number(everyDays)),
      });
    }
    onClose();
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
        aria-label={t("manage.editTitle", { name: task.name })}
        data-edit-task
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex max-h-[calc(100vh-32px)] w-[420px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">
          {t("manage.editTitle", { name: task.name })}
        </h2>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.name")}
          <input
            autoFocus
            data-edit-name
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          <span className="leading-tight">
            {t(typoOnly ? "manage.renameHintTypo" : "manage.renameHint")}
          </span>
        </label>

        <label className="flex items-center gap-1.5 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            data-edit-name-typo
            checked={typoOnly}
            onChange={(event) => setTypoOnly(event.target.checked)}
          />
          {t("manage.nameHistory.typo")}
        </label>

        <div className="text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          <p className="m-0 mb-1">{t("manage.nameHistory")}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 tabular-nums">
            {periods.map((period) => (
              <li key={period.id} data-name-history={period.id}>
                <span className="mr-2 text-[var(--color-text)]">
                  {period.name}
                </span>
                {format(parseISO(period.start), "MM/dd")} –{" "}
                {period.end
                  ? format(parseISO(period.end), "MM/dd")
                  : t("manage.ongoing")}
              </li>
            ))}
          </ul>
        </div>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.field.category")}
          <TaskTypePicker
            value={typeId}
            onChange={setTypeId}
            types={types}
            dataAttribute="edit"
          />
        </label>

        {sorted.length > 1 ? (
          <div className="text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            <p className="m-0 mb-1">{t("manage.history")}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 tabular-nums">
              {sorted.slice(0, -1).map((interval) => (
                <li key={interval.id} data-history-interval={interval.id}>
                  {format(parseISO(interval.start), "MM/dd")} –{" "}
                  {interval.end
                    ? format(parseISO(interval.end), "MM/dd")
                    : t("manage.ongoing")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t("manage.field.start")}
            <DateField
              data-edit-start
              value={start || null}
              onChange={(next) => setStart(next ?? "")}
              aria-label={t("manage.field.start")}
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {t("manage.field.end")}
            <DateField
              data-edit-end
              value={end || null}
              min={start || undefined}
              disabled={openEnded}
              onChange={(next) => setEnd(next ?? "")}
              aria-label={t("manage.field.end")}
              align="right"
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] disabled:opacity-40"
            />
          </label>
        </div>

        <EveryDaysField
          value={everyDays}
          onChange={setEveryDays}
          dataAttribute="edit"
        />

        <label className="flex items-center gap-1.5 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            data-edit-open
            checked={openEnded}
            onChange={(event) => {
              const open = event.target.checked;
              setOpenEnded(open);
              if (!open && !end) {
                setEnd(start);
              }
            }}
          />
          {t("manage.field.openEnded")}
        </label>

        {error ? (
          <p
            data-edit-error
            className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]"
          >
            {t(INTERVAL_ERROR_KEY[error])}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-1.5">
          <button
            type="button"
            data-edit-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            data-edit-submit
            disabled={!canSubmit}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t("manage.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
function IntervalDialog({
  task,
  mode,
  today,
  onClose,
}: {
  task: ManageRow["task"];
  mode: "stop" | "resume";
  today: string;
  onClose: () => void;
}) {
  const t = useT();
  const closeInterval = useTasksStore((state) => state.closeInterval);
  const appendInterval = useTasksStore((state) => state.appendInterval);
  const sorted = [...task.intervals].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const latest = sorted[sorted.length - 1] ?? null;
  const latestStart = latest?.start ?? today;
  const latestEnd = latest?.end ?? null;

  // 停用不得早于区间启用日；重新启用不得早于上一段结束日的次日。
  const minDate =
    mode === "stop"
      ? today > latestStart
        ? today
        : latestStart
      : latestEnd && latestEnd >= today
        ? addDays(latestEnd, 1)
        : today;

  const [date, setDate] = useState(minDate);
  const [everyDays, setEveryDays] = useState(
    String(latest?.everyDays ?? 1),
  );
  const [error, setError] = useState<string | null>(null);
  const valid = date.length > 0 && date >= minDate;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    setError(null);
    try {
      if (mode === "stop") {
        await closeInterval(task.id, date);
      } else {
        await appendInterval(
          task.id,
          date,
          normalizeEveryDays(Number(everyDays)),
        );
      }
      onClose();
    } catch {
      setError(t("manage.error.intervalFailed"));
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
        aria-label={t(
          mode === "stop" ? "manage.stopTitle" : "manage.resumeTitle",
          { name: task.name },
        )}
        data-interval-dialog={mode}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="relative z-10 flex w-[340px] flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-popover)]"
      >
        <h2 className="m-0 text-sm font-semibold">
          {t(mode === "stop" ? "manage.stopTitle" : "manage.resumeTitle", {
            name: task.name,
          })}
        </h2>

        <label className="flex flex-col gap-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t("manage.effectiveDate")}
          <DateField
            data-interval-date
            min={minDate || undefined}
            value={date || null}
            onChange={(next) => setDate(next ?? "")}
            aria-label={t("manage.effectiveDate")}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
        </label>

        {mode === "resume" ? (
          <EveryDaysField
            value={everyDays}
            onChange={setEveryDays}
            dataAttribute="resume"
          />
        ) : null}

        <p className="m-0 text-[var(--text-2xs)] text-[var(--color-text-muted)]">
          {t(mode === "stop" ? "manage.stopHint" : "manage.resumeHint")}
        </p>
        {!valid || error ? (
          <p
            data-interval-error
            className="m-0 text-[var(--text-2xs)] text-[var(--color-missed)]"
          >
            {error ?? t("manage.dateInvalid")}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-1.5">
          <button
            type="button"
            data-interval-cancel
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-2.5 py-1 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            data-interval-submit
            disabled={!valid}
            className="rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 text-[var(--text-2xs)] font-semibold text-white disabled:opacity-40"
          >
            {t(
              mode === "stop" ? "manage.confirmStop" : "manage.confirmResume",
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Th({
  column,
  resizable,
  resizing,
  onReset,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  children,
}: {
  column: ManageColumnKey;
  resizable: boolean;
  resizing: boolean;
  onReset: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeEnd: (event: ReactPointerEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const t = useT();

  return (
    <th
      scope="col"
      data-manage-col={column}
      onDoubleClick={onReset}
      className="relative h-9 border-b border-[var(--color-border)] px-3 font-medium"
    >
      {children}
      {resizable ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={t("manage.resizeColumn")}
          data-manage-col-resize={column}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
          className={clsx(
            "absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none",
            resizing
              ? "bg-[var(--color-border-strong)]"
              : "hover:bg-[var(--color-border-strong)]",
          )}
        />
      ) : null}
    </th>
  );
}

function ManageTableRow({ row, today }: { row: ManageRow; today: string }) {
  const t = useT();
  const remove = useTasksStore((state) => state.remove);
  const meta = STATUS_META[row.status];
  const retired = row.status === "disabled";
  const [dialog, setDialog] = useState<"stop" | "resume" | "edit" | null>(
    null,
  );

  return (
    <tr
      data-manage-row={row.task.id}
      data-status={row.status}
      className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--state-hover)]"
    >
      <td className="h-[38px] px-3">
        <div className="flex items-center gap-2">
          <i
            aria-hidden="true"
            className="size-[5px] shrink-0 rounded-full"
            style={{
              background: typeColorVar(row.type),
              opacity: retired ? 0.35 : 1,
            }}
          />
          <span
            className={
              retired
                ? "truncate text-[var(--color-text-muted)]"
                : "truncate"
            }
          >
            {row.task.name}
          </span>
          {row.intervalCount > 1 ? (
            <Chip
              variant="neutral"
              data-interval-count={row.intervalCount}
              title={t("manage.intervalsHint")}
            >
              {t("manage.intervals", { count: row.intervalCount })}
            </Chip>
          ) : null}
          {row.everyDays > 1 ? (
            <Chip variant="info" data-every-days={row.everyDays}>
              {t("manage.everyDays", { count: row.everyDays })}
            </Chip>
          ) : null}
        </div>
      </td>
      <td className="px-3 text-[var(--color-text-muted)]">
        <span
          title={row.typePath
            .map((type) => typeDisplayName(type, t))
            .join(" / ")}
        >
          {typeDisplayName(row.type, t)}
        </span>
      </td>
      <td className="px-3 tabular-nums text-[var(--color-text-muted)]">
        {row.start ? format(parseISO(row.start), "MM/dd") : t("manage.never")}
      </td>
      <td className="px-3 tabular-nums text-[var(--color-text-muted)]">
        {row.end ? format(parseISO(row.end), "MM/dd") : t("manage.never")}
      </td>
      <td className="px-3">
        <div className="flex items-center gap-1">
          <Chip variant={meta.variant}>{t(meta.labelKey)}</Chip>
        </div>
      </td>
      <td className="px-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-manage-action={row.hasOpen ? "stop" : "resume"}
            onClick={() => setDialog(row.hasOpen ? "stop" : "resume")}
            className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
          >
            {t(row.hasOpen ? "manage.stop" : "manage.resume")}
          </button>
          <button
            type="button"
            data-manage-action="edit"
            onClick={() => setDialog("edit")}
            className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)]"
          >
            {t("manage.edit")}
          </button>
          <ConfirmDeleteButton
            data-manage-action="delete"
            name={row.task.name}
            description={t("manage.deleteHint")}
            errorMessage={t("manage.deleteFailed")}
            onConfirm={(confirmation) => remove(row.task.id, confirmation)}
            className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--color-missed)]"
          >
            {t("manage.delete")}
          </ConfirmDeleteButton>
        </div>

        {dialog === "stop" || dialog === "resume" ? (
          <IntervalDialog
            task={row.task}
            mode={dialog}
            today={today}
            onClose={() => setDialog(null)}
          />
        ) : dialog === "edit" ? (
          <EditTaskDialog
            task={row.task}
            today={today}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </td>
    </tr>
  );
}
