import { describe, expect, test } from "vitest";
import { rewriteRemoteSessionMessage } from "./remote-session-message.js";

describe("rewriteRemoteSessionMessage", () => {
  test("preserves the legacy agent, final, and terminal rewrite paths from session.ts", () => {
    const rewritten = rewriteRemoteSessionMessage("osmo_9000", {
      type: "wait_for_finish_response",
      agentId: "agent-top-level",
      payload: {
        agentId: "agent-in-payload",
        agent: {
          id: "agent-object-id",
          status: "idle",
        },
        final: {
          id: "final-agent-id",
          lastError: null,
        },
        terminalId: "terminal-payload-id",
        terminal: {
          id: "terminal-object-id",
          name: "shell",
        },
        requestId: "req-legacy",
        status: "idle",
        error: null,
      },
    });

    expect(rewritten).toEqual({
      type: "wait_for_finish_response",
      agentId: "ssh:osmo_9000:agent-top-level",
      payload: {
        agentId: "ssh:osmo_9000:agent-in-payload",
        agent: {
          id: "ssh:osmo_9000:agent-object-id",
          status: "idle",
        },
        final: {
          id: "ssh:osmo_9000:final-agent-id",
          lastError: null,
        },
        terminalId: "ssh:osmo_9000:terminal-payload-id",
        terminal: {
          id: "ssh:osmo_9000:terminal-object-id",
          name: "shell",
        },
        requestId: "req-legacy",
        status: "idle",
        error: null,
      },
    });
  });

  test("rewrites terminal and cwd payloads back into ssh namespaced identities", () => {
    const rewritten = rewriteRemoteSessionMessage("osmo_9000", {
      type: "list_terminals_response",
      payload: {
        cwd: "/mnt/data/repo",
        terminals: [{ id: "term-1", name: "shell" }],
        requestId: "req-1",
      },
    });

    expect(rewritten).toEqual({
      type: "list_terminals_response",
      payload: {
        cwd: "ssh:osmo_9000:/mnt/data/repo",
        terminals: [{ id: "ssh:osmo_9000:term-1", name: "shell" }],
        requestId: "req-1",
      },
    });
  });

  test("rewrites workspace descriptor ids, project ids, cwd, executionHost, and setupTerminalId", () => {
    const rewritten = rewriteRemoteSessionMessage("osmo_9000", {
      type: "create_paseo_worktree_response",
      payload: {
        workspace: {
          id: "/mnt/data/repo/.paseo/worktrees/feature-a",
          projectId: "/mnt/data/repo",
          projectDisplayName: "repo",
          projectRootPath: "/mnt/data/repo",
          projectKind: "git",
          workspaceKind: "worktree",
          name: "feature-a",
          status: "done",
          activityAt: null,
          diffStat: null,
          gitRuntime: null,
          githubRuntime: null,
          executionHost: { kind: "local" },
        },
        error: null,
        setupTerminalId: "term-setup",
        requestId: "req-2",
      },
    });

    expect(rewritten).toEqual({
      type: "create_paseo_worktree_response",
      payload: {
        workspace: {
          id: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
          projectId: "ssh:osmo_9000:/mnt/data/repo",
          projectDisplayName: "repo",
          projectRootPath: "/mnt/data/repo",
          projectKind: "git",
          workspaceKind: "worktree",
          name: "feature-a",
          status: "done",
          activityAt: null,
          diffStat: null,
          gitRuntime: null,
          githubRuntime: null,
          executionHost: { kind: "ssh", hostAlias: "osmo_9000" },
        },
        error: null,
        setupTerminalId: "ssh:osmo_9000:term-setup",
        requestId: "req-2",
      },
    });
  });

  test("rewrites archive responses and checkout payload path fields", () => {
    const archive = rewriteRemoteSessionMessage("osmo_9000", {
      type: "archive_workspace_response",
      payload: {
        requestId: "req-3",
        workspaceId: "/mnt/data/repo/.paseo/worktrees/feature-a",
        archivedAt: "2026-04-20T00:00:00.000Z",
        error: null,
      },
    });

    const checkout = rewriteRemoteSessionMessage("osmo_9000", {
      type: "checkout_status_response",
      payload: {
        cwd: "/mnt/data/repo",
        isGit: true,
        repoRoot: "/mnt/data/repo",
        currentBranch: "main",
        isDirty: true,
        baseRef: "origin/main",
        aheadBehind: { ahead: 0, behind: 0 },
        aheadOfOrigin: 0,
        behindOfOrigin: 0,
        hasRemote: true,
        remoteUrl: "git@github.com:acme/repo.git",
        isPaseoOwnedWorktree: false,
        error: null,
        requestId: "req-4",
      },
    });

    expect(archive).toEqual({
      type: "archive_workspace_response",
      payload: {
        requestId: "req-3",
        workspaceId: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
        archivedAt: "2026-04-20T00:00:00.000Z",
        error: null,
      },
    });
    expect((checkout as any).payload.cwd).toBe("ssh:osmo_9000:/mnt/data/repo");
    expect((checkout as any).payload.repoRoot).toBe("ssh:osmo_9000:/mnt/data/repo");
  });

  test("rewrites worktree list response paths back into ssh namespaced values", () => {
    const rewritten = rewriteRemoteSessionMessage("osmo_9000", {
      type: "paseo_worktree_list_response",
      payload: {
        repoRoot: "/mnt/data/repo",
        worktrees: [
          {
            worktreePath: "/mnt/data/repo/.paseo/worktrees/feature-a",
            createdAt: "2026-04-20T00:00:00.000Z",
            branchName: "feature-a",
            head: "abc123",
          },
        ],
        error: null,
        requestId: "req-worktrees",
      },
    });

    expect(rewritten).toEqual({
      type: "paseo_worktree_list_response",
      payload: {
        repoRoot: "ssh:osmo_9000:/mnt/data/repo",
        worktrees: [
          {
            worktreePath: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
            createdAt: "2026-04-20T00:00:00.000Z",
            branchName: "feature-a",
            head: "abc123",
          },
        ],
        error: null,
        requestId: "req-worktrees",
      },
    });
  });

  test("does not double-prefix values that are already ssh namespaced", () => {
    const rewritten = rewriteRemoteSessionMessage("osmo_9000", {
      type: "agent_update",
      agentId: "ssh:osmo_9000:agent-top-level",
      payload: {
        agentId: "ssh:osmo_9000:agent-in-payload",
        cwd: "ssh:osmo_9000:/mnt/data/repo",
        workspaceId: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
        projectId: "ssh:osmo_9000:/mnt/data/repo",
        terminalId: "ssh:osmo_9000:term-1",
        setupTerminalId: "ssh:osmo_9000:term-setup",
        workspace: {
          id: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
          projectId: "ssh:osmo_9000:/mnt/data/repo",
          executionHost: { kind: "local" },
        },
        agent: {
          id: "ssh:osmo_9000:agent-object-id",
        },
        final: {
          id: "ssh:osmo_9000:final-agent-id",
        },
        terminal: {
          id: "ssh:osmo_9000:terminal-object-id",
        },
        terminals: [{ id: "ssh:osmo_9000:term-2", name: "shell" }],
      },
    });

    expect(rewritten).toEqual({
      type: "agent_update",
      agentId: "ssh:osmo_9000:agent-top-level",
      payload: {
        agentId: "ssh:osmo_9000:agent-in-payload",
        cwd: "ssh:osmo_9000:/mnt/data/repo",
        workspaceId: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
        projectId: "ssh:osmo_9000:/mnt/data/repo",
        terminalId: "ssh:osmo_9000:term-1",
        setupTerminalId: "ssh:osmo_9000:term-setup",
        workspace: {
          id: "ssh:osmo_9000:/mnt/data/repo/.paseo/worktrees/feature-a",
          projectId: "ssh:osmo_9000:/mnt/data/repo",
          executionHost: { kind: "ssh", hostAlias: "osmo_9000" },
        },
        agent: {
          id: "ssh:osmo_9000:agent-object-id",
        },
        final: {
          id: "ssh:osmo_9000:final-agent-id",
        },
        terminal: {
          id: "ssh:osmo_9000:terminal-object-id",
        },
        terminals: [{ id: "ssh:osmo_9000:term-2", name: "shell" }],
      },
    });
  });
});
