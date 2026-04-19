import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, testID, style, ...props }: any) =>
    React.createElement("view", { ...props, "data-testid": testID, style }, children),
  Text: ({ children, ...props }: any) => React.createElement("span", props, children),
  Pressable: ({ children, onPress, ...props }: any) =>
    React.createElement("button", { ...props, onClick: onPress }, children),
}));

vi.mock("react-native-unistyles", () => {
  const mockTheme = {
    colors: {
      foregroundMuted: "#888",
      palette: {
        green: { 500: "#22c55e" },
        amber: { 500: "#f59e0b" },
        red: { 500: "#ef4444" },
      },
    },
    spacing: { 1: 4, 2: 8, 3: 12 },
    fontSize: { xs: 12 },
    fontWeight: { medium: "500" },
  };
  return {
    useUnistyles: () => ({ theme: mockTheme }),
    StyleSheet: {
      create: (fn: (theme: typeof mockTheme) => Record<string, any>) => fn(mockTheme),
    },
  };
});

import { SidebarHostGroup } from "./sidebar-host-group";

describe("SidebarHostGroup", () => {
  test("renders local group header", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias={null} status="ready" projectCount={3} />,
    );
    expect(markup).toContain("Local");
  });

  test("renders remote host header with alias and status", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="osmo_9000" status="ready" projectCount={2} />,
    );
    expect(markup).toContain("osmo_9000");
    // Ready status should not show a status label
    expect(markup).not.toContain("Ready");
  });

  test("renders unreachable state with status label", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="osmo_9000" status="unreachable" projectCount={0} />,
    );
    expect(markup).toContain("osmo_9000");
    expect(markup).toContain("Unreachable");
  });

  test("renders connecting state with status label", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="devbox" status="connecting" projectCount={1} />,
    );
    expect(markup).toContain("devbox");
    expect(markup).toContain("Connecting");
  });

  test("renders failed state with error message", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup
        hostAlias="osmo_9000"
        status="failed"
        projectCount={0}
        error="No pre-built binary for x64-linux"
      />,
    );
    expect(markup).toContain("osmo_9000");
    expect(markup).toContain("Failed");
    expect(markup).toContain("No pre-built binary for x64-linux");
    expect(markup).toContain("Tap to retry");
  });

  test("calls onRetry when tapped in failed state", () => {
    const onRetry = vi.fn();
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="osmo_9000" status="failed" projectCount={0} onRetry={onRetry} />,
    );
    expect(markup).toContain("Tap to retry");
  });

  test("does not show retry hint when status is ready", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="osmo_9000" status="ready" projectCount={2} />,
    );
    expect(markup).not.toContain("Tap to retry");
    expect(markup).not.toContain("Failed");
  });

  test("shows retry hint for unreachable state", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup
        hostAlias="osmo_9000"
        status="unreachable"
        projectCount={0}
        error="SSH connection failed"
      />,
    );
    expect(markup).toContain("Unreachable");
    expect(markup).toContain("SSH connection failed");
    expect(markup).toContain("Tap to retry");
  });

  test("does not show error text when error is null", () => {
    const markup = renderToStaticMarkup(
      <SidebarHostGroup hostAlias="osmo_9000" status="failed" projectCount={0} error={null} />,
    );
    expect(markup).toContain("Failed");
    expect(markup).toContain("Tap to retry");
  });
});
