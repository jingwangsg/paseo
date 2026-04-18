import { describe, expect, it } from "vitest";
import { createWorkspaceTabPresentation } from "./workspace-tab-presentation.utils";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { PanelDescriptor } from "@/panels/panel-registry";

const TestIcon = () => null;

function createDescriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return {
    label: "Example",
    subtitle: "",
    titleState: "ready",
    icon: TestIcon,
    statusBucket: null,
    ...overrides,
  };
}

describe("createWorkspaceTabPresentation", () => {
  it("keeps provider badge metadata for agent tabs", () => {
    const tab: WorkspaceTabDescriptor = {
      key: "agent_123",
      tabId: "agent_123",
      kind: "agent",
      target: { kind: "agent", agentId: "agent-123" },
    };

    const presentation = createWorkspaceTabPresentation({
      tab,
      descriptor: createDescriptor({
        providerBadge: {
          provider: "codex",
          label: "Codex",
        },
      }),
    });

    expect(presentation.providerBadge).toEqual({
      provider: "codex",
      label: "Codex",
    });
  });

  it("drops provider badge metadata for non-agent tabs", () => {
    const tab: WorkspaceTabDescriptor = {
      key: "draft_123",
      tabId: "draft_123",
      kind: "draft",
      target: { kind: "draft", draftId: "draft-123" },
    };

    const presentation = createWorkspaceTabPresentation({
      tab,
      descriptor: createDescriptor({
        providerBadge: {
          provider: "codex",
          label: "Codex",
        },
      }),
    });

    expect(presentation.providerBadge).toBeNull();
  });
});
