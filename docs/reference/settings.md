# 设置项参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：reference/i18n.md、reference/data-model.md

设置存在 `settings` 表，key/value，value 为 JSON。

---

| 设置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `theme` | `system / light / dark` | `system` | 主题 |
| `language` | `system / zh-CN / en` | `system` | 语言；system 按 `navigator.language` 解析 |
| `gridZoom` | number 14–44 | 32 | 网格缩放 |
| `autoSettleMissed` | boolean | true | 过去空白投影为 missed |
| `dayStartHour` | 0–23 | 4 | 一天的起始时间 |
| `alwaysOnTop` | boolean | true | 挂件置顶 |
| `autoLaunch` | boolean | false | 开机自启（安装版） |
| `navOrder` | string[] | `[]` | 侧栏顺序；空 = 默认 |
| `manageColumnWidths` | number[6] | `[20, 11, 15, 15, 16, 23]` | 任务管理列宽，百分比，和 100 |

## 约束

- 坏值回退默认，不阻塞启动
- `autoLaunch` 以系统状态为准，settings 只是缓存
- `navOrder` 启动优先读库，localStorage 只做首屏缓存
- `manageColumnWidths` 长度必须为 6，和偏离 100 超过 0.5 时等比缩放，越界回退默认
- 导出 / 导入包含全部设置
