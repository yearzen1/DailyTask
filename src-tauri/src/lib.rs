use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:dailytask.db";
const TRAY_TOGGLE_MAIN: &str = "tray:toggle-main";
const TRAY_TOGGLE_WIDGET: &str = "tray:toggle-widget";
const TRAY_PROGRESS: &str = "tray:progress";
const TRAY_QUIT: &str = "tray:quit";
const MAIN_WINDOW: &str = "main";
const WIDGET_WINDOW: &str = "widget";
const WIDGET_MENU_WINDOW: &str = "widget-menu";
const WIDGET_EXPAND_EVENT: &str = "widget:expand";
const WIDGET_MENU_ACTION_EVENT: &str = "widget:menu-action";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuPoint {
    x: f64,
    y: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WidgetMenuLabels {
    menu: String,
    copy: String,
    status: String,
    done: String,
    missed: String,
    skipped: String,
    unskip: String,
    clear: String,
    close: String,
}

/// 挂件窗口交给菜单窗口的数据：文案、当前状态和落点信息都由挂件算好，
/// 菜单窗口不读库，也不初始化 i18n。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WidgetMenuPayload {
    kind: String,
    id: String,
    name: String,
    current: Option<String>,
    theme: String,
    labels: WidgetMenuLabels,
    anchor: MenuPoint,
    widget: MenuRect,
    work_area: MenuRect,
    scale_factor: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WidgetMenuAction {
    kind: String,
    id: String,
    action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    copied: Option<bool>,
}

struct WidgetMenuState {
    payload: Mutex<Option<WidgetMenuPayload>>,
    shown: AtomicBool,
    focused: AtomicBool,
}

#[derive(Clone)]
struct TrayLabels {
    show_main: String,
    hide_main: String,
    show_widget: String,
    hide_widget: String,
    quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            show_main: "显示主窗口".to_string(),
            hide_main: "隐藏主窗口".to_string(),
            show_widget: "显示挂件".to_string(),
            hide_widget: "隐藏挂件".to_string(),
            quit: "退出".to_string(),
        }
    }
}

/// 托盘菜单项与当前语言文案；文案由前端在语言变化时下发。
struct TrayState {
    progress: MenuItem<tauri::Wry>,
    main_item: MenuItem<tauri::Wry>,
    widget_item: MenuItem<tauri::Wry>,
    quit_item: MenuItem<tauri::Wry>,
    labels: Mutex<TrayLabels>,
}

#[tauri::command]
fn set_tray_progress(
    state: tauri::State<'_, TrayState>,
    text: String,
) -> Result<(), String> {
    state.progress.set_text(text).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_tray_labels(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    show_main: String,
    hide_main: String,
    show_widget: String,
    hide_widget: String,
    quit: String,
) -> Result<(), String> {
    {
        let mut labels = state
            .labels
            .lock()
            .map_err(|_| "tray labels lock poisoned".to_string())?;
        *labels = TrayLabels {
            show_main,
            hide_main,
            show_widget,
            hide_widget,
            quit,
        };
    }
    sync_tray_labels(&app);
    Ok(())
}

fn is_visible(app: &AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// 托盘菜单复用同一项：可见时显示「隐藏」，不可见时显示「显示」。
fn sync_tray_labels(app: &AppHandle) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let labels = state
        .labels
        .lock()
        .map(|labels| labels.clone())
        .unwrap_or_default();
    let _ = state.main_item.set_text(if is_visible(app, "main") {
        labels.hide_main.as_str()
    } else {
        labels.show_main.as_str()
    });
    let _ = state.widget_item.set_text(if is_visible(app, "widget") {
        labels.hide_widget.as_str()
    } else {
        labels.show_widget.as_str()
    });
    let _ = state.quit_item.set_text(labels.quit.as_str());
}

fn show_main(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        WebviewWindowBuilder::new(
            app,
            MAIN_WINDOW,
            WebviewUrl::App("index.html".into()),
        )
        .title("DailyTask")
        .inner_size(1080.0, 720.0)
        .min_inner_size(900.0, 640.0)
        .center()
        .build()
        .map_err(|error| error.to_string())?;
    }
    sync_tray_labels(app);
    Ok(())
}

fn show_widget(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WIDGET_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        WebviewWindowBuilder::new(
            app,
            WIDGET_WINDOW,
            WebviewUrl::App("index.html?window=widget".into()),
        )
        .title("DailyTask 挂件")
        .inner_size(96.0, 36.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|error| error.to_string())?;
    }
    sync_tray_labels(app);
    Ok(())
}

