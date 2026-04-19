import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, testID, style, ...props }: any) =>
    React.createElement("view", { ...props, "data-testid": testID, style }, children),
  Text: ({ children, ...props }: any) => React.createElement("span", props, children),
  Pressable: ({ children, onPress, testID, style, ...props }: any) =>
    React.createElement(
      "button",
      { ...props, "data-testid": testID, onClick: onPress, style },
      children,
    ),
}));

vi.mock("react-native-unistyles", () => {
  const mockTheme = {
    colors: {
      foreground: "#fff",
      foregroundMuted: "#888",
      surface2: "#111",
      border: "#333",
    },
    spacing: { 1: 4, 4: 16 },
    borderRadius: { xl: 16 },
    fontSize: { base: 16, sm: 14 },
    fontWeight: { normal: "400" },
  };
  return {
    useUnistyles: () => ({ theme: mockTheme }),
    StyleSheet: {
      create: (fn: (theme: typeof mockTheme) => Record<string, any>) => fn(mockTheme),
    },
  };
});

vi.mock("lucide-react-native", () => ({
  Link2: () => React.createElement("icon-link"),
  Terminal: () => React.createElement("icon-terminal"),
}));

vi.mock("./adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({ children, testID }: any) =>
    React.createElement("section", { "data-testid": testID }, children),
}));

import { AddHostMethodModal } from "./add-host-method-modal";

describe("AddHostMethodModal", () => {
  test("always renders the direct connection option", () => {
    const markup = renderToStaticMarkup(
      <AddHostMethodModal visible onClose={() => {}} onDirectConnection={() => {}} />,
    );

    expect(markup).toContain("Direct connection");
  });

  test("renders the SSH host option on native when an SSH handler is available", () => {
    const markup = renderToStaticMarkup(
      <AddHostMethodModal
        visible
        onClose={() => {}}
        onDirectConnection={() => {}}
        onSshHost={() => {}}
      />,
    );

    expect(markup).toContain("SSH host");
  });

  test("does not render the SSH host option when no SSH handler is provided", () => {
    const markup = renderToStaticMarkup(
      <AddHostMethodModal visible onClose={() => {}} onDirectConnection={() => {}} />,
    );

    expect(markup).not.toContain("SSH host");
  });
});
