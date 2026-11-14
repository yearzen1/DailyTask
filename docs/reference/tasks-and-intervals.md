# 任务与区间参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/checkins.md、how-to/manage-tasks.md

---

## 1. Task

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | UUID |
| `name` | string | 当前名字；有 `namePeriods` 时以最新段为准 |
| `category` | `voluntary` / `forced` | 只影响分组与颜色 |
| `intervals` | Interval[] | 至少一段 |
| `namePeriods` | NamePeriod[] | 名称历史；缺省时按 `name` 合成一段 |
| `order` | number | `sort_order` |
| `createdAt` | ISO string | |
| `updatedAt` | ISO string | |

## 2. Interval

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | UUID |
| `taskId` | string | |
| `start` | `YYYY-MM-DD` | 含当天 |
| `end` | `YYYY-MM-DD \| null` | 截止日期，含当天；null = 一直有效 |
| `everyDays` | number | 1 = 每天；N = 每 N 天；缺省 1 |

## 2.5 NamePeriod

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | UUID；旧数据/测试数据的合成段用 taskId |
| `taskId` | string | |
| `name` | string | 该段显示的名字 |
| `start` | `YYYY-MM-DD` | 含当天 |
| `end` | `YYYY-MM-DD \| null` | null = 至今 |

- 一个任务至少有一段
- 按 `start` 升序读取；最新一段就是当前名字
- 同一任务同日只能有一段（唯一索引）
- `tasks.name` 只作为当前名字缓存，读取时以最新段为准

## 2.6 改名

- 默认从逻辑今天起生效：当前段 `end = today − 1`，追加一段从 `today` 开始
- 同名不操作
- 当前段已经 `start >= today`、任务今天刚创建、或勾选「只修正当前名字」时，原地改写当前段
- 改名不改任何打卡记录
- 网格与统计按名称段拆行；旧段以段结束日为统计终点

## 3. 适用性

```ts
isApplicable(intervals, date)
```

命中条件：

1. `start ≤ date ≤ (end ?? +∞)`
2. `everyDays === 1 || diffDays(date, start) % everyDays === 0`

- 锚点是该段 `start`
- 每段独立
- 任一命中即适用

## 4. 截止 / 停用 / 重新启用

- 截止日期就是区间 `end`：含当天，次日任务不再出现
- 新建任务时可留空（一直有效），也可直接设截止日期
- 停用：把开放区间 `end` 设为所选日期（含当天）
- 重新启用：追加新段，`start` = 所选日期，`end = null`
- 新段继承上一段 `everyDays`
- 历史段与打卡不变
- 今日页和挂件显示当前区间 `end` 的倒计时：`0` = 今天截止，`N` = 还差 N 天

## 5. 任务状态

| 状态 | 条件 |
|---|---|
| `active` | 有开放区间且最新段已开始 |
| `scheduled` | 最新段 `start > today` |
| `endingToday` | 无开放区间，`end = today` |
| `endingLater` | 无开放区间，`end > today` |
| `disabled` | 无开放区间且 `end < today`，或没有区间 |

## 6. 删除

显式级联：

```text
checkins → task_name_periods → task_intervals → tasks
```

不依赖 SQLite 外键开关。
