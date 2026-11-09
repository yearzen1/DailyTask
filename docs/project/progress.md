# DailyTask 开发进度 · v0.1.14

> 类型：项目记录
> 状态：迭代中
> 当前版本：v0.1.14
> 本轮：2026-11-09 保留桌面挂件，共 1 项，完成 **1/1**
> 相关：changelog.md、../explanation/roadmap.md

---

## 1. 完成定义

一个任务算完成，需同时满足：

1. UI 项能在 `npm run dev:app` / 安装版里点出来，并留截图；
2. 逻辑项有单测，覆盖边界与失败路径；
3. `npm run lint`、`npm run test`、`npm run typecheck`、`cargo check` 全绿；
4. 本文件对应行 `☐ → ☑`，并在行末补一句实际结果。

迁移类任务额外要求：用真实 SQLite 跑一次升级前后的读写用例，不能只跑 mock。

---

## 2. 待办清单

状态：`☐` 未开始 / `△` 进行中 / `☑` 完成

| # | 优先级 | 任务 | 验收 | 状态 |
|---|---|---|---|---|
| 1 | P0 | 编辑任务弹窗：停用日期框溢出 | 输入框收进弹窗，左右留白一致 | ☑ |
| 6 | P0 | 任务表筛选：日期占位被截断 | 完整显示 `yyyy/mm/dd` | ☑ |
| 9 | P0 | 今日页滚动带动左侧导航 | 只滚内容区，导航固定 | ☑ |
| 8 | P0 | 删除设置页底部版本行 | 设置页底部不再出现版本文字 | ☑ |
| 3 | P0 | 左 tab 栏只在长按时变手型 | 悬停箭头 / 长按手型 / 拖动抓紧 | ☑ |
| 4 | P0 | 去掉挂件右上角最小化按钮 | 展开态只剩 3 个按钮 | ☑ |
| 12 | P0 | 任务表 Shift + 滚轮横滚 | 只横滚，不缩放不竖滚 | ☑ |
| 2 | P1 | 删除每日任务 | 任务、区间、打卡一并删除，其他窗口同步 | ☑ |
| 5 | P1 | 托盘显示 / 隐藏两个窗口 | 菜单文字随可见性切换 | ☑ |
| 11 | P1 | 每日任务支持间隔天数 | 每 N 天只在周期日出现，统计口径一致 | ☑ |
| 7 | P1 | 侧栏顺序迁入 settings 表 | 升级 / 导入导出后顺序保留 | ☑ |
| 13 | P0 | 挂件任务支持打叉 / 跳过 / 清除 | 右键或 ⋯ 菜单可切换全部状态 | ☑ |
| 14 | P0 | 挂件单击循环状态 + 行内改值 | 单击完成/漏打/清除，值 chip 可编辑 | ☑ |
| 15 | P0 | 全局去掉 recorded「只记录」状态 | 旧数据迁移为 done，值不再单独成状态 | ☑ |
| 16 | P0 | 待办日期编辑 + 统一删除确认 | 日历按钮改日期；所有删除走 ConfirmDeleteButton | ☑ |
| 17 | P1 | 应用内中英文切换 | 跟随系统 / 中文 / English；托盘、日期同步 | ☑ |
| 18 | P1 | 文档分层重组 | docs/README 地图、架构/开发/运维/项目分层、链接检查 | ☑ |
| 19 | P1 | 托盘左键同时显示主窗与挂件 | 两窗一起唤回，主窗聚焦 | ☑ |
| 20 | P1 | 按 Diátaxis 重写文档 | 教程 / 指南 / 参考 / 解释四象限，README 改为落地页 | ☑ |
| 21 | P1 | 任务表格子自适应文字 | 任务名与自由值完整显示，同列同宽，超长换行，缩放保留 | ☑ |
| 22 | P0 | 今日页与挂件区块折叠 + 待办进度 | 三个组头可折叠；待办 `x / n`、黄竖条，并计入今日与托盘完成率 | ☑ |

---

## 3. 本轮已确认口径

