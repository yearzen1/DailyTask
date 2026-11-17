# 任务类型（可嵌套）

> 类型：参考
> 状态：已实现
> 适用版本：未发布
> 相关：../reference/data-model.md、../reference/tasks-and-intervals.md、../reference/grid.md、../how-to/manage-types.md

## 目标

把写死的「自愿 / 被迫」二选一改成可自建、可嵌套的任务类型树。类型可以单独管理，任务可以在类型页直接新建，也可以在任务弹窗里改归属；今日、任务表、挂件按类型分组并可逐级折叠。

## 背景

`tasks.category` 是 `CHECK (category IN ('voluntary','forced'))` 的枚举，网格、今日、挂件、导入导出、统计全部直接判断 `category === "voluntary"`。用户想按「工作 / 生活 / 健康 / 学习」等自己的口径分组，并且希望大类下面还能分子类。继续加枚举无法满足，也不会解决层级折叠。

## 范围

- In-scope：
  - 新增 `task_types` 表与迁移 006，回填既有任务
  - 「自愿」「被迫」成为两个内置类型，不可删除；可改名，未改名时跟随界面语言
  - 单个任务只属于一个类型；类型支持任意层级父子关系
  - 新增侧栏「类型」页：建、改名、改父级、改颜色、同级排序、删除、给类型加任务
  - 任务管理：类型列显示类型名；新建/编辑任务可选类型
  - 今日、任务表、挂件：类型树分组 + 逐级折叠；空类型不显示
  - 任务表类型筛选：选中父类型时包含全部后代
  - JSON v3 导出/导入；兼容 v1/v2
- Out-of-scope：
  - 一个任务多个类型标签
  - 统计页按类型分组或筛选
  - 类型本身的按日期分段（改名不追溯）
  - 已停用任务重新拆回类型分组（继续单独成组）

## 方案

### 数据

```sql
CREATE TABLE task_types (
  id         TEXT PRIMARY KEY,
  name       TEXT,                 -- NULL = 内置类型，显示走 i18n
  parent_id  TEXT REFERENCES task_types(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  system_key TEXT UNIQUE,          -- 'voluntary' | 'forced'
  color      TEXT,                 -- 调色板 key；NULL 用默认色
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

ALTER TABLE tasks ADD COLUMN type_id TEXT;
UPDATE tasks SET type_id = category;
CREATE INDEX idx_tasks_type ON tasks(type_id);
```

- 迁移插入 `voluntary`、`forced` 两行，`sort_order` 为 0 / 1，`system_key` 固定。
- `sort_order` 只在同级内比较。
- 同一父级下类型名唯一（应用层校验）；改父级时禁止选自己或自己的子孙。
- `tasks.type_id` 是读取类型归属的唯一来源；`tasks.category` 保留为旧版本兼容列，写入时按类型根节点同步为 `voluntary` 或 `forced`。
- 删除类型：有直属任务或有子类型时拒绝，提示先移走；空类型才允许删除。
- 删除任务、删除类型都走 `ConfirmDeleteButton` 与 `DeleteConfirmation`。

### 类型展示

- 内置类型 `name IS NULL`：显示 `t("type.voluntary")` / `t("type.forced")`，切换语言即时变化。
- 内置类型改名后写入 `name`，按自定义名称显示；清空名称可恢复跟随语言（类型编辑弹窗提供「恢复默认名称」）。
- 内置类型不可删除，不可互为父子，但可以拥有子类型。
- 自定义类型必须有名称；颜色来自固定调色板（8 色），未指定时按创建顺序取色。

### 分组

- 任务按 `type_id` 归组；父类型只显示自己的直属任务，子类型作为缩进子组显示。
- 父组计数 = 整棵子树的任务数；父组折叠时隐藏全部子组。
- 今日页、网格、挂件使用同一套树顺序（先父后子，同级按 `sort_order`）。
- 今日页与挂件只显示今天有适用任务的类型；网格显示有任务或历史任务的类型。
- 网格「已停用」仍是末尾独立组，默认折叠。
- 顶部统计：今日页与挂件都显示**顶层类型**的 `done / total`（聚合子树），待办小计保留。
- 折叠状态不持久化：切视图或重启后恢复展开；挂件回到胶囊再展开时全部恢复展开。

### 任务表

- 组头显示类型名、色点、任务数，可折叠。
- 缩进表示层级；父组折叠带走子组。
- 拖拽只在同一类型内排序；展开成全局 `sort_order` 时按树顺序写回。
- 类型筛选：全部类型 + 缩进类型列表；选父类型包含全部后代。

### 导入导出

- JSON v3：新增 `taskTypes`，`tasks[]` 增加 `typeId`。
- v3 导入先 upsert 类型再 upsert 任务；引用不存在的类型视为结构错误。
- v1/v2 导入：`category` 映射到同名内置类型 id，并补齐 `typeId`。
- 导出包含内置类型（含改名结果）与全部自定义类型。

## 验收标准（AC）

- [x] 迁移后两个内置类型存在，所有既有任务都有 `type_id`。
- [x] 内置类型可改名、可加子类型，但不可删除。
- [x] 新建、改名、改父级、同级拖拽排序、删除空类型都能落库并在重启后保留。
- [x] 有任务或有子类型的类型无法删除，并给出提示。
- [x] 不能把类型挂到自己的子孙下。
- [x] 同一父级下不能重名。
- [x] 任务管理新建/编辑任务可以选择任意层级类型；类型列显示叶子类型名。
- [x] 类型页可以给指定类型直接新建任务。
- [x] 今日页、任务表、挂件按类型树分组，组头可折叠，父组折叠隐藏子组。
- [x] 今日页与挂件顶部显示顶层类型小计；网格筛选选父类型包含后代。
- [x] JSON v3 往返一致；v1/v2 导入后任务仍有正确类型。
- [x] `npm test`、`npm run typecheck`、`npm run lint`、`npm run docs:check` 全部通过。

## 假设与开放问题

- 假设：一个任务只属于一个类型。
- 假设：折叠状态不持久化，和现有名称历史 / 待办分组一致。
- 假设：类型改名不影响历史打卡，类型没有按日期分段。
- 假设：颜色只用于区分分组，不参与统计。
- 开放问题：无。
