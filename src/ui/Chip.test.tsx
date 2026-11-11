import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders text and semantic variant classes", () => {
    render(
      <Chip variant="warning" data-testid="deadline">
        11/20 · 还差 5 天
      </Chip>,
    );

    const chip = screen.getByTestId("deadline");
    expect(chip).toHaveTextContent("11/20 · 还差 5 天");
    expect(chip).toHaveClass("text-[var(--color-warning)]");
  });

  it("switches to the compact size", () => {
    render(
      <Chip size="sm" data-testid="chip">
        5/8
      </Chip>,
    );

    expect(screen.getByTestId("chip")).toHaveClass("h-4");
  });
});