- **#1**：只修「停用日期输入框溢出弹窗」，不额外改禁用态视觉。
- **#8**：只删设置页底部 `DailyTask v0.1.3 · 本地数据` 版本行；保留左侧导航底部的 `app.footer`。
- **#11**：间隔天数挂在区间上，以该区间启用日为第 1 天，每 N 天出现一次；`1` = 每天。
- **#7**：侧栏顺序从 localStorage 迁到 settings 表；旧 localStorage 顺序在首次启动时自动迁移。

---

## 4. 任务明细

### #1 编辑任务弹窗：停用日期框溢出

- 现象：编辑「毕设40分钟」时，右侧「停用日期」输入框和日历图标越过弹窗右边线。
- 改动：`Manage.tsx` 编辑弹窗改为带 `min-w-0` 的两列栅格并适当加宽；`DateField.tsx` 根节点补 `min-w-0`。
- 验收：弹窗左右留白一致，日期框完整收在弹窗内；补 `Manage.test.tsx` 断言。

### #6 任务表筛选：日期占位被截断

- 现象：「从 / 到」显示为 `yyyy/mm/dc`，最后一个字符被裁掉。
- 改动：`TaskGrid.tsx` 两个日期字段加 `shrink-0`，宽度由 112px 调到 124–128px；筛选行保持 `flex-wrap`。
- 验收：完整显示 `yyyy/mm/dd`；窗口变窄时整行换行，不压缩字段。

### #9 今日页滚动带动左侧导航

- 原因：`Today` 没有自己的滚动容器，内容把整页撑高，`body` 滚动时 `<aside>` 跟着走。
- 改动：`MainLayout.tsx` 外层与 `section` 加 `overflow-hidden` / `min-h-0`；`Today.tsx` 在标题下增加 `min-h-0 flex-1 overflow-y-auto` 容器，与待办页一致。
- 验收：只滚今日内容，左侧导航和底部版本号固定不动。

### #8 删除设置页底部版本行

- 改动：删除 `Settings.tsx` 底部 `settings.version` 段落；保留左侧导航的 `app.footer`。
- 验收：设置页内容底部不再出现 `DailyTask v0.1.3 · 本地数据`。

### #3 左 tab 栏光标

- 现象：平时就是手型 / 抓取光标。
- 改动：默认 `cursor-default`；按住约 300ms 后变 `cursor-grab`；真正拖动时 `cursor-grabbing`；`Alt+↑/↓` 不受影响。
- 验收：悬停是普通箭头；长按变手型；拖动时抓紧。

### #4 去掉挂件右上角最小化按钮

- 改动：删除 `WidgetAction` 的最小化按钮和 `minimize()`；隐藏挂件统一走托盘 #5。
- 验收：展开态右上角只剩「展开主窗口 / 置顶 / 收起」3 个按钮。

### #12 任务表 Shift + 滚轮横滚

- 改动：`TaskGrid.tsx` 的 wheel 监听增加 Shift 分支，`preventDefault()` 后按 `deltaY` 调用 `scrollTo(scrollLeft + delta)`；Ctrl 缩放保持不变。
- 验收：Shift + 滚轮只横滚，不缩放、不竖滚；页脚提示改为 `Ctrl + 滚轮缩放 · Shift + 滚轮横滚`。

### #2 删除每日任务

- 数据：`deleteTask` 显式删除 `checkins → task_intervals → tasks`，不依赖 SQLite 外键开关；删除后发 `tasks:changed`。
- UI：任务管理操作列加「删除」，二次确认写明「启用区间与全部打卡记录一并删除，不可恢复」；失败保留弹窗并显示错误。
- 验收：删除后任务表 / 统计 / 今日 / 挂件同步消失，重启不复活；`db/tasks.test.ts` + `Manage.test.tsx` 覆盖。

### #5 托盘显示 / 隐藏主窗口与挂件

- 改动：`lib.rs` 两个菜单项改为 toggle；文字随可见性切换「显示 / 隐藏主窗口」「显示 / 隐藏挂件」；菜单点击、窗口焦点、主窗关闭、单实例唤回后同步文案。
- 验收：右键托盘可隐藏 / 显示两个窗口，文案实时切换；左键仍唤出挂件；`cargo check` 通过。

