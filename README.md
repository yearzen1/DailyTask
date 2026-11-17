# DailyTask

[English](./README.md) | [简体中文](./README.zh-CN.md)

A local-first desktop app for daily habit check-ins and todos. It replaces the
"copy a new Excel sheet every time a habit changes" workflow with interval-based
tasks, a floating widget, and a spreadsheet-style grid. Windows only.

<a id="what-it-does"></a>
## What it does

- **Daily check-ins** — done / missed / skip today, optional free-form values.
- **Intervals** — pause and resume a task without rewriting history; repeat every N days.
- **Today** — progress ring, nested task-type groups, due todos.
- **Widget** — always-on-top card sharing the main window palette; click to cycle states.
- **Grid** — date columns, sticky headers, keyboard navigation, nested type groups, filters, zoom.
- **Task types** — create your own nested types; voluntary/forced are the two built-in defaults.
- **Todos** — overdue / today / this week / later, with date editing and safe delete.
- **Stats** — per-task streak and 30-day completion rate.
- **Local first** — SQLite on disk, no account, no cloud sync; signed updates from GitHub.

<a id="install"></a>
## Install

1. Open [GitHub Releases](https://github.com/yearzen1/DailyTask/releases/latest).
2. Download `DailyTask_x.y.z_x64-setup.exe`.
3. Install for the current user and launch.

Updates are signed and delivered in-app. See [upgrade and rollback](docs/how-to/upgrade-and-rollback.md).

<a id="first-run"></a>
## First run

1. Create a task in **Tasks**.
2. Check it off in **Today**.
3. Add a todo in **Todos**.

Full walkthrough: [First run tutorial](docs/tutorials/first-run.md).

<a id="docs"></a>
## Documentation

Start at the [documentation map](docs/README.md).

- **Learn** — [first run](docs/tutorials/first-run.md) · [local development](docs/tutorials/local-development.md)
- **Do** — [daily use](docs/how-to/daily-use.md) · [manage tasks](docs/how-to/manage-tasks.md) · [backup](docs/how-to/backup-and-restore.md) · [release](docs/how-to/release.md)
- **Check** — [check-in rules](docs/reference/checkins.md) · [data model](docs/reference/data-model.md) · [commands](docs/reference/commands.md) · [glossary](docs/reference/glossary.md)
- **Understand** — [product decisions](docs/explanation/product-decisions.md) · [architecture](docs/explanation/architecture.md) · [ADRs](docs/explanation/adr/0001-tauri-sqlite-react.md)

<a id="development"></a>
## Development

```bash
npm install
npm run dev:app
npm test
```

Dev builds use `com.dailytask.app.dev` and their own data directory. Full guide:
[local development](docs/tutorials/local-development.md).

<a id="data"></a>
## Data

- Database: `%APPDATA%\com.dailytask.app\dailytask.db`
- Backups: `%APPDATA%\com.dailytask.app\backup\`
- Export / import: JSON v1 in Settings

<a id="license"></a>
## License

[MIT](./LICENSE) © 2026 DailyTask contributors
