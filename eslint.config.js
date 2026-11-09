import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

const eventPattern = {
  group: ["@tauri-apps/api/event"],
  message: "事件 API 只允许 src/shared/events.ts 使用，其余走类型化封装。",
};

const sqlPattern = {
  group: ["@tauri-apps/plugin-sql"],
  message: "SQL 插件只允许 src/db/* 使用。",
};

const directDbPattern = {
  group: ["**/db", "**/db/*"],
  message: "view 必须通过 store 访问数据，不能直接 import db/*。",
};

const deleteTokenPattern = {
  group: ["**/shared/deleteConfirmation", "**/shared/deleteConfirmation.ts"],
  message: "删除确认令牌只能由 ui/ConfirmDeleteButton 构造，view 不允许导入。",
};

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src-tauri",
      "design",
      "coverage",
      ".npm-cache",
      ".toolchain",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            { target: "./src/domain", from: "./src", except: ["./domain"] },
            {
              target: "./src/ui",
              from: "./src",
              except: [
                "./ui",
                "./shared",
                "./domain/types",
                "./domain/types.ts",
              ],
            },
            { target: "./src/db", from: "./src", except: ["./db", "./domain", "./shared"] },
            {
              target: "./src/stores",
              from: "./src",
              except: ["./stores", "./db", "./domain", "./shared"],
            },
            {
              target: "./src/windows",
              from: "./src",
              except: ["./windows", "./stores", "./domain", "./ui", "./shared"],
            },
          ],
        },
      ],
      "no-restricted-imports": ["error", { patterns: [eventPattern, sqlPattern] }],
    },
  },

  {
    files: ["src/shared/events.ts", "src/shared/events.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sqlPattern] }],
    },
  },

  {
    files: ["src/db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [eventPattern] }],
    },
  },

  {
    files: ["src/windows/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [directDbPattern, deleteTokenPattern, eventPattern, sqlPattern] },
      ],
    },
  },

  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
