# 文件位置参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：how-to/backup-and-restore.md、how-to/release.md

---

## 应用数据

| 环境 | 路径 |
|---|---|
| 生产 | `%APPDATA%\com.dailytask.app\` |
| 开发 | `%APPDATA%\com.dailytask.app.dev\` |

文件：

```text
dailytask.db
dailytask.db-wal
dailytask.db-shm
backup\
  dailytask-YYYYMMDD.db
  pre-update-<version>.db
```

## 安装与产物

| 项 | 路径 |
|---|---|
| 安装目录 | `%LOCALAPPDATA%\DailyTask` |
| 安装包 | `src-tauri/target/release/bundle/nsis/DailyTask_<version>_x64-setup.exe` |
| 签名 | 同目录 `*.exe.sig` |
| 更新清单 | 仓库根 `latest.json`（不提交） |

## 签名

| 项 | 路径 |
|---|---|
| 私钥 | `%USERPROFILE%\.tauri\dailytask.key` |
| 密码 | 环境变量 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| 密码副本 | `%USERPROFILE%\.tauri\dailytask-signing-password.txt` |

## 设计稿

```text
design/tokens.css
design/preview.html
design/app-icon.png
```
