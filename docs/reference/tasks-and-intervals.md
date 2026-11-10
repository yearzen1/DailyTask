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
| `name` | string | 任务名 |
| `category` | `voluntary` / `forced` | 只影响分组与颜色 |
| `intervals` | Interval[] | 至少一段 |
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
checkins → task_intervals → tasks
```

不依赖 SQLite 外键开关。
