import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState, type ReactNode } from "react";

import type { Language, Theme } from "../../../domain/types";
import { useCheckinsStore } from "../../../stores/checkinsStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTasksStore } from "../../../stores/tasksStore";
import { useTodosStore } from "../../../stores/todosStore";
import { useTransferStore } from "../../../stores/transferStore";
import { useUpdateStore } from "../../../stores/updateStore";
import { isDevBuild } from "../../../shared/env";
import { setLocale } from "../../../shared/i18n";
import { applyTheme } from "../../../ui/theme";
import { useT } from "../../../ui/useT";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]";

const THEMES: Theme[] = ["system", "light", "dark"];
const LANGUAGES: Language[] = ["system", "zh-CN", "en"];
const DAY_START_OPTIONS = Array.from({ length: 13 }, (_, hour) => hour);

export default function Settings() {
  const t = useT();
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  const [autoLaunch, setAutoLaunch] = useState(settings.autoLaunch);
  const [autoLaunchReady, setAutoLaunchReady] = useState(true);
  const exportToFile = useTransferStore((state) => state.exportToFile);
  const exporting = useTransferStore((state) => state.exporting);
  const importFromFile = useTransferStore((state) => state.importFromFile);
  const importing = useTransferStore((state) => state.importing);
  const reloadSettings = useSettingsStore((state) => state.reload);
  const reloadTasks = useTasksStore((state) => state.reload);
  const reloadCheckins = useCheckinsStore((state) => state.reload);
  const reloadTodos = useTodosStore((state) => state.reload);
  const [transferNote, setTransferNote] = useState<string | null>(null);
  const updateInfo = useUpdateStore((state) => state.available);
  const checkingUpdate = useUpdateStore((state) => state.checking);
  const installingUpdate = useUpdateStore((state) => state.installing);
  const updateChecked = useUpdateStore((state) => state.checked);
  const updateError = useUpdateStore((state) => state.error);
  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate);
  const installUpdate = useUpdateStore((state) => state.install);

  // 自启状态以系统为准：设置表只是缓存。
  useEffect(() => {
    let cancelled = false;
    void isEnabled()
      .then((enabled) => {
        if (!cancelled) {
          setAutoLaunch(enabled);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAutoLaunchReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = (next: Theme) => {
    applyTheme(next);
    void update({ theme: next }).catch((error: unknown) => {
      console.error("[settings] 保存主题失败", error);
    });
  };

  const setLanguage = (next: Language) => {
    setLocale(next);
    void update({ language: next }).catch((error: unknown) => {
      console.error("[settings] 保存语言失败", error);
    });
  };

  const toggleAutoLaunch = () => {
    const next = !autoLaunch;
    setAutoLaunch(next);
    void (async () => {
      try {
        if (next) {
          await enable();
        } else {
          await disable();
        }
        await update({ autoLaunch: next });
      } catch (error) {
        setAutoLaunch(!next);
        console.error("[settings] 切换开机自启失败", error);
      }
    })();
  };

  const onExport = () => {
    setTransferNote(null);
    void exportToFile()
      .then((path) => {
        if (path) {
          setTransferNote(t("settings.exportDone", { path }));
        }
      })
      .catch((error: unknown) => {
        console.error("[settings] 导出失败", error);
        setTransferNote(t("settings.exportFailed"));
      });
  };

  const onImport = () => {
    setTransferNote(null);
    void importFromFile()
      .then(async (result) => {
        if (!result) {
          return;
        }
        await Promise.all([
          reloadSettings(),
          reloadTasks(),
          reloadCheckins(),
          reloadTodos(),
        ]);
        setTransferNote(
          t("settings.importDone", {
            tasks: result.counts.tasks,
            checkins: result.counts.checkins,
            todos: result.counts.todos,
          }),
        );
      })
      .catch((error: unknown) => {
        console.error("[settings] 导入失败", error);
        setTransferNote(t("settings.importFailed"));
      });
  };

  return (
    <>
      <header className="flex items-baseline gap-3">
        <h1 className="m-0 text-[var(--text-lg)] font-semibold tracking-[.2px]">
          {t("settings.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {t("settings.subtitle")}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pr-1">
        <section data-settings-section="appearance" className={`${CARD} min-w-0 p-4`}>
          <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--color-text)]">
            {t("settings.section.appearance")}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-[72px] shrink-0 text-sm">
              {t("settings.theme")}
            </span>
            <div
              role="group"
              aria-label={t("settings.theme")}
              className="flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
            >
              {THEMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  data-theme-option={option}
                  aria-pressed={settings.theme === option}
                  onClick={() => setTheme(option)}
                  className={
                    settings.theme === option
                      ? "rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "rounded-[var(--radius-pill)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
                  }
                >
                  {t(
                    option === "system"
                      ? "settings.theme.system"
                      : option === "light"
                        ? "settings.theme.light"
                        : "settings.theme.dark",
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-[72px] shrink-0 text-sm">
              {t("settings.language")}
            </span>
            <div
              role="group"
              aria-label={t("settings.language")}
              className="flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
            >
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  data-language-option={option}
                  aria-pressed={settings.language === option}
                  onClick={() => setLanguage(option)}
                  className={
                    settings.language === option
                      ? "rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "rounded-[var(--radius-pill)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--state-hover)]"
                  }
                >
                  {t(
                    option === "system"
                      ? "settings.language.system"
                      : option === "zh-CN"
                        ? "settings.language.zh"
                        : "settings.language.en",
                  )}
                </button>
              ))}
            </div>
            <span className="text-[var(--text-2xs)] text-[var(--color-text-muted)]">
              {t("settings.languageHint")}
            </span>
          </div>
        </section>

        <section data-settings-section="behavior" className={`${CARD} min-w-0 p-4`}>
          <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--color-text)]">
            {t("settings.section.behavior")}
          </h2>

          <SettingRow
            label={t("settings.autoSettle")}
            hint={t("settings.autoSettleHint")}
          >
            <Switch
              setting="auto-settle"
              label={t("settings.autoSettle")}
              checked={settings.autoSettleMissed}
              onChange={(next) =>
                void update({ autoSettleMissed: next }).catch(
                  (error: unknown) => {
                    console.error("[settings] 保存自动结算失败", error);
                  },
                )
              }
            />
          </SettingRow>

          <SettingRow
            label={t("settings.dayStart")}
            hint={t("settings.dayStartHint")}
          >
            <select
              data-setting="day-start"
              aria-label={t("settings.dayStart")}
              value={settings.dayStartHour}
              onChange={(event) =>
                void update({
                  dayStartHour: Number(event.target.value),
                }).catch((error: unknown) => {
                  console.error("[settings] 保存起始时间失败", error);
                })
              }
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
            >
              {DAY_START_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </SettingRow>
        </section>

        <section data-settings-section="window" className={`${CARD} min-w-0 p-4`}>
          <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--color-text)]">
            {t("settings.section.window")}
          </h2>

          <SettingRow label={t("settings.alwaysOnTop")}>
            <Switch
              setting="always-on-top"
              label={t("settings.alwaysOnTop")}
              checked={settings.alwaysOnTop}
              onChange={(next) =>
                void update({ alwaysOnTop: next }).catch((error: unknown) => {
                  console.error("[settings] 保存置顶设置失败", error);
                })
              }
            />
          </SettingRow>

          <SettingRow
            label={t("settings.autoLaunch")}
            hint={
              autoLaunchReady
                ? t("settings.autoLaunchHint")
                : t("settings.autoLaunchUnavailable")
            }
          >
            <Switch
              setting="auto-launch"
              label={t("settings.autoLaunch")}
              checked={autoLaunch}
              disabled={!autoLaunchReady}
              onChange={toggleAutoLaunch}
            />
          </SettingRow>
        </section>

        <section data-settings-section="data" className={`${CARD} min-w-0 p-4`}>
          <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--color-text)]">
            {t("settings.section.data")}
          </h2>

          <SettingRow
            label={t("settings.export")}
            hint={t("settings.exportHint")}
          >
            <button
              type="button"
              data-export-json
              disabled={exporting}
              onClick={onExport}
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--state-hover)] disabled:opacity-40"
            >
              {t("settings.export")}
            </button>
          </SettingRow>

          <SettingRow
            label={t("settings.import")}
            hint={t("settings.importHint")}
          >
            <button
              type="button"
              data-import-json
              disabled={importing}
              onClick={onImport}
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--state-hover)] disabled:opacity-40"
            >
              {t("settings.import")}
            </button>
          </SettingRow>

          {transferNote ? (
            <p
              data-transfer-note
              className="m-0 mt-1 truncate text-[var(--text-2xs)] text-[var(--color-text-muted)]"
              title={transferNote}
            >
              {transferNote}
            </p>
          ) : null}
        </section>

        <section
          data-settings-section="update"
          className={`${CARD} col-span-2 min-w-0 p-4`}
        >
          <h2 className="m-0 mb-3 text-sm font-semibold text-[var(--color-text)]">
            {t("settings.section.update")}
          </h2>

          <SettingRow label={t("settings.currentVersion")}>
            <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
              v{__APP_VERSION__}
            </span>
          </SettingRow>

          <SettingRow
            label={t("settings.update")}
            hint={t(
              isDevBuild ? "settings.updateDevHint" : "settings.updateHint",
            )}
          >
            <button
              type="button"
              data-check-update
              disabled={isDevBuild || checkingUpdate || installingUpdate}
              onClick={() => void checkForUpdate()}
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--state-hover)] disabled:opacity-40"
            >
              {t(
                checkingUpdate ? "settings.checking" : "settings.checkUpdate",
              )}
            </button>
          </SettingRow>

          {updateInfo ? (
            <div
              data-update-available
              className="mt-1 flex items-center gap-3 rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3 py-2 text-xs"
            >
              <span>
                {t("settings.updateAvailable", {
                  version: updateInfo.version,
                })}
              </span>
              <button
                type="button"
                data-install-update
                disabled={installingUpdate}
                onClick={() => void installUpdate()}
                className="ml-auto rounded-[var(--radius-control)] bg-[var(--color-voluntary)] px-2.5 py-1 font-semibold text-white disabled:opacity-40"
              >
                {t(
                  installingUpdate
                    ? "settings.installing"
                    : "settings.installUpdate",
                )}
              </button>
            </div>
          ) : updateChecked && !updateError ? (
            <p
              data-update-latest
              className="m-0 mt-1 text-[var(--text-2xs)] text-[var(--color-text-muted)]"
            >
              {t("settings.upToDate")}
            </p>
          ) : null}

          {updateError ? (
            <p
              data-update-error
              className="m-0 mt-1 text-[var(--text-2xs)] text-[var(--color-missed)]"
            >
              {t(
                updateError === "check"
                  ? "settings.updateCheckFailed"
                  : "settings.updateInstallFailed",
              )}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <div className="flex w-[160px] shrink-0 flex-col">
        <span className="text-sm">{label}</span>
        {hint ? (
          <span className="text-[var(--text-2xs)] text-[var(--color-text-muted)]">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Switch({
  setting,
  label,
  checked,
  disabled,
  onChange,
}: {
  setting: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      data-setting={setting}
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-[var(--radius-pill)] transition-colors disabled:opacity-40 ${
        checked ? "bg-[var(--color-voluntary)]" : "bg-[var(--color-border-strong)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-[left] ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
