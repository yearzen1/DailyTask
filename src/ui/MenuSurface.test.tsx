import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MenuHeading,
  MenuItem,
  MenuSeparator,
  MenuSurface,
} from "./MenuSurface";

describe("MenuSurface", () => {
  it("renders a labelled menu with heading and items", () => {
    const onClick = vi.fn();

    render(
      <MenuSurface label="任务操作" data-testid="menu">
        <MenuHeading>跑步</MenuHeading>
        <MenuItem onClick={onClick}>已完成</MenuItem>
        <MenuSeparator />
        <MenuItem danger>删除</MenuItem>
      </MenuSurface>,
    );

    expect(screen.getByRole("menu", { name: "任务操作" })).toBeInTheDocument();
    expect(screen.getByText("跑步")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "已完成" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveClass(
      "text-[var(--color-missed)]",
    );
    expect(
      screen.getByTestId("menu").querySelector("[data-menu-separator]"),
    ).toBeInTheDocument();
  });
});
