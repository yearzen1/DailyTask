# 命令参考

> 类型：参考
> 状态：稳定
> 适用版本：v0.1.9+
> 相关：tutorials/local-development.md、how-to/release.md

---

## npm

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 只启动 Vite |
| `npm run dev:app` | Tauri dev，独立身份 `com.dailytask.app.dev` |
| `npm run test` | Vitest |
| `npm run test:watch` | 监听测试 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run docs:check` | 文档链接/状态头校验 |
| `npm run tauri build` | 安装包 + updater 签名 |
| `npm run tauri` | Tauri CLI 透传 |

## Rust

```bash
cd src-tauri
cargo check
```

## 发版

```bash
node scripts/release.mjs 0.1.9 \
  --notes "中文说明" \
  --notes-en "English notes"
```

## GitHub

```bash
gh release view v0.1.9
gh release create v0.1.9 <exe> <sig> --title v0.1.9 --notes "..."
gh release upload v0.1.9 latest.json --clobber
```

## 调试

```bash
npm run dev:app
```

前端 Console + 终端 Rust 日志。
