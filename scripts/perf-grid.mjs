#!/usr/bin/env node
/**
 * 任务表首屏实测：在真实 WebView2 里点开「任务表」，量首屏耗时、DOM 数与长任务。
 *
 * 用法：npm run perf:grid
 * 预算来自 docs/reference/grid.md 第 3 节，超标时退出码 1。
 *
 * 已经开着带调试端口的 dev 实例时会复用它，否则自己起一个、跑完关掉。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 9222;
/** 第一次进入包含模块惰性初始化 / 画布 / 字体，单算一次；预算只看预热后的 3 次。 */
const RUNS = 4;
/**
 * release 构建的目标；dev 构建里 React StrictMode 会双渲染、jsxDEV 还多一层校验，
 * 同机实测约为 release 的 2–3 倍，所以 dev 单独给一档预算，且不卡长任务
 * （dev 下 ≥50ms 长任务必然出现，观测不到 16.7ms）。
 */
const BUDGET_RELEASE_MS = 150;
const BUDGET_DEV_MS = 700;
const BUDGET_CELLS = 2000;
/** 50ms 是 PerformanceObserver 的下限，51ms 这种多半是 GC 噪声；门禁卡 100ms。 */
const BUDGET_LONG_TASK_MS = 100;
/** dev 走 vite，release 走打包进二进制的 dist。 */
const APP_PAGE_PREFIXES = [
  "http://localhost:1420/",
  "http://tauri.localhost/",
  "tauri://localhost/",
];
const RELEASE_EXE = "src-tauri/target/release/dailytask.exe";
const RELEASE_MODE = process.argv.includes("--release");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listPages() {
  try {
    const response = await fetch(`http://localhost:${PORT}/json`);
    if (!response.ok) {
      return null;
    }
    const targets = await response.json();
    return targets.filter(
      (target) =>
        target.type === "page" &&
        APP_PAGE_PREFIXES.some((prefix) => target.url.startsWith(prefix)) &&
        !target.url.includes("window=widget"),
    );
  } catch {
    return null;
  }
}

async function waitForMainWindow(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = await listPages();
    if (pages && pages.length > 0) {
      return pages[0];
    }
    await sleep(500);
  }
  throw new Error("等待 WebView2 调试端口超时");
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const resolve = this.pending.get(message.id);
      if (resolve) {
        this.pending.delete(message.id);
        resolve(message);
      }
    });
  }

  async ready() {
    if (this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.result?.exceptionDetails) {
      throw new Error(
        response.result.exceptionDetails.exception?.description ??
          response.result.exceptionDetails.text,
      );
    }
    return response.result?.result?.value;
  }

  close() {
    this.socket.close();
  }
}

const MEASURE = `(async () => {
  const nav = document.querySelector('[data-nav-item="grid"]');
  if (!nav) throw new Error("找不到任务表导航项");
  const longtasks = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longtasks.push(entry.duration);
  });
  try { observer.observe({ entryTypes: ["longtask"] }); } catch {}

  const started = performance.now();
  nav.click();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const firstPaint = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 250));
  observer.disconnect();

  return {
    firstPaint,
    cells: document.querySelectorAll("[data-grid-cell]").length,
    nodes: document.querySelectorAll("[data-grid-content] *").length,
    longtasks,
  };
})()`;

const LEAVE = `(async () => {
  document.querySelector('[data-nav-item="today"]')?.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  return true;
})()`;

/** 前端加载完才有导航项：等 React 首次渲染完成再动手。 */
async function waitForGrid(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(
      `Boolean(document.querySelector('[data-nav-item="grid"]'))`,
    );
    if (ready) {
      return;
    }
    await sleep(300);
  }
  throw new Error("等任务表导航项超时");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function killTree(pid) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

let app;
const startedHere = !(await listPages());

if (startedHere) {
  const env = {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  };
  if (RELEASE_MODE) {
    if (!existsSync(RELEASE_EXE)) {
      throw new Error(
        `找不到 ${RELEASE_EXE}，先跑 npm run tauri -- build --no-bundle`,
      );
    }
    console.log(`启动 release 构建（调试端口 ${PORT}）…`);
    app = spawn(RELEASE_EXE, [], { stdio: "ignore", env });
  } else {
    console.log(`启动 dev 实例（调试端口 ${PORT}）…`);
    app = spawn("npm", ["run", "dev:app"], {
      shell: true,
      stdio: "ignore",
      env,
    });
  }
}

try {
  const page = await waitForMainWindow(startedHere ? 180_000 : 5_000);
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Runtime.enable");
  await waitForGrid(cdp);
  // 预热一次，避开冷启动的代码解析开销。
  await cdp.evaluate(LEAVE);
  await sleep(300);

  const runs = [];
  for (let index = 0; index < RUNS; index += 1) {
    runs.push(await cdp.evaluate(MEASURE));
    console.log(
      `  第 ${index + 1} 次：首屏 ${runs[index].firstPaint.toFixed(1)}ms · ` +
        `格子 ${runs[index].cells} · 节点 ${runs[index].nodes} · ` +
        `长任务 ${
          runs[index].longtasks.length === 0
            ? "无"
            : runs[index].longtasks.map((d) => `${d.toFixed(0)}ms`).join("/")
        }`,
    );
    await cdp.evaluate(LEAVE);
    await sleep(300);
  }

  const isDev = await cdp.evaluate(
    `Boolean(document.querySelector('script[src*="/@vite/client"]'))`,
  );
  cdp.close();

  const [cold, ...warm] = runs;
  const firstPaint = median(warm.map((run) => run.firstPaint));
  const cells = Math.max(...warm.map((run) => run.cells));
  const nodes = Math.max(...warm.map((run) => run.nodes));
  const longtasks = warm.flatMap((run) => run.longtasks);

  const budget = isDev ? BUDGET_DEV_MS : BUDGET_RELEASE_MS;

  console.log("");
  console.log(`任务表首屏（预热后 3 次的中位数 / 最大值，${isDev ? "dev" : "release"} 构建）`);
  console.log(
    `  首屏耗时  ${firstPaint.toFixed(1)}ms  预算 < ${budget}ms${
      isDev ? `（release 目标 ${BUDGET_RELEASE_MS}ms）` : ""
    }`,
  );
  console.log(`  冷启动    ${cold.firstPaint.toFixed(1)}ms（不计入预算）`);
  console.log(`  格子数    ${cells}        预算 ≤ ${BUDGET_CELLS}`);
  console.log(`  内容节点  ${nodes}`);
  console.log(
    `  ≥50ms 长任务 ${longtasks.length} 个${
      longtasks.length > 0
        ? `（最长 ${Math.max(...longtasks).toFixed(0)}ms）`
        : ""
    }`,
  );

  const failures = [];
  if (firstPaint > budget) {
    failures.push(`首屏 ${firstPaint.toFixed(1)}ms 超过 ${budget}ms`);
  }
  if (cells > BUDGET_CELLS) {
    failures.push(`格子数 ${cells} 超过 ${BUDGET_CELLS}`);
  }
  if (!isDev && longtasks.some((duration) => duration > BUDGET_LONG_TASK_MS)) {
    failures.push(
      `出现 ${Math.max(...longtasks).toFixed(0)}ms 的长任务（预算 ≤ ${BUDGET_LONG_TASK_MS}ms）`,
    );
  }

  if (failures.length > 0) {
    console.error("");
    console.error(`❌ ${failures.join("；")}`);
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("✅ 首屏在预算内");
  }
} finally {
  if (startedHere && app) {
    killTree(app.pid);
  }
}
