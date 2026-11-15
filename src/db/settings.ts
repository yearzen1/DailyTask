import {
  DEFAULT_SETTINGS,
  type Language,
  type Settings,
  type Theme,
} from "../domain/types";
import { sanitizeManageColumnWidths } from "../domain/manageColumns";
import type { SqlDatabase } from "./client";

interface SettingRow {
  key: string;
  value: string;
}

const THEMES: Theme[] = ["light", "dark", "system"];
const LANGUAGES: Language[] = ["system", "zh-CN", "en"];
const GRID_ZOOM_MIN = 14;
const GRID_ZOOM_MAX = 44;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 逐字段校验；坏值回退默认值，不让一条脏数据拖垮启动。 */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const theme = raw.theme;
  const language = raw.language;
  const gridZoom = raw.gridZoom;
  const dayStartHour = raw.dayStartHour;

  return {
    theme:
      typeof theme === "string" && THEMES.includes(theme as Theme)
        ? (theme as Theme)
        : DEFAULT_SETTINGS.theme,
    language:
      typeof language === "string" && LANGUAGES.includes(language as Language)
        ? (language as Language)
        : DEFAULT_SETTINGS.language,
    gridZoom:
      typeof gridZoom === "number" && Number.isFinite(gridZoom)
        ? clamp(gridZoom, GRID_ZOOM_MIN, GRID_ZOOM_MAX)
        : DEFAULT_SETTINGS.gridZoom,
    autoSettleMissed:
      typeof raw.autoSettleMissed === "boolean"
        ? raw.autoSettleMissed
        : DEFAULT_SETTINGS.autoSettleMissed,
    dayStartHour:
      typeof dayStartHour === "number" &&
      Number.isInteger(dayStartHour) &&
      dayStartHour >= 0 &&
      dayStartHour <= 23
        ? dayStartHour
        : DEFAULT_SETTINGS.dayStartHour,
    alwaysOnTop:
      typeof raw.alwaysOnTop === "boolean"
        ? raw.alwaysOnTop
        : DEFAULT_SETTINGS.alwaysOnTop,
    autoLaunch:
      typeof raw.autoLaunch === "boolean"
        ? raw.autoLaunch
        : DEFAULT_SETTINGS.autoLaunch,
    navOrder:
      Array.isArray(raw.navOrder) &&
      raw.navOrder.every((item) => typeof item === "string")
        ? (raw.navOrder as string[])
        : DEFAULT_SETTINGS.navOrder,
    manageColumnWidths: sanitizeManageColumnWidths(raw.manageColumnWidths),
  };
}

export async function getSettings(db: SqlDatabase): Promise<Settings> {
  const rows = await db.select<SettingRow[]>(
    "SELECT key, value FROM settings",
  );

  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      // 单条坏 JSON 忽略，其余仍生效。
    }
  }
  return sanitizeSettings(raw);
}

export async function setSetting<K extends keyof Settings>(
  db: SqlDatabase,
  key: K,
  value: Settings[K],
): Promise<void> {
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

export async function setSettings(
  db: SqlDatabase,
  patch: Partial<Settings>,
): Promise<void> {
  for (const [key, value] of Object.entries(patch) as [
    keyof Settings,
    Settings[keyof Settings],
  ][]) {
    await setSetting(db, key, value);
  }
}
