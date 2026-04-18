import { parseAgentKey } from "@/utils/new-agent-routing";
import { useSessionStore } from "@/stores/session-store";

function resolveModeCycleTarget(input: {
  selectedAgentId: string | undefined;
  activeServerId: string | null;
}): { serverId: string; agentId: string } | null {
  const selectedTarget = parseAgentKey(input.selectedAgentId);
  if (selectedTarget) {
    return selectedTarget;
  }

  if (!input.activeServerId) {
    return null;
  }

  const state = useSessionStore.getState();
  const focusedAgentId = state?.sessions?.[input.activeServerId]?.focusedAgentId;
  if (!focusedAgentId) {
    return null;
  }

  return { serverId: input.activeServerId, agentId: focusedAgentId };
}

export function runCycleAgentModeShortcut(input: {
  selectedAgentId: string | undefined;
  activeServerId: string | null;
}): { didCycle: boolean; shouldConsume: boolean } {
  return {
    didCycle: cycleAgentMode(input),
    shouldConsume: true,
  };
}

/**
 * Cycle the selected agent's permission mode to the next available mode.
 * Returns true if the mode was cycled, false otherwise.
 */
export function cycleAgentMode(input: {
  selectedAgentId: string | undefined;
  activeServerId: string | null;
}): boolean {
  const target = resolveModeCycleTarget(input);
  if (!target) return false;

  const state = useSessionStore.getState();
  const serverSession = state.sessions[target.serverId];
  if (!serverSession) return false;

  const agent = serverSession.agents?.get(target.agentId);
  if (!agent) return false;

  const client = serverSession.client;
  if (!client) return false;

  const modes = agent.availableModes;
  if (!modes || modes.length <= 1) return false;

  const currentIndex = modes.findIndex((m) => m.id === agent.currentModeId);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  if (!nextMode) return false;

  void client.setAgentMode(target.agentId, nextMode.id).catch((error) => {
    console.warn("[cycleAgentMode] setAgentMode failed", error);
  });
  return true;
}
