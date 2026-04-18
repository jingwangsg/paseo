import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionState } from "@/stores/session-store";

// Mock the session store before importing the module under test
const mockGetState = vi.fn();
vi.mock("@/stores/session-store", () => ({
  useSessionStore: { getState: () => mockGetState() },
}));

import * as cycleAgentModeModule from "./cycle-agent-mode";

const { cycleAgentMode, runCycleAgentModeShortcut } = cycleAgentModeModule;

function makeAgent(overrides: {
  currentModeId?: string | null;
  availableModes?: Array<{ id: string; label: string }>;
}) {
  return {
    id: "agent1",
    currentModeId: overrides.currentModeId ?? "mode-a",
    availableModes: overrides.availableModes ?? [],
  };
}

function makeSession(overrides: {
  agents?: Map<string, ReturnType<typeof makeAgent>>;
  client?: { setAgentMode: ReturnType<typeof vi.fn> } | null;
  focusedAgentId?: string | null;
}) {
  return {
    agents: overrides.agents ?? new Map(),
    client: overrides.client ?? null,
    focusedAgentId: overrides.focusedAgentId ?? null,
  } as unknown as SessionState;
}

describe("cycleAgentMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when selectedAgentId is undefined", () => {
    expect(cycleAgentMode({ selectedAgentId: undefined, activeServerId: "s1" })).toBe(false);
  });

  it("returns false when no server session exists", () => {
    mockGetState.mockReturnValue({ sessions: {} });
    expect(cycleAgentMode({ selectedAgentId: "server1:agent1", activeServerId: "server1" })).toBe(
      false,
    );
  });

  it("returns false when agent has <= 1 mode", () => {
    const agent = makeAgent({
      availableModes: [{ id: "mode-a", label: "A" }],
    });
    const setAgentMode = vi.fn().mockResolvedValue(undefined);
    const session = makeSession({
      agents: new Map([["agent1", agent]]),
      client: { setAgentMode },
    });
    mockGetState.mockReturnValue({ sessions: { server1: session } });

    expect(cycleAgentMode({ selectedAgentId: "server1:agent1", activeServerId: "server1" })).toBe(
      false,
    );
    expect(setAgentMode).not.toHaveBeenCalled();
  });

  it("resolves composite selectedAgentId and calls setAgentMode with agentId", () => {
    const agent = makeAgent({
      currentModeId: "mode-a",
      availableModes: [
        { id: "mode-a", label: "A" },
        { id: "mode-b", label: "B" },
      ],
    });
    const setAgentMode = vi.fn().mockResolvedValue(undefined);
    const session = makeSession({
      agents: new Map([["agent1", agent]]),
      client: { setAgentMode },
    });
    mockGetState.mockReturnValue({ sessions: { server1: session } });

    const result = cycleAgentMode({
      selectedAgentId: "server1:agent1",
      activeServerId: "server1",
    });

    expect(result).toBe(true);
    // Key assertion: setAgentMode receives just "agent1", not "server1:agent1"
    expect(setAgentMode).toHaveBeenCalledWith("agent1", "mode-b");
  });

  it("falls back to the workspace focused agent when selectedAgentId is unavailable", () => {
    const agent = makeAgent({
      currentModeId: "mode-a",
      availableModes: [
        { id: "mode-a", label: "A" },
        { id: "mode-b", label: "B" },
      ],
    });
    const setAgentMode = vi.fn().mockResolvedValue(undefined);
    const session = makeSession({
      agents: new Map([["agent1", agent]]),
      client: { setAgentMode },
      focusedAgentId: "agent1",
    });
    mockGetState.mockReturnValue({ sessions: { server1: session } });

    const result = cycleAgentMode({
      selectedAgentId: undefined,
      activeServerId: "server1",
    });

    expect(result).toBe(true);
    expect(setAgentMode).toHaveBeenCalledWith("agent1", "mode-b");
  });

  it("wraps around to the first mode after the last", () => {
    const agent = makeAgent({
      currentModeId: "mode-c",
      availableModes: [
        { id: "mode-a", label: "A" },
        { id: "mode-b", label: "B" },
        { id: "mode-c", label: "C" },
      ],
    });
    const setAgentMode = vi.fn().mockResolvedValue(undefined);
    const session = makeSession({
      agents: new Map([["agent1", agent]]),
      client: { setAgentMode },
    });
    mockGetState.mockReturnValue({ sessions: { server1: session } });

    const result = cycleAgentMode({
      selectedAgentId: "server1:agent1",
      activeServerId: "server1",
    });

    expect(result).toBe(true);
    expect(setAgentMode).toHaveBeenCalledWith("agent1", "mode-a");
  });

  it("returns false when client is null", () => {
    const agent = makeAgent({
      availableModes: [
        { id: "mode-a", label: "A" },
        { id: "mode-b", label: "B" },
      ],
    });
    const session = makeSession({
      agents: new Map([["agent1", agent]]),
      client: null,
    });
    mockGetState.mockReturnValue({ sessions: { server1: session } });

    expect(cycleAgentMode({ selectedAgentId: "server1:agent1", activeServerId: "server1" })).toBe(
      false,
    );
  });

  it("reserves the Shift+Tab shortcut even when there is no active agent to cycle", () => {
    mockGetState.mockReturnValue({ sessions: {} });

    const result = runCycleAgentModeShortcut({
      selectedAgentId: undefined,
      activeServerId: "server1",
    });

    expect(result).toEqual({ didCycle: false, shouldConsume: true });
  });
});