### #11 每日任务支持间隔天数

- 数据：新增 `003_task_interval_every_days.sql`，`task_intervals.every_days INTEGER NOT NULL DEFAULT 1`；`Interval.everyDays` 接全链路（create / append / update / JSON 导入导出，旧 JSON 缺字段按 1）。
- 规则：`1` = 每天；`N` 表示以该区间 `start` 为第 1 天，每 N 天出现一次；停用后重新启用，新段继承上一段 N；非周期日不进今日、不进统计分母，任务表格子禁用。
- UI：新建 / 编辑 / 重新启用弹窗加「间隔天数」（1–365，默认 1）；任务管理表对 N > 1 显示「每 N 天」。
- 验收：每 3 天任务只在第 1/4/7… 天出现；今日进度、任务表、统计口径一致；旧数据迁移后全部按每天；真实 SQLite 迁移用例通过。

### #7 侧栏顺序迁到数据库

- 改动：`Settings` 增加 `navOrder: string[]`（默认空 = 默认顺序）；`MainLayout` 启动优先读 settings 表，localStorage 仅作首屏缓存；拖动 / Alt 调整后同时写 settings 表；导出 / 导入自动带上。
- 兼容：首次启动时若 settings 为空、localStorage 有自定义顺序，自动迁移进 settings。
- 验收：升级、重启、导出 → 导入后顺序保留；旧用户顺序不丢；`settings.test.ts` / `MainLayout.test.tsx` 覆盖。

### #13 挂件任务支持多状态

- 现象：挂件里的任务只能点成「完成」，没法打叉、跳过或清除。
- 改动：任务行右键或悬停 `⋯` 打开菜单，提供「已完成 / 未完成 / 今天不做（或取消）/ 清除」；左键仍保留「点未完成 = 完成」。
- 验收：菜单操作写库后挂件与主窗同步；`Widget.test.tsx` 覆盖打叉、跳过、清除。

### #14 挂件单击循环状态 + 行内改值

- 现象：已完成 / 已跳过的行单击没有反应；值只能看不能改。
- 改动：所有任务行单击都按今日页规则循环：未完成/跳过 → 完成 → 漏打 → 清除。值 chip 点击进入行内输入，Enter 或失焦保存、Esc 取消；点击值区域不会误触发状态循环。
- 验收：`Widget.test.tsx` 覆盖待完成、完成、漏打、跳过四种状态的单击循环，以及值的新增、修改、清空。

### #15 全局去掉 recorded「只记录」状态

- 现象：只填值不判定会显示成一个额外的 `•` 状态，容易被误认为第四种打卡。
- 改动：`CheckinStatus` 只保留 done/missed/skipped；没有判定时写值自动记为 done；清值只清 value，保留判定。新增迁移 004 把旧 `recorded` 转为 `done`，旧 JSON 导入同样归一。
- 验收：真实 SQLite 迁移保留 id/value/note；今日进度、任务表、挂件、统计、托盘分母统一为 `applicable − skipped`。

### #16 待办日期编辑 + 统一删除确认

- 现象：待办行点 ✎ 只能改名，改日期只能右键；删除按钮点一下就直接删。
- 改动：✎ 与 ✕ 之间新增日历按钮，打开现有日期菜单并自动聚焦；新增 `ConfirmDeleteButton`，把触发器、二次确认、失败提示封装在一起。删除 store 方法要求 `DeleteConfirmation` 品牌令牌，只有用户在确认框确认后组件才构造令牌。Todos 行内删除、右键菜单删除、Manage 任务删除全部复用该组件。
- 验收：日期按钮可直接改截止日期；取消确认不删除；确认后才调用 remove；失败保留弹窗并显示错误。

### #17 应用内中英文切换

- 改动：新增完整 `en` 字典；`Language` 增加 `system`，启动时按 `navigator.language` 解析，中文系统回中文、英文系统回英文。设置页外观区新增语言三档；日期格式、任务表、挂件、统计、设置页全部跟随。托盘静态菜单项通过 `set_tray_labels` 命令由前端下发，语言切换后立即刷新。
- 验收：中文 / English / 跟随系统均可切换并持久化；托盘与进度文案同步；英文下挂件宽度、任务管理表格和长文案不溢出。

