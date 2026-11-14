# 术语表

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：explanation/product-decisions.md、reference/domain-functions.md

| 术语 | 英文 | 定义 |
|---|---|---|
| 任务 | task | 一个需要按日期重复打卡的事项，包含名称、类型、排序与启用区间。 |
| 类型 | category | `voluntary`（自愿）或 `forced`（被迫）。只影响分组与颜色，不影响统计。 |
| 启用区间 | interval | 任务可用的一段日期，含 `start` 与可空 `end`；停用后再启用会追加第二段。 |
| 名称段 | name period | 任务名在某段日期内的取值；改名会关闭旧段、从今天追加新段。 |
| 间隔天数 | everyDays | 区间内的重复周期。`1` = 每天；`N` = 以区间启用日为第 1 天，每 N 天出现一次。 |
| 适用 | applicable | 日期落在任一区间内，且命中该区间的 `everyDays` 周期。 |
| 不适用 | none | 日期不在区间内，或不在周期上；格子显示 `▫`，不可点击。 |
| 投影 | projection | 不写库、只在读取时推导出的格子状态，例如过去的空白显示为 `missed`。 |
| 自动结算 | auto-settle | 过去空白格投影为未完成的开关；只影响展示，不批量写库。 |
| 待完成 | pending | 今天或未来、还没有打卡记录的格子。 |
| 完成 | done | 已判定完成。 |
| 未完成 | missed | 已判定未完成，或过去空白被自动结算投影为未完成。 |
| 今天不做 | skipped | 明确跳过当天，不计入完成率分母，也不中断 streak。 |
| 自由值 | value | 打卡上的附加信息，如 `4`、`3min`、`4/3/2/2`；不是状态，没有判定时写值会自动记为 done。 |
| 连续天数 | streak | 最近连续完成的任务天数；skipped 与不适用日期不计数、不中断。 |
| 近 30 天完成率 | completionRate30 | 近 30 天内 `done / (done + missed)`；skipped 与不适用日期不进分母。 |
| 打卡 | check-in | 某个任务在某一天的一条记录；`UNIQUE(task_id, date)` 保证一格一条。 |
| 挂件 | widget | 独立透明置顶窗口，展开态与今日页同构。 |
| 胶囊 | capsule | 挂件收起后的贴边小条，点击展开。 |
| 确认令牌 | DeleteConfirmation | store 删除方法要求的品牌类型；只有 `ConfirmDeleteButton` 在用户确认后才构造。 |
| 系统语言 | system language | 设置里的 `system` 档；按 `navigator.language` 解析为 `zh-CN` 或 `en`。 |
| 文档驱动 | document-driven | 先改文档，再改代码；文档是行为契约。 |
