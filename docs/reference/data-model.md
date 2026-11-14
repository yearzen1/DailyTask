# 数据模型（SQLite）

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/domain-functions.md、how-to/backup-and-restore.md、how-to/release.md

---

## 1. 数据库位置

| 环境 | 路径 |
|---|---|
| 生产 | `%APPDATA%\com.dailytask.app\dailytask.db` |
| 开发 | `%APPDATA%\com.dailytask.app.dev\dailytask.db` |
| 备份 | 同目录 `backup/` |

启动时加载全部数据（< 2 万行，约 2 MB），跨年滚动不再查库。若未来超过阈值，再退化为按日期范围加载。

## 2. 当前表结构

```sql
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('voluntary','forced')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE task_intervals (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  start_date  TEXT NOT NULL,
  end_date    TEXT,                        -- 截止日期；NULL = 一直有效
  every_days  INTEGER NOT NULL DEFAULT 1,  -- 1 = 每天；N = 每 N 天
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_intervals_task ON task_intervals(task_id);

CREATE TABLE task_name_periods (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,               -- 含当天
  end_date   TEXT,                        -- NULL = 至今
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX idx_name_periods_task_start
  ON task_name_periods(task_id, start_date);

CREATE TABLE checkins (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,               -- YYYY-MM-DD
  status      TEXT NOT NULL CHECK (status IN ('done','missed','skipped')),
  value       TEXT,                        -- 自由值，不构成状态
  note        TEXT,
  updated_at  TEXT NOT NULL,
  UNIQUE (task_id, date)
);
CREATE INDEX idx_checkins_date ON checkins(date);

CREATE TABLE todos (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  due_date     TEXT,
  done         INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_todos_due ON todos(done, due_date);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

### 2.1 任务名与名称段

`tasks.name` 保留为「当前名字」缓存；读取任务时以最新 `task_name_periods` 段为准。改名不再原地覆盖，而是把当前段截到昨天、从今天追加一段。这样历史打卡永远挂在原名下，不会被新名字追溯覆盖。

## 3. 迁移历史

| 版本 | 文件 | 内容 |
|---|---|---|
| 1 | `001_init.sql` | 5 张表 + 索引 |
| 2 | `002_checkin_value.sql` | 打卡加 `value`，状态加 `recorded` |
| 3 | `003_task_interval_every_days.sql` | 区间加 `every_days` |
| 4 | `004_drop_recorded_status.sql` | 重建 checkins，移除 `recorded`，旧值转 `done` |
| 5 | `005_task_name_periods.sql` | 新增 `task_name_periods`，按最早区间启用日回填一段 |

规则：

- migration **只追加**，禁止改已发布脚本
- 迁移文件必须是 **LF** 行尾，`.gitattributes` 已固定 `src-tauri/migrations/** text eol=lf`：sqlx 用 SHA-384 按字节校验，CRLF 会触发 `migration N was previously applied but has been modified`
- 迁移在 `src-tauri/src/lib.rs` 的 `Migration` 数组注册
- 改 `CHECK` 约束只能重建表（SQLite 不支持直接放宽）

### 3.1 002：自由值

`upsertCheckin` 只改 `status` / `note`，不碰 `value`；`setCheckinValue` 只改 `value`。这样判定与记录互不覆盖。

### 3.2 004：去掉 recorded

旧 `recorded` 行统一迁移为 `done`，保留 `id / value / note / updated_at`：

```sql
CASE WHEN status = 'recorded' THEN 'done' ELSE status END
```

旧 JSON 导入时也做同样归一。

## 4. JSON v2 导出 / 导入

```json
{
  "version": 2,
  "exportedAt": "2026-11-05T00:00:00.000Z",
  "tasks": [],
  "namePeriods": [],
  "intervals": [],
  "checkins": [],
  "todos": [],
  "settings": {}
}
```

- 任务、名称段与区间分开放，导入按 id upsert
- 名称段以 `(task_id, start_date)` 为语义键合并，重名不产生重复行
- 打卡按 `(task_id, date)` 语义键合并
- 本地多出来的行保留，不删数据
- v1 文件仍可导入：每个任务按最早区间启用日合成一段名称
- 旧 JSON 的 `recorded` 转 `done`
- 旧 JSON 缺少 `everyDays` 按 `1` 处理
- 导出不包含备份文件和 WebView localStorage

## 5. 备份

两种备份统一放 `backup/`：

| 类型 | 文件名 | 保留 |
|---|---|---|
| 每日轮转 | `dailytask-YYYYMMDD.db` | 最近 7 份 |
| 更新前快照 | `pre-update-{version}.db` | 不自动清理 |

详见 [备份](../how-to/backup-and-restore.md)。

## 6. 删除策略

- 删除任务：显式删除 `checkins → task_name_periods → task_intervals → tasks`，不依赖 SQLite 外键开关
- 删除待办：单表删除
- 所有 UI 删除入口必须走 `ConfirmDeleteButton`
- store 删除方法要求 `DeleteConfirmation` 令牌

## 7. 相关代码

| 文件 | 职责 |
|---|---|
| `src/db/client.ts` | `Database.load` + 迁移入口 |
| `src/db/tasks.ts` | 任务/区间/名称段 CRUD、改名、级联删除 |
| `src/db/checkins.ts` | 状态、值、备注、删除 |
| `src/db/todos.ts` | 待办 CRUD |
| `src/db/settings.ts` | kv JSON 读写与 sanitize |
| `src/db/backup.ts` | 每日轮转 + 更新前快照 |
| `src/db/transfer.ts` | JSON v2 导入导出（兼容 v1） |
