# 排障

> 类型：操作指南
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：how-to/backup-and-restore.md、reference/file-locations.md

适用：启动、数据库、托盘、挂件、更新、删除出问题时快速定位。

---

## 1. 先收集

- 应用版本：设置页
- 数据目录：[reference/file-locations.md](../reference/file-locations.md)
- Console 完整错误
- 最近一份备份

前端日志在开发者工具 Console；Rust 日志在 `npm run dev:app` 终端。

## 2. 启动白屏

1. Console 搜 `[init] 初始化失败`
2. 检查 DB 是否被占用
3. 迁移失败先备份 DB，再删 `-wal` / `-shm`
4. `cargo check` 确认 Rust 编译

## 3. 数据库

| 现象 | 处理 |
|---|---|
| `database is locked` | 退出另一个实例，结束残留 exe |
| 迁移失败 | 备份 DB，检查 migration 版本顺序 |
| `migration N was previously applied but has been modified` | 迁移文件的字节变了（多为 CRLF），见 3.1 |
| `no such table: task_name_periods` | 迁移没跑完，见 3.1 |
| 旧数据异常 | 确认 004 是否执行；旧 recorded 应变成 done |

### 3.1 迁移校验和与行尾

sqlx 把每个迁移脚本的 SHA-384 记进 `_sqlx_migrations`，**按字节**比对。同一个文件被 git 在 LF 与 CRLF 之间转换过，校验和就变，启动时报：

```text
migration 1 was previously applied but has been modified
```

此时迁移列表已被插件取走并失败，**另一个窗口**再打开同一个库时不再跑迁移，于是接着报 `no such table: task_name_periods`——两个窗口各报一个错，根因是同一个。

处理：

1. 确认 `src-tauri/migrations/*.sql` 是 LF：`git ls-files --eol src-tauri/migrations`
2. 仓库根 `.gitattributes` 已把该目录固定为 `text eol=lf`；若被改回 CRLF，重新 checkout 该目录即可
3. 不要用改历史脚本或删库来绕过；`core.autocrlf=true` 的机器上重装/重克隆会再次触发
4. 校验和变化后仍想保留数据，只能把文件恢复成当初写入库的字节（通常是 LF）

## 4. 托盘

| 现象 | 处理 |
|---|---|
| 图标不见 | 任务栏溢出区；重启 |
| 左键无反应 | 左键应同时唤回主窗与挂件 |
| 文案不切换 | 检查 `set_tray_labels` 与语言设置 |

## 5. 挂件

| 现象 | 处理 |
|---|---|
| 尺寸不对 | 200% DPI 下逻辑仍 260×360 |
| 拖动后不回边 | 检查工作区与吸附逻辑 |
| 单击状态不变 | 确认点在任务行，不是在输入框 |
| 值改不了 | 点值 chip；Enter / 失焦保存 |

## 6. 跨窗口不同步

1. 写库后是否 emit 对应事件
2. `source` 去重是否正常
3. Console 搜 `[sync]`
4. 两窗口是否连同一个 DB

## 7. 更新

| 现象 | 处理 |
|---|---|
| 检查失败 | 网络/代理；`latest.json` 可访问性 |
| 安装后没重启 | 手动启动 |
| 私钥丢失 | 无法再推更新，只能手动重装 |
| 想降级 | 不支持；按升级回退文档手动装旧版 |

## 8. 删除没反应

1. 确认走 `ConfirmDeleteButton`
2. store `remove` 是否收到令牌
3. 失败是否保留弹窗
4. 看 `[delete] 删除失败`

## 9. 日期错位

1. 今天只允许 `logicalToday()`
2. 检查 `dayStartHour`
3. 不要用 `toISOString().slice(0,10)` 当本地日期
