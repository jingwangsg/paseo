import { describe, expect, test } from "vitest";
import { rewriteRemoteSessionMessage } from "./remote-session-message.js";

describe("rewriteRemoteSessionMessage", () => {
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

  test("rewrites archive responses and checkout payload cwd values", () => {
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
  });
});
