import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { dateLocale, getLocale } from "../shared/i18n";
import { useT } from "./useT";

const ISO = "yyyy-MM-dd";

/** 接受 yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd，返回规范 ISO；非法返回 null。 */
export function parseDateText(raw: string): string | null {
  const match = raw
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) {
    return null;
  }
  const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = parseISO(iso);
  return isValid(date) && format(date, ISO) === iso ? iso : null;
}

export interface DateFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  value: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
  /** 弹层对齐方向，默认左对齐；靠近右边界时传 right。 */
  align?: "left" | "right";
  /**
   * field = 输入框 + 日历按钮（默认）；
   * icon = 只渲染日历按钮，点按钮直接弹日历，适合列表行内改日期。
   */
  variant?: "field" | "icon";
}

/**
 * 自研日期字段：输入框 + 日历弹层。
 * 弹层是应用内 DOM，滚轮切月时左上角年月会实时更新（原生 input[type=date] 做不到）。
 */
export function DateField({
  value,
  onChange,
  allowClear = false,
  align = "left",
  variant = "field",
  className,
  ...inputProps
}: DateFieldProps) {
  const t = useT();
  const locale = dateLocale(getLocale());
  const [draft, setDraft] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    startOfMonth(value ? parseISO(value) : new Date()),
  );
  const [alignRight, setAlignRight] = useState(align === "right");
  const [popPosition, setPopPosition] = useState({ left: 0, top: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const wheelAccum = useRef(0);

  // 外部值变化时同步输入框，但不要覆盖用户正在输入的等价文本。
  useEffect(() => {
    setDraft((current) =>
      parseDateText(current) === (value ?? null) ? current : (value ?? ""),
    );
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !popRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    // 图标弹层是 fixed 定位：列表滚动或窗口尺寸变化后位置会失真，直接关掉。
    const onScroll = () => setOpen(false);
    if (variant === "icon") {
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, variant]);

  // 图标模式的弹层挂在 body 上：按按钮位置 fixed 定位，空间不足时向上弹。
  useLayoutEffect(() => {
    if (!open || variant !== "icon" || !popRef.current) {
      return;
    }
    const rect = anchorRect.current ?? rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const width = 248;
    const margin = 8;
    const height = popRef.current.offsetHeight || 280;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(rect.right - width, margin), maxLeft);
    const top =
      rect.bottom + height + margin > window.innerHeight
        ? Math.max(margin, rect.top - height - 4)
        : rect.bottom + 4;
    setPopPosition((current) =>
      current.left === left && current.top === top
        ? current
        : { left, top },
    );
  }, [open, variant]);

  // 滚轮切月：必须用原生非 passive 监听，React 的 onWheel 拦不住页面滚动。
  useEffect(() => {
    const element = popRef.current;
    if (!open || !element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      wheelAccum.current += event.deltaY;
      if (Math.abs(wheelAccum.current) < 80) {
        return;
      }
      const direction = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      setMonth((current) => addMonths(current, direction));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [open]);

  useEffect(() => {
    if (open) {
      popRef.current?.focus();
    }
  }, [open]);

  const toggleOpen = () => {
    if (!open) {
      const rect = rootRef.current?.getBoundingClientRect();
      anchorRect.current = rect ?? null;
      if (rect) {
        if (variant === "icon") {
          const width = 248;
          const margin = 8;
          setPopPosition({
            left: Math.min(
              Math.max(rect.right - width, margin),
              Math.max(margin, window.innerWidth - width - margin),
            ),
            top: rect.bottom + 4,
          });
        } else {
          setAlignRight(
            align === "right" || rect.left + 260 > window.innerWidth - 8,
          );
        }
      }
      setMonth(startOfMonth(value ? parseISO(value) : new Date()));
    }
    setOpen((current) => !current);
  };

  const handleText = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = parseDateText(raw);
    if (parsed && parsed !== value) {
      onChange(parsed);
      setMonth(startOfMonth(parseISO(parsed)));
    }
  };

  const commitText = () => {
    if (draft.trim() === "") {
      setDraft(value ?? "");
      return;
    }
    const parsed = parseDateText(draft);
    setDraft(parsed ?? (value ?? ""));
    if (!parsed) {
      return;
    }
    if (parsed !== value) {
      onChange(parsed);
    }
  };

  const pick = (date: Date) => {
    onChange(format(date, ISO));
    setMonth(startOfMonth(date));
    setDraft(format(date, ISO));
    setOpen(false);
  };

  const minDate = inputProps.min ? parseISO(String(inputProps.min)) : null;
  const maxDate = inputProps.max ? parseISO(String(inputProps.max)) : null;
  const isDisabledDay = (date: Date) =>
    Boolean(
      (minDate && date < minDate) || (maxDate && date > maxDate),
    );

  const weekStart = startOfWeek(new Date(), { locale });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    format(addDays(weekStart, index), "EEEEE", { locale }),
  );
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { locale }),
    end: endOfWeek(endOfMonth(month), { locale }),
  });
  const today = new Date();

  const handlePopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      setMonth((current) =>
        addMonths(current, event.key === "PageUp" ? -1 : 1),
      );
    }
  };

  const calendarGlyph = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );

  const triggerLabel = inputProps["aria-label"] ?? t("date.calendar");
  const dataProps =
    variant === "icon"
      ? Object.fromEntries(
          Object.entries(inputProps).filter(([key]) => key.startsWith("data-")),
        )
      : undefined;

  const panel = (
    <div
      ref={popRef}
      role="dialog"
      aria-label={t("date.calendar")}
      tabIndex={-1}
      onKeyDown={handlePopoverKeyDown}
      style={
        variant === "icon"
          ? { left: popPosition.left, top: popPosition.top }
          : undefined
      }
      className={`z-50 w-[248px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-popover)] outline-none ${
        variant === "icon"
          ? "fixed"
          : `absolute top-full mt-1 ${alignRight ? "right-0" : "left-0"}`
      }`}
    >
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          aria-label={t("date.prevMonth")}
          onClick={() => setMonth((current) => addMonths(current, -1))}
          className="grid size-6 place-items-center rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
        >
          ‹
        </button>
        <span className="flex-1 text-center text-xs font-semibold tabular-nums">
          {t("date.month", {
            year: month.getFullYear(),
            month: month.getMonth() + 1,
          })}
        </span>
        <button
          type="button"
          aria-label={t("date.nextMonth")}
          onClick={() => setMonth((current) => addMonths(current, 1))}
          className="grid size-6 place-items-center rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[10px] text-[var(--color-text-muted)]">
        {weekDays.map((day, index) => (
          <span key={`${day}-${index}`} className="py-0.5">
            {day}
          </span>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-px">
        {days.map((date) => {
          const iso = format(date, ISO);
          const outside = date.getMonth() !== month.getMonth();
          const selected = value === iso;
          const isToday = isSameDay(date, today);
          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              disabled={isDisabledDay(date)}
              aria-pressed={selected}
              onClick={() => pick(date)}
              className={`grid h-7 place-items-center rounded-[var(--radius-control)] text-[11px] tabular-nums ${
                selected
                  ? "bg-[var(--color-voluntary)] font-semibold text-white"
                  : isToday
                    ? "ring-1 ring-inset ring-[var(--color-voluntary)] hover:bg-[var(--state-hover)]"
                    : "hover:bg-[var(--state-hover)]"
              } ${outside && !selected ? "text-[var(--color-text-muted)] opacity-60" : ""} disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-end gap-1">
        {allowClear ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setDraft("");
              setOpen(false);
            }}
            className="rounded-[var(--radius-control)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
          >
            {t("date.clear")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => pick(today)}
          className="rounded-[var(--radius-control)] px-2 py-1 text-[11px] font-semibold text-[var(--color-voluntary)] hover:bg-[var(--state-hover)]"
        >
          {t("date.today")}
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-date-field
      className={`relative flex min-w-0 items-center ${className ?? ""}`}
    >
      {variant === "icon" ? (
        <button
          type="button"
          {...dataProps}
          aria-label={triggerLabel}
          aria-expanded={open}
          disabled={inputProps.disabled}
          onClick={toggleOpen}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:bg-[var(--state-active)] disabled:opacity-40"
        >
          {calendarGlyph}
        </button>
      ) : (
        <>
          <input
            {...inputProps}
            type="text"
            inputMode="numeric"
            value={draft}
            placeholder={t("date.placeholder")}
            onChange={(event) => handleText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitText();
                setOpen(false);
              }
              if (event.key === "Escape") {
                setDraft(value ?? "");
                setOpen(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-[var(--color-text-muted)]"
          />
          <button
            type="button"
            aria-label={t("date.calendar")}
            aria-expanded={open}
            disabled={inputProps.disabled}
            onClick={toggleOpen}
            className="grid size-5 shrink-0 place-items-center rounded-[3px] text-[var(--color-text-muted)] hover:bg-[var(--state-hover)] disabled:opacity-40"
          >
            {calendarGlyph}
          </button>
        </>
      )}

      {open
        ? variant === "icon"
          ? createPortal(panel, document.body)
          : panel
        : null}
    </div>
  );
}
