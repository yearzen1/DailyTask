import { useMemo } from "react";

import { flattenTypeTree, resolveTaskTypes } from "../../../domain/taskTypes";
import type { TaskType } from "../../../domain/types";
import { useT, useLocale } from "../../../ui/useT";
import { typeDisplayName } from "../../../ui/taskType";

/** 缩进类型树选择器；任务只能属于一个类型。 */
export function TaskTypePicker({
  value,
  onChange,
  types,
  disabled,
  dataAttribute = "type",
  ariaLabel,
  excludeIds,
}: {
  value: string;
  onChange: (typeId: string) => void;
  types: readonly TaskType[];
  disabled?: boolean;
  dataAttribute?: string;
  ariaLabel?: string;
  /** 过滤掉的类型 id；用于移出任务时排除当前类型子树。 */
  excludeIds?: ReadonlySet<string>;
}) {
  const t = useT();
  const locale = useLocale();
  const options = useMemo(
    () =>
      flattenTypeTree(resolveTaskTypes(types))
        .filter((node) => !excludeIds?.has(node.type.id))
        .map((node) => ({
          id: node.type.id,
          depth: node.depth,
          label: typeDisplayName(node.type, t),
        })),
    [types, t, locale, excludeIds],
  );

  return (
    <select
      data-type-picker={dataAttribute}
      aria-label={ariaLabel ?? t("manage.field.category")}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {`${"\u3000".repeat(option.depth)}${option.label}`}
        </option>
      ))}
    </select>
  );
}
