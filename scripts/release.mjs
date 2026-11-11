#!/usr/bin/env node
/**
 * 一条命令发版：bump → 签名构建 → GitHub Release → latest.json。
 * 用法：node scripts/release.mjs 0.1.2 [--dry-run] \
 *         --notes "中文说明" --notes-en "English notes"
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("-"));
const dryRun = args.includes("--dry-run");
const notesIndex = args.indexOf("--notes");
const notesEnIndex = args.indexOf("--notes-en");
const notesZh = notesIndex >= 0 ? (args[notesIndex + 1] ?? "") : "";
const notesEn = notesEnIndex >= 0 ? (args[notesEnIndex + 1] ?? "") : "";
const notes = `### 中文\n${notesZh}\n\n### English\n${notesEn}`;
const usage =
  'node scripts/release.mjs <x.y.z> [--dry-run] --notes "中文说明" --notes-en "English notes"';

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`用法: ${usage}`);
  process.exit(1);
}
if (!notesZh || !notesEn) {
  console.error(`发布说明必须中英双语：${usage}`);
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gh = process.platform === "win32" ? "gh.exe" : "gh";

function run(command, commandArgs) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    // Node 22 不允许直接 spawn .cmd/.bat，npm.cmd 需要走 shell。
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  });
}

function bumpJson(relativePath, mutate) {
  const path = join(root, relativePath);
  const data = JSON.parse(readFileSync(path, "utf8"));
  mutate(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

// 用 npm version 而不是手改 package.json，确保 package-lock 同步。
// 版本已在当前分支 bump 过（例如发版 PR 里改了版本号）时跳过，避免 npm 报 "Version not changed"。
const packageJsonPath = join(root, "package.json");
const currentVersion = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
).version;
if (currentVersion === version) {
  console.log(`package.json 已是 ${version}，跳过 npm version`);
} else {
  run(npm, [
    "version",
    version,
    "--no-git-tag-version",
    "--ignore-scripts",
  ]);
}
bumpJson("src-tauri/tauri.conf.json", (conf) => {
  conf.version = version;
});

const cargoPath = join(root, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8").replace(
  /^version = "[^"]*"$/m,
  `version = "${version}"`,
);
writeFileSync(cargoPath, cargo);

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.warn(
    "警告：未检测到 TAURI_SIGNING_PRIVATE_KEY，updater 产物会缺少签名。",
  );
}

run(npm, ["run", "docs:check"]);
run(npm, ["run", "tauri", "build"]);

const artifact = join(
  root,
  "src-tauri/target/release/bundle/nsis",
  `DailyTask_${version}_x64-setup.exe`,
);
const signaturePath = `${artifact}.sig`;
if (!existsSync(artifact) || !existsSync(signaturePath)) {
  console.error(`构建产物缺失：${artifact} 或 .sig`);
  process.exit(1);
}

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: `https://github.com/yearzen1/DailyTask/releases/download/v${version}/DailyTask_${version}_x64-setup.exe`,
    },
  },
};
writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);

if (dryRun) {
  console.log("\n[dry-run] latest.json:");
  console.log(JSON.stringify(latest, null, 2));
  process.exit(0);
}

run("git", [
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
]);

// 版本号没变（重发同版本）时不产生空提交。
const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
if (staged.status !== 0) {
  run("git", [
    "commit",
    "-m",
    `chore(release): v${version}; chore(release): 发布 v${version}`,
  ]);
  run("git", ["push"]);
} else {
  console.log("版本号未变，跳过版本提交");
}

run(gh, [
  "release",
  "create",
  `v${version}`,
  artifact,
  signaturePath,
  "--title",
  `v${version}`,
  "--notes",
  notes,
]);
run(gh, [
  "release",
  "upload",
  `v${version}`,
  join(root, "latest.json"),
  "--clobber",
]);

console.log(`\n发布完成：v${version}`);
