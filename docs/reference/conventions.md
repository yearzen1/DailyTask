# 开发约定

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：how-to/testing.md、explanation/architecture.md、explanation/product-decisions.md

---

## 1. 文档驱动

改行为前先改文档：

```text
Doc → Check → Code → Sync
```

- 先定位受影响的文档章节
- 文档先于代码提交
- 实现中发现偏差，先改文档再改代码
- 文档变更与代码变更成对出现

## 2. 分层

| 层 | 可以做 | 不可以 |
|---|---|---|
| `domain` | 纯计算、类型、规则 | IO、React、Tauri、db |
| `db` | SQL、repository | UI、事件 API |
| `stores` | Zustand、调用 db | import 其他 store、直接 JSX |
| `windows` | 页面、交互 | 直接 import db、手写事件名 |
| `ui` | 通用组件 | 业务 store 深耦合 |

ESLint zone 规则在 `eslint.config.js`，`npm run lint` 会拦截越界。

## 3. 事件

- 事件名只在 `shared/events.ts` 定义
- payload 只做失效信号
- 监听方自己重查
- 写库成功后再发
- `source` 用于丢弃自己发出的事件

## 4. 删除

- UI 删除统一 `ConfirmDeleteButton`
- store 删除要求 `DeleteConfirmation`
- view 禁止 import `shared/deleteConfirmation`
- 删除任务显式级联 checkins → intervals → tasks
- 失败保留弹窗并展示错误

## 5. 危险操作

- 数据迁移只追加，不改历史
- 更新签名不可关闭
- 破坏性 JSON 变更要兼容旧文件
- 删除/停用/清除都要能撤销或有确认

## 6. 提交

Conventional Commits：

```text
feat(scope): ...
fix(scope): ...
docs(scope): ...
test(scope): ...
refactor(scope): ...
build(scope): ...
chore(scope): ...
```

- subject 英文祈使句、小写、≤72 字符
- 正文中文，解释为什么
- 文档与实现分开提交，或成对提交
- 版本提交由 `release.mjs` 生成

## 7. 命名

- 领域类型用业务名：`Task`、`Interval`、`Checkin`
- DB 行用 snake_case：`start_date`、`every_days`
- store hook：`useXxxStore`
- selector：`buildXxx` / `useXxxData`
- 事件：`xxxChanged`

## 8. 代码风格

- 日期一律 `YYYY-MM-DD`
- 不裸写颜色 / 间距 / 圆角，取 token
- 不裸写 `new Date()` 当今天，走 `logicalToday`
- 交互组件同时提供 aria-label / role
- 文案走 `t()`，不写死中文或英文
