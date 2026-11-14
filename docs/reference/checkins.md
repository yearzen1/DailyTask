# 打卡参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/domain-functions.md、how-to/daily-use.md

---

## 1. 状态

| 状态 | 含义 | 进入分母 |
|---|---|---|
| `done` | 已完成 | 是 |
| `missed` | 未完成 | 是 |
| `skipped` | 今天不做 | 否 |
| `pending` | 今天/未来未打卡（投影） | 是（未完成前） |
| `none` | 不适用（投影） | 否 |

`recorded` 已在 v0.1.6 移除。

改名不会移动或删除打卡行：打卡始终挂在 `task_id + date` 上，任务名只是按名称段展示。改名后旧段仍显示原名，新段从今天开始。

## 2. 值 `value`

- 类型：`string | null`
- 任意短文本：`4`、`3min`、`4/3/2/2`
- 不是状态
- 没有打卡行时写值 → 创建 `done`
- 已有 `done/missed/skipped` 时写值 → 只改值
- 清空值 → `value = null`，保留状态

## 3. 单击循环

```text
pending / skipped → done
done              → missed
missed            → null（删除该行）
```

## 4. 投影顺序

1. 不适用 → `none`
2. 有打卡 → 记录状态
3. `date >= today` → `pending`
4. 过去 + auto-settle → `missed`（不写库）
5. 其余 → `pending`

## 5. 今日进度

任务 + 今日到期待办的合并口径：

```text
任务分母 = applicable − skipped
总分母   = 任务分母 + 待办行数
ratio    = (任务 done + 待办 done) / 总分母
```

- `done` / `missed` 计数（`missed` 只统计任务）
- `skipped` 不进分母
- `none` 不计入 applicable
- 待办分母按列表行数算，当天完成仍保留的行也计入
- 没有到期待办时退回纯任务口径
- 今日页、挂件、托盘共用这一口径

## 6. 近 30 天完成率

```text
分母 = done + missed
```

- 窗口固定 30 天
- skipped、pending、不适用日期不进分母
- 分母 0 → 返回 0

## 7. 连续天数

- 从今天往前
- `done` +1
- `missed` 中断
- `skipped` / 空白 / 不适用不计数不中断
- 最多回看 3660 天

## 8. 数据约束

- `UNIQUE(task_id, date)`，一格一条
- 状态 CHECK 只允许三值
- 日期 `YYYY-MM-DD`
- `upsertCheckin` 不碰 `value`
- `setCheckinValue` 不碰 `status`