### #18 文档分层重组

- 改动：新增 `docs/README.md` 文档地图与 `glossary.md`；`impl.md` 拆为 `architecture/*`；原 Requirements / TODO / progress / upgrade 移入 product / project / operations；补 development、operations、product、adr 文档；新增 `npm run docs:check` 校验必需文件、状态头和相对链接。
- 验收：docs:check 通过；README 与文档内链接全部可达；发版脚本先跑 docs:check。

### #19 托盘左键同时显示主窗与挂件

- 改动：托盘左键由只显示挂件改为 `show_both`：先显示挂件，再 show + unminimize + focus 主窗，保证主窗拿到焦点；右键单独显示/隐藏不变。
- 验收：两个窗口都能从托盘唤回；主窗聚焦；托盘文案同步。

### #20 按 Diátaxis 重写文档

- 改动：文档重组为 tutorials / how-to / reference / explanation + project；按四象限重写入口、教程、操作指南、参考与解释；根 README 改为落地页，只保留 30 秒介绍和文档路由；新增 `reference/ui-spec.md`、`reference/commands.md`、`reference/file-locations.md`。
- 验收：`docs:check` 校验类型头、状态头、必需文件和相对链接；README 中英文链接全部可达。

---

## 5. 建议顺序

1. 快速 UI：#1 #6 #9 #8 #3 #4 #12
2. 托盘开关：#5
3. 删除任务：#2
4. 间隔天数：#11（迁移 003 + 全链路）
5. 导航顺序：#7（settings 字段 + 首启迁移）
6. 回归、截图、更新 `docs/reference/*` 与 README，发 v0.1.8

---

## 6. 风险与结论

- **#11 是唯一需要数据库迁移的项**：先写 003 并跑真实 SQLite 用例，再接 UI；`everyDays` 缺失时统一按 1，保证旧库、旧 JSON 都能读。
- **#2 不能只依赖 `ON DELETE CASCADE`**：SQLite 外键默认可能关闭，删除顺序固定为 checkins → intervals → tasks。
- **#7 迁移后 localStorage 只当缓存**：settings 表是唯一事实来源；导出 / 导入自动携带侧栏顺序。
- **#5 与 #4 必须一起验收**：去掉挂件最小化后，隐藏挂件只能从托盘操作，托盘 toggle 不通会直接少一个入口。

---

## 7. 完成记录（2026-11-05）

全量校验：`npm run test` **301 passed**、`npm run lint`、`npm run typecheck`、`cargo check` 全绿。

