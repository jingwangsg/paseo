import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@server/server/agent/agent-sdk-types";
import { buildAgentProviderBadge, resolveAgentProviderLabel } from "./agent-provider-display";

describe("agent provider display helpers", () => {
  it("uses built-in provider labels when snapshot metadata is unavailable", () => {
    expect(resolveAgentProviderLabel("claude")).toBe("Claude");
    expect(resolveAgentProviderLabel("codex")).toBe("Codex");
  });

  it("prefers provider snapshot labels for custom providers", () => {
    const snapshotEntries: ProviderSnapshotEntry[] = [
      {
        provider: "z-ai",
        status: "ready",
        label: "Z.AI",
        description: "Custom Claude-compatible provider",
        defaultModeId: null,
        modes: [],
      },
    ];

    expect(resolveAgentProviderLabel("z-ai", snapshotEntries)).toBe("Z.AI");
  });

  it("falls back to a readable humanized label for unknown providers", () => {
    expect(buildAgentProviderBadge({ provider: "acme-ai" })).toEqual({
      provider: "acme-ai",
      label: "Acme Ai",
    });
  });
});
