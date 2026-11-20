import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyToast } from "./CopyToast";
import { useCopyFeedback } from "./useCopyFeedback";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const originalExecCommand = Object.getOwnPropertyDescriptor(
  document,
  "execCommand",
);

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function Harness() {
  const { message, error, copy } = useCopyFeedback();
  return (
    <>
      <button type="button" onClick={() => void copy("晨间拉伸")}>
        copy
      </button>
      <CopyToast message={message} error={error} />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("copy feedback", () => {
  it("shows a success toast and hides it after 1.5 seconds", async () => {
    setClipboard(vi.fn(async () => undefined));
    render(<Harness />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "copy" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a failure toast when copying fails", async () => {
    setClipboard(
      vi.fn(async () => {
        throw new Error("denied");
      }),
    );
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    render(<Harness />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "copy" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("复制失败");
    expect(screen.getByRole("status")).toHaveAttribute("data-error", "true");
  });
});
