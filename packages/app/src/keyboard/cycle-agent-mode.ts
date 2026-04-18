import { parseAgentKey } from "@/utils/new-agent-routing";
import { useSessionStore } from "@/stores/session-store";

/**
 * Cycle the selected agent's permission mode to the next available mode.
 * Returns true if the mode was cycled (caller should preventDefault), false otherwise.
 */
export function cycleAgentMode(input: {
  selectedAgentId: string | undefined;
  activeServerId: string | null;
}): boolean {
  const parsed = parseAgentKey(input.selectedAgentId);
  if (!parsed) return false;

  const state = useSessionStore.getState();
  const serverSession = state.sessions[parsed.serverId];
  if (!serverSession) return false;

  const agent = serverSession.agents?.get(parsed.agentId);
  if (!agent) return false;

  const client = serverSession.client;
  if (!client) return false;

  const modes = agent.availableModes;
  if (!modes || modes.length <= 1) return false;

  const currentIndex = modes.findIndex((m) => m.id === agent.currentModeId);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  if (!nextMode) return false;

  void client.setAgentMode(parsed.agentId, nextMode.id).catch((error) => {
    console.warn("[cycleAgentMode] setAgentMode failed", error);
  });
  return true;
}
