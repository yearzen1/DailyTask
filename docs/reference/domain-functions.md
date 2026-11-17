# 领域函数

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/data-model.md、explanation/product-decisions.md、how-to/testing.md

`src/domain/**` 是纯 TypeScript：无 IO、无 React、无 Tauri。所有规则必须能直接单测。

---

## 1. 日期

```ts
formatDate(date: Date): string
logicalToday(now: Date, dayStartHour: number): string
addDays(date: string, days: number): string
diffDays(later: string, earlier: string): number
range(start: string, end: string): string[]
```

- 全应用只允许 `logicalToday()` 产出「今天」
- 业务日期统一 `YYYY-MM-DD`
- 一天起始时间默认 `04:00`，凌晨补打卡算前一天

## 2. 区间与适用性

```ts
isApplicable(intervals: Interval[], date: string): boolean
applicableTasks(tasks: Task[], date: string): Task[]
currentInterval(intervals: Interval[], date: string): Interval | null
```

`currentInterval` 返回当天命中的最新一段区间，用于读取截止日期；多段重叠时以 `start` 最晚的为准。

规则：

1. 日期必须落在任一段区间 `[start, end ?? +∞]`
2. 区间有 `everyDays` 时，以 `start` 为第 1 天，`diffDays(date, start) % everyDays === 0`
3. 同一任务多段区间任一命中即适用
4. 每段区间的周期独立锚定，编辑某段不影响其他段

显示为 `▫` 且不可点。

## 2.5 名称段

```ts
namePeriodsOf(task: Task): NamePeriod[]      // 按 start 升序；缺省时合成一段
currentNamePeriod(task: Task): NamePeriod
currentName(task: Task): string
isDateInNamePeriod(period: NamePeriod, date: string): boolean
nameOn(task: Task, date: string): string
```

- 任务名按日期分段保存，旧段永不改写
- `namePeriodsOf` 在任务没有 `namePeriods` 时，用 `task.name` 合成一段覆盖最早区间到至今
- 日期落在段外时 `nameOn` 退回最近的段，保证异常数据下也有名字
- 网格与统计按名称段拆行；今日页、挂件继续使用 `currentName`

## 2.6 任务类型树

```ts
resolveTaskTypeId(task: Task): string          // typeId ?? category
resolveTaskTypes(types?: TaskType[]): TaskType[]
buildTypeTree(types: TaskType[]): TypeNode[]
flattenTypeTree(types: TaskType[]): FlatType[] // 带 depth / path
descendantTypeIds(types: TaskType[], id: string): Set<string>
isTypeDescendant(types, ancestorId, id): boolean
sortedTasksByType(tasks: Task[], types: TaskType[]): Task[]
typeDropZone(clientY, top, height, isBuiltin): "before" | "inside" | "after"
planTypeMove(types, sourceId, targetId, position): { parentId, index } | null
```

- `typeDropZone`：自行上三分之一 → 前插，下三分之一 → 后插，中间 → 作为子类型；内置类型整行都算「作为子类型」
- `planTypeMove`：拒绝移动自身、内置类型、拖到自身子孙下、内置类型的前后插入

- 内置类型 id 为 `voluntary` / `forced`，可被改名，但节点始终存在
- 树顺序：先父后子；同级按 `sort_order`，相同再按 `created_at`
- 父组计数聚合整棵子树；父组折叠隐藏全部子孙
- 旧数据只有 `category` 时按同名内置类型分组
- 改父级不能形成环；同一父级下名称唯一

## 3. 格子投影

```ts
type CellState = "done" | "missed" | "skipped" | "pending" | "none";

projectCell(
  task: Task,
  date: string,
  checkin: Checkin | undefined,
  settings: Settings,
  today: string,
): CellState
```

判定顺序：

1. 不适用 → `none`
2. 有打卡记录 → 直接返回记录状态
3. `date >= today` → `pending`
4. 过去 + `autoSettleMissed` → `missed`（只投影，不写库）
5. 其余 → `pending`

自动结算只影响展示，避免启动时批量写库，也避免改设置后历史被永久污染。

## 4. 今日进度

```ts
dayProgress(tasks, checkins, date, settings, today): {
  done, missed, skipped, applicable, ratio
}

combineProgress(progress, { done, total }): DayProgress
```

- 任务分母 = `applicable - skipped`
- 总分母 = 任务分母 + 到期待办行数
- `skipped` 不进分母
- 值不是状态；没有判定时写值按 `done` 计算
- `recorded` 已移除
- 待办没有 `skipped` / `missed`：`done` 进分子，未完成进 `pending`；`missed` 仍只统计任务
- 待办分母按当日列表行数算，当天完成保留的行也计入
- 没有到期待办时结果与纯任务进度一致

## 5. 连续天数

```ts
interface DateRange { start: string; end: string }

taskStreak(task, checkins, today, settings, range?: DateRange): number
```

- 从今天或 `range.end`（取较早者）往前遍历
- `done` +1
- `missed` 立即中断
- `skipped`、`pending`、不适用日期不计数也不中断
- 不越过 `range.start`，最多回看 3660 天
- 名称分段的旧段以段结束日为终点

## 6. 近 30 天完成率

```ts
completionRate30(task, checkins, today, settings, range?: DateRange): number
```

- 分母只含 `done + missed`
- `skipped`、`pending`、不适用日期不进分母
- 窗口固定 30 天，终点为今天或 `range.end`（取较早者）
- 不越过 `range.start`
- 分母为 0 时返回 0
- 名称分段的旧段以段结束日为窗口终点

## 7. 单击循环

```ts
nextCellState(state): CheckinStatus | null
```

```text
pending / skipped → done
done              → missed
missed            → null（删除该行）
```

今日页、挂件、网格状态编辑共用同一规则。

## 7.5 任务管理列宽

```ts
sanitizeManageColumnWidths(raw: unknown): number[]
resizeBoundary(widths: number[], boundary: number, delta: number): number[]
resetColumnWidth(widths: number[], index: number): number[]
```

- 6 列百分比，和 100；默认 `[20, 11, 15, 15, 16, 23]`
- `resizeBoundary` 只改分隔线两侧两列，两侧夹在各自最小 / 最大宽之间
- `resetColumnWidth` 让目标列精确回到默认宽，差值按其余列余量分摊
- 规则细节见 [specs/manage-column-resize.md](../specs/manage-column-resize.md)

## 8. 边界与测试

必须覆盖：

- 区间首日 / 末日 / 前后一天
- `end = null`
- 多段区间与空档
- 每 N 天的锚点与跨段独立周期
- `today` 边界、自动结算开关
- skipped 对 streak / 完成率的影响
- 名称段边界、旧段统计终点
- 类型树嵌套、父组聚合、环拒绝、旧数据回退
- 旧 `recorded` 数据迁移后按 done 计算

测试文件：

- `src/domain/*.test.ts`
- `src/db/intervals.test.ts`（真实 SQLite）
- `src/db/checkins.test.ts`（真实 SQLite）
- `src/db/migrations.test.ts`（迁移回填）
