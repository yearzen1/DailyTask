# DailyTask 文档

> 类型：入口
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：../README.md、reference/glossary.md

本目录按 **Diátaxis** 组织：每篇文档只服务一种需求。

---

## 我想……

### 学：第一次用 / 第一次开发

- [第一次使用](tutorials/first-run.md) —— 从安装到建任务、打卡、建待办、看统计。
- [本地开发](tutorials/local-development.md) —— 从零跑起开发环境。

### 做：完成一个具体任务

- [日常使用](how-to/daily-use.md) —— 今日页与挂件。
- [管理任务](how-to/manage-tasks.md) —— 新建、停用、启用、每 N 天。
- [管理待办](how-to/manage-todos.md) —— 增删改期。
- [使用任务表](how-to/use-the-grid.md) —— 筛选、缩放、编辑、横滚。
- [切换语言](how-to/switch-language.md)
- [新增语言](how-to/add-a-language.md)
- [备份与恢复](how-to/backup-and-restore.md)
- [升级与回退](how-to/upgrade-and-rollback.md)
- [发版](how-to/release.md)
- [测试](how-to/testing.md)
- [排障](how-to/troubleshoot.md)

### 查：事实、参数、表结构

- [打卡规则](reference/checkins.md)
- [任务与区间](reference/tasks-and-intervals.md)
- [待办](reference/todos.md)
- [设置项](reference/settings.md)
- [数据模型](reference/data-model.md)
- [领域函数](reference/domain-functions.md)
- [任务表](reference/grid.md)
- [窗口与托盘](reference/windows-and-tray.md)
- [国际化](reference/i18n.md)
- [开发约定](reference/conventions.md)
- [命令](reference/commands.md)
- [文件位置](reference/file-locations.md)
- [术语表](reference/glossary.md)

### 懂：为什么这样设计

- [产品决策](explanation/product-decisions.md)
- [架构](explanation/architecture.md)
- [后续规划](explanation/roadmap.md)
- [ADR](explanation/adr/0001-tauri-sqlite-react.md)

### 项目记录

- [当前进度](project/progress.md)
- [版本记录](project/changelog.md)
- [原始需求与想法池](project/backlog.md)

---

## 文档规则

- 每篇只占一个类型：教程 / 操作指南 / 参考 / 解释 / 项目记录 / 入口
- 一个事实只写一处，其他位置链接
- 顶部必须有类型、状态、适用版本
- 命令、路径、配置键必须可直接复制

校验：

```bash
npm run docs:check
```
