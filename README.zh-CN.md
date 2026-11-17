# DailyTask

[English](./README.md) | [简体中文](./README.zh-CN.md)

本地优先的每日任务打卡与待办桌面应用，用来替代「每改一次习惯就复制一张 Excel 表头」的流程。
只支持 Windows，提供基于区间的任务、悬浮挂件和表格型任务网格。

<a id="what-it-does"></a>
## 功能

- **每日打卡** —— 完成 / 未完成 / 今天不做，可附加自由值。
- **启用区间** —— 停用、重新启用只追加区间，不改历史；支持每 N 天。
- **今日** —— 进度环、按类型树分组、到期待办。
- **挂件** —— 置顶卡片，与主窗同色板；单击循环状态。
- **任务表** —— 日期做列、冻结表头、键盘导航、类型分组折叠、筛选、缩放。
- **任务类型** —— 自建可嵌套类型；自愿/被迫是两个内置默认类型。
- **待办** —— 逾期 / 今天 / 本周 / 以后，可改日期、删除带二次确认。
- **统计** —— 单任务连续天数与近 30 天完成率。
- **本地优先** —— SQLite 落盘，无账号、无云同步；更新来自 GitHub Releases 且签名。

<a id="install"></a>
## 安装

1. 打开 [GitHub Releases](https://github.com/yearzen1/DailyTask/releases/latest)。
2. 下载 `DailyTask_x.y.z_x64-setup.exe`。
3. 当前用户安装并启动。

支持应用内签名更新；见 [升级与回退](docs/how-to/upgrade-and-rollback.md)。

<a id="first-run"></a>
## 第一次使用

1. 在「任务管理」新建任务。
2. 在「今日」打勾。
3. 在「待办」新增一条待办。

完整步骤：[第一次使用教程](docs/tutorials/first-run.md)。

<a id="docs"></a>
## 文档

从[文档地图](docs/README.md)进入。

- **想学** —— [第一次使用](docs/tutorials/first-run.md) · [本地开发](docs/tutorials/local-development.md)
- **想做** —— [日常使用](docs/how-to/daily-use.md) · [管理任务](docs/how-to/manage-tasks.md) · [备份](docs/how-to/backup-and-restore.md) · [发版](docs/how-to/release.md)
- **想查** —— [打卡规则](docs/reference/checkins.md) · [数据模型](docs/reference/data-model.md) · [命令](docs/reference/commands.md) · [术语表](docs/reference/glossary.md)
- **想懂** —— [产品决策](docs/explanation/product-decisions.md) · [架构](docs/explanation/architecture.md) · [ADR](docs/explanation/adr/0001-tauri-sqlite-react.md)

<a id="development"></a>
## 开发

```bash
npm install
npm run dev:app
npm test
```

开发版使用 `com.dailytask.app.dev` 和独立数据目录。完整说明：
[本地开发](docs/tutorials/local-development.md)。

<a id="data"></a>
## 数据

- 数据库：`%APPDATA%\com.dailytask.app\dailytask.db`
- 备份：`%APPDATA%\com.dailytask.app\backup\`
- 导出 / 导入：设置页 JSON v1

<a id="license"></a>
## 许可证

[MIT](./LICENSE) © 2026 DailyTask contributors
