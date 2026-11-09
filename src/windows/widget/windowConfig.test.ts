import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CAPSULE_HEIGHT, CAPSULE_WIDTH } from "./capsule";

interface WindowConfig {
  label: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  url?: string;
}

const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as {
    app: { windows: WindowConfig[] };
  };

describe("widget window config", () => {
  it("keeps the main window size budget", () => {
    const main = readJson("src-tauri/tauri.conf.json").app.windows.find(
      (window) => window.label === "main",
    );

    expect(main).toMatchObject({
      width: 1080,
      height: 720,
      minWidth: 900,
      minHeight: 640,
    });
  });

  it("creates the widget on demand instead of keeping a second WebView alive", () => {
    const widget = readJson("src-tauri/tauri.conf.json").app.windows.find(
      (window) => window.label === "widget",
    );
    const rust = readFileSync(
      resolve(process.cwd(), "src-tauri/src/lib.rs"),
      "utf8",
    );

    expect(widget).toBeUndefined();
    expect(rust).toContain('WIDGET_WINDOW,\n            WebviewUrl::App("index.html?window=widget".into())');
    expect(rust).toContain(`.inner_size(${CAPSULE_WIDTH}.0, ${CAPSULE_HEIGHT}.0)`);
    expect(rust).toContain(".resizable(false)");
    expect(rust).toContain(".decorations(false)");
    expect(rust).toContain(".transparent(true)");
    expect(rust).toContain(".always_on_top(true)");
    expect(rust).toContain(".skip_taskbar(true)");
  });

  it("grants the widget window the same capabilities as main", () => {
    const capabilities = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src-tauri/capabilities/default.json"),
        "utf8",
      ),
    ) as { windows: string[] };

    expect(capabilities.windows).toEqual(["main", "widget"]);
  });
});
