import { describe, expect, it } from "vitest";

import { getAgentProviderDefinition, getModeVisuals } from "./provider-manifest.js";

describe("provider-manifest Claude modes", () => {
  it("does not expose Claude auto mode in the static manifest", () => {
    const claude = getAgentProviderDefinition("claude");

    expect(claude.modes.map((mode) => mode.id)).not.toContain("auto");
  });

  it("still resolves visuals for Claude auto mode through the built-in fallback", () => {
    const claude = getAgentProviderDefinition("claude");

    expect(getModeVisuals("claude", "auto", [claude])).toEqual({
      icon: "ShieldAlert",
      colorTier: "moderate",
    });
  });
});
