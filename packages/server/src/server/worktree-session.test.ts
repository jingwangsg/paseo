import { describe, expect, test, vi } from "vitest";

vi.mock("../utils/worktree.js", () => ({
  deletePaseoWorktree: vi.fn(async () => {}),
  resolvePaseoWorktreeRootForCwd: vi.fn(async () => null),
}));

import { archivePaseoWorktree } from "./worktree-session.js";

describe("archivePaseoWorktree", () => {
  test("emits workspace updates for archived workspace ids", async () => {
    const updatedWorkspaceIds: string[][] = [];

    await archivePaseoWorktree(
      {
        paseoHome: "/tmp/paseo",
        agentManager: {
          listAgents: () => [
            {
              id: "agent-1",
              cwd: "/tmp/repo/.paseo/worktrees/feature-a/app",
            },
          ],
          closeAgent: async () => {},
        },
        agentStorage: {
          list: async () => [
            {
              id: "agent-1",
              cwd: "/tmp/repo/.paseo/worktrees/feature-a/app",
            },
          ],
          remove: async () => {},
        },
        archiveWorkspaceRecord: async () => {},
        emit: () => {},
        emitWorkspaceUpdatesForWorkspaceIds: async (workspaceIds: Iterable<string>) => {
          updatedWorkspaceIds.push(Array.from(workspaceIds));
        },
        emitWorkspaceUpdatesForCwds: async () => {},
        isPathWithinRoot: (rootPath: string, candidatePath: string) =>
          candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`),
        killTerminalsUnderPath: async () => {},
      } as any,
      {
        targetPath: "/tmp/repo/.paseo/worktrees/feature-a",
        repoRoot: "/tmp/repo",
        requestId: "req-archive-worktree",
      },
    );

    expect(updatedWorkspaceIds).toEqual([
      ["/tmp/repo/.paseo/worktrees/feature-a", "/tmp/repo/.paseo/worktrees/feature-a/app"],
    ]);
  });
});
