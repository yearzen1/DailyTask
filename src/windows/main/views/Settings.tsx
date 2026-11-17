import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { clsx } from "clsx";
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
import { Icon, type IconName } from "../../../ui/Icon";
import { useT } from "../../../ui/useT";

const CARD =
  "min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";

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
      <header className="flex min-h-10 flex-none items-center gap-2.5">
        <h1 className="m-0 text-lg font-semibold leading-tight tracking-[-.01em]">
          {t("settings.title")}
        </h1>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {t("settings.subtitle")}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
          <i className="size-1.5 rounded-full bg-[var(--color-voluntary)]" />
          {t("settings.autosave")}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 items-start gap-3">
          <div className="flex flex-col gap-3">
            <section data-settings-section="appearance" className={CARD}>
              <CardHead icon="sun" title={t("settings.section.appearance")} />

              <div className="mt-1 divide-y divide-[var(--color-divider)]">
                <div className="py-2.5">
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {t("settings.theme")}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {t("settings.themeHint")}
                  </div>
                  <div
                    role="group"
                    aria-label={t("settings.theme")}
                    className="mt-2.5 grid grid-cols-3 gap-2"
                  >
                    {THEMES.map((option) => {
                      const active = settings.theme === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          data-theme-option={option}
                          aria-pressed={active}
                          onClick={() => setTheme(option)}
                          className={clsx(
                            "flex flex-col gap-1.5 rounded-[var(--radius-control)] border p-1.5 text-left",
                            active
                              ? "border-[var(--color-voluntary)] bg-[var(--state-selected)] shadow-[inset_0_0_0_1px_var(--color-voluntary)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--state-hover)]",
                          )}
                        >
                          <span
                            data-theme-preview
                            aria-hidden="true"
                            className={clsx(
                              "theme-preview",
                              `theme-preview--${option}`,
                            )}
                          />
                          <span
                            className={clsx(
                              "flex items-center gap-1 px-0.5 text-xs",
                              active
                                ? "font-semibold text-[var(--color-voluntary)]"
                                : "text-[var(--color-text-secondary)]",
                            )}
                          >
                            {t(
                              option === "system"
                                ? "settings.theme.system"
                                : option === "light"
                                  ? "settings.theme.light"
                                  : "settings.theme.dark",
                            )}
                            {active ? (
                              <Icon
                                name="check"
                                className="ml-auto size-3 text-[var(--color-voluntary)]"
                              />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--color-text)]">
                      {t("settings.language")}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      {t("settings.languageHint")}
                    </div>
                  </div>
                  <div
                    role="group"
                    aria-label={t("settings.language")}
                    className="flex shrink-0 gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5"
                  >
                    {LANGUAGES.map((option) => {
                      const active = settings.language === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          data-language-option={option}
                          aria-pressed={active}
                          onClick={() => setLanguage(option)}
                          className={clsx(
                            "rounded-[var(--radius-pill)] px-2.5 py-1 text-xs",
                            active
                              ? "bg-[var(--color-surface)] font-semibold text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                              : "text-[var(--color-text-tertiary)] hover:bg-[var(--state-hover)]",
                          )}
                        >
                          {t(
                            option === "system"
                              ? "settings.language.system"
                              : option === "zh-CN"
                                ? "settings.language.zh"
                                : "settings.language.en",
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <section data-settings-section="window" className={CARD}>
              <CardHead icon="window" title={t("settings.section.window")} />

              <div className="mt-1 divide-y divide-[var(--color-divider)]">
                <SettingRow label={t("settings.alwaysOnTop")}>
                  <Switch
                    setting="always-on-top"
                    label={t("settings.alwaysOnTop")}
                    checked={settings.alwaysOnTop}
                    onChange={(next) =>
                      void update({ alwaysOnTop: next }).catch(
                        (error: unknown) => {
                          console.error("[settings] 保存置顶设置失败", error);
                        },
                      )
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
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3">
            <section data-settings-section="behavior" className={CARD}>
              <CardHead
                icon="sliders"
                title={t("settings.section.behavior")}
              />

              <div className="mt-1 divide-y divide-[var(--color-divider)]">
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
                    className="h-8 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
                  >
                    {DAY_START_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </div>
            </section>

            <section data-settings-section="data" className={CARD}>
              <CardHead icon="database" title={t("settings.section.data")} />

              <div className="mt-1 divide-y divide-[var(--color-divider)]">
                <SettingRow
                  label={t("settings.export")}
                  hint={t("settings.exportHint")}
                >
                  <button
                    type="button"
                    data-export-json
                    disabled={exporting}
                    onClick={onExport}
                    className="h-8 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)] disabled:opacity-40"
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
                    className="h-8 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)] disabled:opacity-40"
                  >
                    {t("settings.import")}
                  </button>
                </SettingRow>
              </div>

              {transferNote ? (
                <p
                  data-transfer-note
                  className="m-0 mt-2 truncate border-t border-[var(--color-divider)] pt-2 text-xs text-[var(--color-text-tertiary)]"
                  title={transferNote}
                >
                  {transferNote}
                </p>
              ) : null}
            </section>

            <section data-settings-section="update" className={CARD}>
              <CardHead
                icon="refresh"
                title={t("settings.section.update")}
                badge={
                  updateInfo ? t("settings.updateBadge") : undefined
                }
              />

              <div className="mt-1">
                <div className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--color-text-tertiary)]">
                      {t("settings.currentVersion")}{" "}
                      <b className="text-sm font-semibold tabular-nums text-[var(--color-text)]">
                        v{__APP_VERSION__}
                      </b>
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      {t(
                        isDevBuild
                          ? "settings.updateDevHint"
                          : "settings.updateHint",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-check-update
                    disabled={isDevBuild || checkingUpdate || installingUpdate}
                    onClick={() => void checkForUpdate()}
                    className="h-8 shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)] disabled:opacity-40"
                  >
                    {t(
                      checkingUpdate
                        ? "settings.checking"
                        : "settings.checkUpdate",
                    )}
                  </button>
                </div>

                {updateInfo ? (
                  <div
                    data-update-available
                    className="mt-1 flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-text)]">
                      {t("settings.updateAvailable", {
                        version: updateInfo.version,
                      })}
                    </span>
                    <button
                      type="button"
                      data-install-update
                      disabled={installingUpdate}
                      onClick={() => void installUpdate()}
                      className="h-7 shrink-0 rounded-[var(--radius-control)] bg-[var(--color-green-solid)] px-2.5 text-xs font-semibold text-[var(--color-on-green)] disabled:opacity-40"
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
                    className="m-0 mt-1 text-xs text-[var(--color-text-tertiary)]"
                  >
                    {t("settings.upToDate")}
                  </p>
                ) : null}

                {updateError ? (
                  <p
                    data-update-error
                    className="m-0 mt-1 text-xs text-[var(--color-missed)]"
                  >
                    {t(
                      updateError === "check"
                        ? "settings.updateCheckFailed"
                        : "settings.updateInstallFailed",
                    )}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function CardHead({
  icon,
  title,
  badge,
}: {
  icon: IconName;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]">
        <Icon name={icon} className="size-3.5" />
      </span>
      <h2 className="m-0 text-sm font-semibold text-[var(--color-text)]">
        {title}
      </h2>
      {badge ? (
        <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-warning)_13%,transparent)] px-2 text-[10px] font-semibold text-[var(--color-warning)]">
          {badge}
        </span>
      ) : null}
    </div>
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
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-text)]">
          {label}
        </div>
        {hint ? (
          <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {hint}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
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
  onChange: (checked: boolean) => void;
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
