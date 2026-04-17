import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, testID, ...props }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("view", { ...props, "data-testid": testID }, children),
}));

import { SidebarExecutionHostBadge } from "./sidebar-execution-host-badge";

describe("SidebarExecutionHostBadge", () => {
  test("renders nothing visible for local host but includes test id", () => {
    const markup = renderToStaticMarkup(<SidebarExecutionHostBadge host={{ kind: "local" }} />);

    expect(markup).toMatch(/^<view[^>]*data-testid="sidebar-execution-host-badge"[^>]*><\/view>$/);
  });
});
