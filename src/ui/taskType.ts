import type { MessageKey } from "../shared/i18n";
import type { TaskType, TaskTypeColor } from "../domain/types";

export const TYPE_COLORS: TaskTypeColor[] = [
  "green",
  "blue",
  "purple",
  "orange",
  "red",
  "teal",
  "pink",
  "gray",
];

const COLOR_VARS: Record<TaskTypeColor, string> = {
  green: "var(--type-color-green)",
  blue: "var(--type-color-blue)",
  purple: "var(--type-color-purple)",
  orange: "var(--type-color-orange)",
  red: "var(--type-color-red)",
  teal: "var(--type-color-teal)",
  pink: "var(--type-color-pink)",
  gray: "var(--type-color-gray)",
};

/** 内置类型固定用现有语义色，自定义类型用调色板。 */
export function typeColorVar(type: TaskType | null): string {
  if (type?.systemKey === "voluntary") {
    return "var(--color-voluntary)";
  }
  if (type?.systemKey === "forced") {
    return "var(--color-forced)";
  }
  return typeColorVarForKey(type?.color ?? null);
}

export function typeColorVarForKey(color: TaskTypeColor | null): string {
  return COLOR_VARS[color ?? "teal"];
}

const NAME_KEYS: Record<"voluntary" | "forced", MessageKey> = {
  voluntary: "type.name.voluntary",
  forced: "type.name.forced",
};

/**
 * 内置类型未改名时返回 null，让调用方决定用哪种翻译；
 * 改名后或自定义类型返回存储的名字。
 */
export function typeName(type: TaskType): string | null {
  return type.name?.trim() ? type.name.trim() : null;
}

export function typeDisplayName(
  type: TaskType,
  translate: (key: MessageKey) => string,
): string {
  const custom = typeName(type);
  if (custom !== null) {
    return custom;
  }
  return type.systemKey ? translate(NAME_KEYS[type.systemKey]) : "—";
}

/** 新类型按创建顺序轮换颜色，避免全是同一种颜色。 */
export function nextTypeColor(count: number): TaskTypeColor {
  return TYPE_COLORS[count % TYPE_COLORS.length];
}
