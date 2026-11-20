import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./clipboard";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const originalExecCommand = Object.getOwnPropertyDescriptor(
  document,
  "execCommand",
);

function setClipboard(value: Clipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function setExecCommand(value: ((command: string) => boolean) | undefined) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as { clipboard?: Clipboard }).clipboard;
  }
  if (originalExecCommand) {
    Object.defineProperty(document, "execCommand", originalExecCommand);
  } else {
    delete (document as { execCommand?: (command: string) => boolean })
      .execCommand;
  }
});

describe("copyText", () => {
  it("writes through the clipboard API", async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText } as unknown as Clipboard);

    expect(await copyText("晨间拉伸")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("晨间拉伸");
  });

  it("falls back to execCommand when the clipboard API rejects", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    setClipboard({ writeText } as unknown as Clipboard);
    const execCommand = vi.fn(() => true);
    setExecCommand(execCommand);

    expect(await copyText("买猫粮")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when both paths fail", async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn(() => false));

    expect(await copyText("交房租")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