fn destroy_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
    }
}

/// 胶囊右键「隐藏挂件」：与托盘隐藏走同一条销毁路径，并同步托盘文案。
#[tauri::command]
fn hide_widget(app: AppHandle) -> Result<(), String> {
    destroy_window(&app, WIDGET_WINDOW);
    destroy_window(&app, WIDGET_MENU_WINDOW);
    sync_tray_labels(&app);
    Ok(())
}

/// 打开挂件右键菜单：建一个独立透明窗口承载菜单。
/// 必须用 async：同步命令跑在主线程上，`build()` 会等主线程处理窗口创建而死锁。
#[tauri::command]
async fn open_widget_menu(
    app: AppHandle,
    state: tauri::State<'_, WidgetMenuState>,
    payload: WidgetMenuPayload,
) -> Result<(), String> {
    destroy_window(&app, WIDGET_MENU_WINDOW);
    state.shown.store(false, Ordering::SeqCst);
    state.focused.store(false, Ordering::SeqCst);

    let widget_position = app
        .get_webview_window(WIDGET_WINDOW)
        .and_then(|window| window.outer_position().ok());

    *state
        .payload
        .lock()
        .map_err(|_| "widget menu payload lock poisoned".to_string())? = Some(payload);

    let window = WebviewWindowBuilder::new(
        &app,
        WIDGET_MENU_WINDOW,
        WebviewUrl::App("index.html?window=widget-menu".into()),
    )
    .title("DailyTask 菜单")
    .inner_size(220.0, 260.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .focused(true)
    .build()
    .map_err(|error| {
        eprintln!("[widget-menu] build failed: {error}");
        error.to_string()
    })?;

    // 先落在挂件所在显示器上，保证 DPI 与挂件窗口一致。
    if let Some(position) = widget_position {
        let _ = window.set_position(position);
    }

    Ok(())
}

/// 菜单窗口测完自身尺寸后回报物理像素矩形，这里只负责摆好并显示。
#[tauri::command]
fn place_widget_menu(
    app: AppHandle,
    state: tauri::State<'_, WidgetMenuState>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let window = app
        .get_webview_window(WIDGET_MENU_WINDOW)
        .ok_or_else(|| "widget menu window missing".to_string())?;
    window
        .set_size(PhysicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    state.shown.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn read_widget_menu(
    state: tauri::State<'_, WidgetMenuState>,
) -> Option<WidgetMenuPayload> {
    state
        .payload
        .lock()
        .ok()
        .and_then(|payload| payload.clone())
}

#[tauri::command]
fn close_widget_menu(app: AppHandle, state: tauri::State<'_, WidgetMenuState>) {
    state.shown.store(false, Ordering::SeqCst);
    destroy_window(&app, WIDGET_MENU_WINDOW);
}

/// 菜单点完一项：先把动作转发给挂件窗口，再销毁菜单窗口。
#[tauri::command]
fn widget_menu_action(
    app: AppHandle,
    state: tauri::State<'_, WidgetMenuState>,
    action: WidgetMenuAction,
) -> Result<(), String> {
    let emitted = app
        .emit_to(WIDGET_WINDOW, WIDGET_MENU_ACTION_EVENT, action)
        .map_err(|error| error.to_string());
    state.shown.store(false, Ordering::SeqCst);
    destroy_window(&app, WIDGET_MENU_WINDOW);
    emitted
}

/// 显示主窗口时保留挂件，避免桌面快捷入口消失。
fn activate_main(app: &AppHandle) {
    if let Err(error) = show_main(app) {
        eprintln!("failed to show main window: {error}");
        return;
    }
    sync_tray_labels(app);
}

fn activate_widget(app: &AppHandle) {
    if let Err(error) = show_widget(app) {
        eprintln!("failed to show widget window: {error}");
        return;
    }
    sync_tray_labels(app);
}

fn show_both(app: &AppHandle) {
    activate_widget(app);
    activate_main(app);
}

fn toggle_main(app: &AppHandle) {
    if app.get_webview_window(MAIN_WINDOW).is_some() {
        if is_visible(app, MAIN_WINDOW) {
            destroy_window(app, MAIN_WINDOW);
        } else {
            activate_main(app);
        }
    } else {
        activate_main(app);
    }
    sync_tray_labels(app);
}

fn toggle_widget(app: &AppHandle) {
    if app.get_webview_window(WIDGET_WINDOW).is_some() {
        if is_visible(app, WIDGET_WINDOW) {
            destroy_window(app, WIDGET_WINDOW);
        } else {
            activate_widget(app);
        }
    } else {
        activate_widget(app);
    }
    sync_tray_labels(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "checkin value",
            sql: include_str!("../migrations/002_checkin_value.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "task interval every days",
            sql: include_str!("../migrations/003_task_interval_every_days.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "drop recorded status",
            sql: include_str!("../migrations/004_drop_recorded_status.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "task name periods",
            sql: include_str!("../migrations/005_task_name_periods.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "task types",
            sql: include_str!("../migrations/006_task_types.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        // 必须最先注册：第二个实例在这里直接退出并把主窗唤回。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_both(app);
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            app.listen(WIDGET_EXPAND_EVENT, move |_| {
                show_both(&app_handle);
            });

            let progress_item = MenuItem::with_id(
                app,
                TRAY_PROGRESS,
                "今日进度 —",
                false,
                None::<&str>,
            )?;
            let show_main_item = MenuItem::with_id(
                app,
                TRAY_TOGGLE_MAIN,
                "隐藏主窗口",
                true,
                None::<&str>,
            )?;
            let show_widget_item = MenuItem::with_id(
                app,
                TRAY_TOGGLE_WIDGET,
                "隐藏挂件",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, TRAY_QUIT, "退出", true, None::<&str>)?;
            let separator_a = PredefinedMenuItem::separator(app)?;
            let separator_b = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &progress_item,
                    &separator_a,
                    &show_main_item,
                    &show_widget_item,
                    &separator_b,
                    &quit_item,
                ],
            )?;

            app.manage(TrayState {
                progress: progress_item,
                main_item: show_main_item,
                widget_item: show_widget_item,
                quit_item,
                labels: Mutex::new(TrayLabels::default()),
            });

            app.manage(WidgetMenuState {
                payload: Mutex::new(None),
                shown: AtomicBool::new(false),
                focused: AtomicBool::new(false),
            });

            if let Some(icon) = app.default_window_icon().cloned() {
                // dev 配置把 productName 改成 “DailyTask Dev”，托盘提示也随之区分。
                let product = app
                    .config()
                    .product_name
                    .clone()
                    .unwrap_or_else(|| "DailyTask".to_string());
                TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip(&product)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        TRAY_TOGGLE_MAIN => toggle_main(app),
                        TRAY_TOGGLE_WIDGET => toggle_widget(app),
                        TRAY_QUIT => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_both(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            // 仅在 debug 构建自动打开 DevTools，方便排查前端初始化与 IPC 问题。
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_tray_progress,
            set_tray_labels,
            hide_widget,
            open_widget_menu,
            place_widget_menu,
            read_widget_menu,
            close_widget_menu,
            widget_menu_action
        ])
        // 主窗关闭后销毁较大的主 WebView，但保留（或重建）桌面挂件。
        .on_window_event(|window, event| {
            // 菜单窗口失焦即关闭：点桌面、点别的窗口都算。
            if window.label() == WIDGET_MENU_WINDOW {
                if let Some(state) = window.try_state::<WidgetMenuState>() {
                    match event {
                        tauri::WindowEvent::Focused(true) => {
                            state.focused.store(true, Ordering::SeqCst);
                        }
                        tauri::WindowEvent::Focused(false) => {
                            // 有些场景窗口拿不到前台焦点，别把刚弹出的菜单直接关掉。
                            let focused_before =
                                state.focused.swap(false, Ordering::SeqCst);
                            if state.shown.load(Ordering::SeqCst) && focused_before {
                                state.shown.store(false, Ordering::SeqCst);
                                destroy_window(window.app_handle(), WIDGET_MENU_WINDOW);
                            }
                        }
                        _ => {}
                    }
                }
            }
            // 挂件被销毁时菜单不能留在桌面上。
            if window.label() == WIDGET_WINDOW
                && matches!(event, tauri::WindowEvent::Destroyed)
            {
                destroy_window(window.app_handle(), WIDGET_MENU_WINDOW);
            }
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                sync_tray_labels(window.app_handle());
            }
            if window.label() == MAIN_WINDOW {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.destroy();
                    activate_widget(window.app_handle());
                    sync_tray_labels(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 等静态主窗口初始化完成后再创建第二个 WebView，避免 WebView2
            // 环境仍在占用时并发初始化导致启动失败。
            if matches!(event, tauri::RunEvent::Ready) {
                activate_widget(app);
            }

            // 销毁最后一个 WebView 时保留原生托盘进程；只有托盘“退出”等
            // 显式 app.exit(code) 才带退出码并真正结束进程。
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
