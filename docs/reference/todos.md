# 待办参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/data-model.md、how-to/manage-todos.md

---

## 1. Todo

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | UUID |
| `title` | string | 必填 |
| `dueDate` | `YYYY-MM-DD \| null` | null 归入「以后」 |
| `done` | boolean | |
| `completedAt` | ISO string \| null | |
| `createdAt` | ISO string | |
| `updatedAt` | ISO string | |

## 2. 分组

| 分组 | 条件 |
|---|---|
| 逾期 | `dueDate < today && !done` |
| 今天 | `dueDate = today && !done` |
| 本周 | `today < dueDate ≤ 本周日 && !done` |
| 以后 | `dueDate = null` 或 `dueDate > 本周日`，且 `!done` |
| 已完成 | `done = true`，默认折叠 |

本周以周一为一周开始，周日为界。

## 3. 逾期与剩余天数

```ts
diffDays(today, dueDate)   // 逾期天数
diffDays(dueDate, today)   // 未来待办的剩余天数
```

按日历天，不含时间。

- 逾期：显示「逾期 N 天」
- 今天：显示「今天」
- 未来：待办页显示「还差 N 天」；无截止日不显示
- 已完成行不显示倒计时

## 4. 操作

- 新增：标题必填；截止日期可空；`Enter` 保存，`Shift+Enter` 换行
- 完成 / 取消完成：行内圆圈
- 重命名：`✎`，`Enter`/失焦保存，`Shift+Enter` 换行，`Esc` 取消
- 改日期：日历按钮直接弹出日历，点日期立即保存；底部可清除日期
- 删除：二次确认
- 右键：改日期、清除日期、删除

## 5. 今日与挂件中的待办

- 显示 `dueDate <= today` 的未完成待办
- 当天打勾完成的待办保留在列表中（带勾选与删除线），次日自动移除
- 再点一次可取消完成；未来待办不显示
- 组头显示 `done / total`，分母按列表行数算（含当天已完成保留的行）
- 组头左侧有 warning 黄竖条，点整行可折叠 / 展开
- 待办计入今日完成率：今日页、挂件、托盘的进度分子分母都包含到期待办

## 6. 排序

- 组内按 `dueDate` 升序
- 已完成组按完成时间/创建时间
