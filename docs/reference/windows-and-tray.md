# 两个窗口与托盘

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：explanation/architecture.md、reference/i18n.md、how-to/daily-use.md

---

## 1. 主窗口

| 项 | 值 |
|---|---|
| 默认尺寸 | 1080×720 |
| 最小尺寸 | 900×640 |
| 装饰 | 原生标题栏 |
| 关闭行为 | 销毁主 WebView，保留或重建挂件；再次打开时按需重建主窗 |
| 入口 | 启动时显示；托盘或单实例唤回 |

布局：左侧 200px 导航 + 右侧内容区。导航支持拖动排序、`Alt + ↑/↓`、长按显示抓取光标；顺序存 settings 表。

## 2. 悬浮挂件

| 项 | 值 |
|---|---|
| 展开尺寸 | 260×360（含 8px 透明边距） |
| 胶囊尺寸 | 96×36 |
| 装饰 | `decorations:false`、`transparent:true`、圆角 16 |
| 层级 | `alwaysOnTop` 可配置；`skipTaskbar` |
| 拖拽 | 标题区 `data-tauri-drag-region`；胶囊拖动后吸附左右边缘 |
| 关闭 | 隐藏，可从托盘唤回 |

### 2.1 展开态内容

与今日页同构：

- 标题 + 日期
- 完成率环、百分比、剩余数量（任务 + 今日到期待办）
- 自愿 / 被迫 / 待办分项
- 分组任务：已完成 / 跳过 / 漏打全部显示
- 今日到期待办：逾期在前；当天完成的保留并显示勾选，次日移除
- 三个区块组头都可整行点击折叠，折叠后保留标题与 `x / n`

标题与进度固定，中间内容滚动；滚动条 4px 半透明。

### 2.2 挂件交互

- 单击任务行：按今日页规则循环 `pending/skipped → done → missed → 清除`
- 值 chip：点击进入行内编辑，`Enter` / 失焦保存，`Esc` 取消
- 右键或 `⋯`：状态菜单（完成 / 未完成 / 跳过 / 清除）
- 点待办行：完成 / 取消完成
- 点区块组头：折叠 / 展开；折叠状态不持久化，回到胶囊再展开时全部恢复展开
- 待办标题过长或含换行时换行，不省略
- 悬停标题区：展开主窗、置顶、收起
- 无最小化按钮；隐藏挂件统一走托盘

## 3. 托盘

菜单项：

- 今日进度（只读，前端写文案；任务 + 今日到期待办的合并口径）
- 显示 / 隐藏主窗口（同一项切换）
- 显示 / 隐藏挂件（同一项切换）
- 退出

左键托盘同时显示主窗口与挂件；右键菜单可以分别显示或隐藏。关闭主窗口后挂件继续保留，只有主 WebView 被销毁。

### 3.1 语言

静态文案不写死在 Rust：

- 前端 `useTrayLabels` 在语言变化时调用 `set_tray_labels`
- Rust `TrayState` 保存当前文案，`sync_tray_labels` 根据窗口可见性选择显示/隐藏
- 进度文案由 `useTrayProgress` 通过 `set_tray_progress` 写入

详见 [国际化](i18n.md)。

## 4. 跨窗口事件

事件名与 payload 集中在 `src/shared/events.ts`：

```ts
export const Events = {
  checkinsChanged: "checkins:changed",
  tasksChanged: "tasks:changed",
  todosChanged: "todos:changed",
  settingsChanged: "settings:changed",
  widgetExpand: "widget:expand",
} as const;
```

| 事件 | payload | 发送方 | 监听方 |
|---|---|---|---|
| `checkinsChanged` | `{ date, source }` | 写打卡的窗口 | 另一窗口 |
| `tasksChanged` | `{ source }` | 主窗 | 挂件 |
| `todosChanged` | `{ source }` | 主窗/挂件 | 另一窗口 |
| `settingsChanged` | `{ source }` | 主窗 | 挂件 |
| `widgetExpand` | `{ source }` | 挂件 | 主窗 |

规则：

- payload 只做失效信号，不带全量数据
- 监听方收到后自己重查
- `source` 由窗口 label 推导，丢弃自己发出的事件
- 写库成功后再发事件

## 5. 关闭 / 隐藏 / 唤回

```text
主窗 X          → destroy WebView + 同步托盘文案
托盘切换主窗     → destroy / 按需创建 + sync
托盘切换挂件     → destroy / 按需创建 + sync
挂件展开按钮     → emit widget:expand → 创建主窗并保留挂件
托盘左键         → 同时显示主窗与挂件
单实例第二次启动 → 同时显示主窗与挂件
```