- **#1**：编辑弹窗改为 420px 两列栅格，`DateField` 根节点补 `min-w-0`；`Manage.test` 断言日期字段收在弹窗栅格内。
- **#6**：筛选日期字段加 `shrink-0` 并加宽到 124px，占位不再被压缩。
- **#9**：`MainLayout` 外层锁定滚动；`Today` 新增独立 `overflow-y-auto` 内容区，导航不再跟着滚。
- **#8**：删除设置页底部版本行，保留左侧 `app.footer`。
- **#3**：侧栏默认箭头，按住 300ms 后变抓取手型，拖动时变抓紧；组件测试用假定时器覆盖。
- **#4**：删除挂件最小化按钮与 `minimize()`；`Widget.test` 断言按钮不存在。
- **#12**：任务表 wheel 增加 Shift 分支，只横滚不缩放；页脚提示同步更新。
- **#2**：`deleteTask` 显式删除 checkins → intervals → tasks；任务管理加二次确认删除，失败保留弹窗。
- **#5**：托盘两个菜单项改为显示/隐藏 toggle，窗口焦点与关闭时同步文案；`cargo check` 通过。
- **#11**：新增迁移 003（`every_days`），`Interval.everyDays` 接创建/追加/编辑/JSON 导入导出；今日、统计、任务表统一走 `isApplicable` 周期判定。
- **#7**：`Settings.navOrder` 存 settings 表；启动优先读库，localStorage 只作缓存，旧顺序首次启动自动迁移；导出/导入自动携带。
- **#13**：挂件任务行右键或悬停 `⋯` 打开状态菜单，可切完成 / 未完成 / 跳过 / 取消跳过 / 清除。
- **#14**：挂件所有任务行单击按今日页循环状态；值 chip 支持行内编辑，Enter / 失焦保存、Esc 取消，点击值不触发状态切换。
- **#15**：删除 recorded 状态；迁移 004 把旧 recorded 转为 done，值写入不再产生第四种状态，进度分母统一为 `applicable − skipped`。
- **#16**：待办行加日历按钮；删除统一走 `ConfirmDeleteButton`，store 删除要求确认令牌，Todos 行内/右键与 Manage 删除共用同一套二次确认。
- **#17**：新增英文词典与语言设置（跟随系统 / 中文 / English）；托盘文案通过 `set_tray_labels` 跟随语言，日期与所有视图同步。
- **#18**：文档重组为 product / architecture / development / operations / project / adr 六层，新增文档地图、术语表、ADR 与 `docs:check` 链接校验。
- **#19**：托盘左键改为同时显示主窗与挂件，主窗聚焦；文档同步更新。
- **#20**：文档按 Diátaxis 重写为四象限；根 README 改为安装 / 第一次使用 / 文档路由；`docs:check` 增加类型头校验。

未完成项：尚未运行 `npm run dev:app` / 安装版做真机截图走查；发版前需补 UI 走查与 `docs/reference/*` 设计说明更新。

---

## 8. v0.1.10 完成记录（2026-11-06）

全量校验：`npm run test` **317 passed**、`npm run lint`、`npm run typecheck`、`cargo check`、`docs:check` 全绿。

- **#21**：任务表新增文字宽度测量与列宽前缀和；任务名列 160–320px 自适应，日期列按该列最长自由值加宽，同列所有行共用列宽；超过 320px 在格内换行并自动增高行高；概览模式保持统一窄列，缩放作为最小宽度继续生效。

---

## 9. v0.1.11 完成记录（2026-11-07）

全量校验：`npm run test` **323 passed**、`npm run lint`、`npm run typecheck`、`npm run docs:check`、`npm run build` 全绿。

- **#1**：今日页与挂件中当天完成的待办保留显示（勾选 + 删除线），点击可取消完成，次日自动移除；`buildToday` 按 `completedAt` 的逻辑日过滤。
- **#2**：待办行尾日历按钮改为直接弹出日历（portal + fixed 定位，空间不足向上弹），点日期立即保存，底部保留清除；右键菜单不变。
- **#3**：待办、今日、挂件中的待办标题去掉 `truncate`，长标题与换行完整展开，行高自适应。
- **#4**：待办新增与行内重命名改为自增高 textarea，`Enter` 保存、`Shift+Enter` 换行、输入法组字不误提交。

---

## 10. v0.1.12 完成记录（2026-11-08）

全量校验：`npm run test` **329 passed**、`npm run lint`、`npm run typecheck` 全绿。

- **#22**：今日页与挂件三个组头（自愿 / 被迫 / 今日到期待办）均可整行点击折叠，`aria-expanded` 与 `▾/▸` 同步；折叠后保留标题和 `done / total`。待办组头新增 warning 黄竖条，和自愿绿、被迫蓝区分；折叠状态不持久化，挂件从胶囊展开时全部恢复展开。折叠箭头移到名称右侧并放大。
- 待办进度：`combineProgress` 把到期待办并入今日完成率；待办分母按列表行数算（含当天完成保留的行），`missed` 仍只统计任务。今日页、挂件、托盘统一口径。
- 汇总区新增「待办 x / n」；挂件统计行允许换行，避免英文标签溢出。
- debug 构建启动时自动打开 DevTools，方便排查前端初始化与 IPC 问题。
- 测试：`settle.test`、`today.test`、`useTrayProgress.test`、`Today.test`、`Widget.test` 覆盖合并口径、折叠、胶囊往返重置与黄竖条。
