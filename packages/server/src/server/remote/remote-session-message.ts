import { isSshNamespacedId, rewriteRemoteAgentId } from "./remote-agent-proxy.js";

function rewriteMirroredId(hostAlias: string, value: string): string {
  return isSshNamespacedId(value) ? value : rewriteRemoteAgentId(hostAlias, value);
}

export function rewriteRemoteSessionMessage(
  hostAlias: string,
  msg: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...msg };

  if (typeof result.agentId === "string") {
    result.agentId = rewriteMirroredId(hostAlias, result.agentId);
  }

  if (!result.payload || typeof result.payload !== "object") {
    return result;
  }

  const payload = { ...(result.payload as Record<string, unknown>) };

  if (typeof payload.agentId === "string") {
    payload.agentId = rewriteMirroredId(hostAlias, payload.agentId);
  }

  if (typeof payload.cwd === "string") {
    payload.cwd = rewriteMirroredId(hostAlias, payload.cwd);
  }

  if (typeof payload.workspaceId === "string") {
    payload.workspaceId = rewriteMirroredId(hostAlias, payload.workspaceId);
  }

  if (typeof payload.repoRoot === "string") {
    payload.repoRoot = rewriteMirroredId(hostAlias, payload.repoRoot);
  }

  if (typeof payload.projectId === "string") {
    payload.projectId = rewriteMirroredId(hostAlias, payload.projectId);
  }

  if (typeof payload.terminalId === "string") {
    payload.terminalId = rewriteMirroredId(hostAlias, payload.terminalId);
  }

  if (typeof payload.setupTerminalId === "string") {
    payload.setupTerminalId = rewriteMirroredId(hostAlias, payload.setupTerminalId);
  }

  if (payload.workspace && typeof payload.workspace === "object") {
    const workspace = { ...(payload.workspace as Record<string, unknown>) };
    if (typeof workspace.id === "string") {
      workspace.id = rewriteMirroredId(hostAlias, workspace.id);
    }
    if (typeof workspace.projectId === "string") {
      workspace.projectId = rewriteMirroredId(hostAlias, workspace.projectId);
    }
    workspace.executionHost = { kind: "ssh", hostAlias };
    payload.workspace = workspace;
  }

  if (payload.agent && typeof payload.agent === "object") {
    const agent = { ...(payload.agent as Record<string, unknown>) };
    if (typeof agent.id === "string") {
      agent.id = rewriteMirroredId(hostAlias, agent.id);
    }
    payload.agent = agent;
  }

  if (payload.final && typeof payload.final === "object") {
    const final = { ...(payload.final as Record<string, unknown>) };
    if (typeof final.id === "string") {
      final.id = rewriteMirroredId(hostAlias, final.id);
    }
    payload.final = final;
  }

  if (payload.terminal && typeof payload.terminal === "object") {
    const terminal = { ...(payload.terminal as Record<string, unknown>) };
    if (typeof terminal.id === "string") {
      terminal.id = rewriteMirroredId(hostAlias, terminal.id);
    }
    payload.terminal = terminal;
  }

  if (Array.isArray(payload.terminals)) {
    payload.terminals = payload.terminals.map((terminalValue) => {
      if (!terminalValue || typeof terminalValue !== "object") {
        return terminalValue;
      }
      const terminal = { ...(terminalValue as Record<string, unknown>) };
      if (typeof terminal.id === "string") {
        terminal.id = rewriteMirroredId(hostAlias, terminal.id);
      }
      return terminal;
    });
  }

  if (Array.isArray(payload.worktrees)) {
    payload.worktrees = payload.worktrees.map((worktreeValue) => {
      if (!worktreeValue || typeof worktreeValue !== "object") {
        return worktreeValue;
      }
      const worktree = { ...(worktreeValue as Record<string, unknown>) };
      if (typeof worktree.worktreePath === "string") {
        worktree.worktreePath = rewriteMirroredId(hostAlias, worktree.worktreePath);
      }
      return worktree;
    });
  }

  result.payload = payload;
  return result;
}
