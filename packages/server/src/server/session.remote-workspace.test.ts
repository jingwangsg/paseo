import { beforeEach, describe, expect, test, vi } from "vitest";

const { createRemoteAgentProxyMock } = vi.hoisted(() => ({
  createRemoteAgentProxyMock: vi.fn(),
}));

vi.mock("./remote/remote-agent-proxy.js", async () => {
  const actual = await vi.importActual<typeof import("./remote/remote-agent-proxy.js")>(
    "./remote/remote-agent-proxy.js",
  );

  return {
    ...actual,
    createRemoteAgentProxy: createRemoteAgentProxyMock,
  };
});

vi.mock("@getpaseo/highlight", () => ({
  highlightCode: vi.fn(),
  isLanguageSupported: vi.fn(() => false),
}));

import { Session } from "./session.js";

const HOST_ALIAS = "osmo_9000";
const SSH_CWD = "ssh:osmo_9000:/mnt/data/repo";
const REMOTE_CWD = "/mnt/data/repo";
const HOST_ALIAS_2 = "osmo_9001";
const SSH_CWD_2 = "ssh:osmo_9001:/srv/repo";
const REMOTE_CWD_2 = "/srv/repo";
const REMOTE_WORKTREE_ID = "/mnt/data/repo/.paseo/worktrees/feature-a";
const SETUP_TERMINAL_ID = "term-setup";
const SSH_WORKTREE_PATH = `ssh:${HOST_ALIAS}:${REMOTE_WORKTREE_ID}`;
const SSH_WORKSPACE_ID = `ssh:${HOST_ALIAS}:${REMOTE_WORKTREE_ID}`;

const FORWARDING_CASES = [
  {
    name: "subscribe_terminals_request",
    message: { type: "subscribe_terminals_request", cwd: SSH_CWD },
    expected: { type: "subscribe_terminals_request", cwd: REMOTE_CWD },
  },
  {
    name: "unsubscribe_terminals_request",
    message: { type: "unsubscribe_terminals_request", cwd: SSH_CWD },
    expected: { type: "unsubscribe_terminals_request", cwd: REMOTE_CWD },
  },
  {
    name: "subscribe_checkout_diff_request",
    message: {
      type: "subscribe_checkout_diff_request",
      subscriptionId: "sub-diff",
      cwd: SSH_CWD,
      compare: { mode: "working" },
      requestId: "req-diff",
    },
    expected: {
      type: "subscribe_checkout_diff_request",
      subscriptionId: "sub-diff",
      cwd: REMOTE_CWD,
      compare: { mode: "working" },
      requestId: "req-diff",
    },
  },
  {
    name: "checkout_commit_request",
    message: {
      type: "checkout_commit_request",
      cwd: SSH_CWD,
      message: "ship it",
      addAll: true,
      requestId: "req-commit",
    },
    expected: {
      type: "checkout_commit_request",
      cwd: REMOTE_CWD,
      message: "ship it",
      addAll: true,
      requestId: "req-commit",
    },
  },
  {
    name: "checkout_merge_request",
    message: {
      type: "checkout_merge_request",
      cwd: SSH_CWD,
      baseRef: "main",
      strategy: "squash",
      requireCleanTarget: true,
      requestId: "req-merge",
    },
    expected: {
      type: "checkout_merge_request",
      cwd: REMOTE_CWD,
      baseRef: "main",
      strategy: "squash",
      requireCleanTarget: true,
      requestId: "req-merge",
    },
  },
  {
    name: "checkout_merge_from_base_request",
    message: {
      type: "checkout_merge_from_base_request",
      cwd: SSH_CWD,
      baseRef: "main",
      requireCleanTarget: false,
      requestId: "req-merge-base",
    },
    expected: {
      type: "checkout_merge_from_base_request",
      cwd: REMOTE_CWD,
      baseRef: "main",
      requireCleanTarget: false,
      requestId: "req-merge-base",
    },
  },
  {
    name: "checkout_pull_request",
    message: { type: "checkout_pull_request", cwd: SSH_CWD, requestId: "req-pull" },
    expected: { type: "checkout_pull_request", cwd: REMOTE_CWD, requestId: "req-pull" },
  },
  {
    name: "checkout_push_request",
    message: { type: "checkout_push_request", cwd: SSH_CWD, requestId: "req-push" },
    expected: { type: "checkout_push_request", cwd: REMOTE_CWD, requestId: "req-push" },
  },
  {
    name: "checkout_pr_create_request",
    message: {
      type: "checkout_pr_create_request",
      cwd: SSH_CWD,
      title: "Feature",
      body: "Body",
      baseRef: "main",
      requestId: "req-pr-create",
    },
    expected: {
      type: "checkout_pr_create_request",
      cwd: REMOTE_CWD,
      title: "Feature",
      body: "Body",
      baseRef: "main",
      requestId: "req-pr-create",
    },
  },
  {
    name: "checkout_pr_status_request",
    message: { type: "checkout_pr_status_request", cwd: SSH_CWD, requestId: "req-pr-status" },
    expected: { type: "checkout_pr_status_request", cwd: REMOTE_CWD, requestId: "req-pr-status" },
  },
  {
    name: "checkout_switch_branch_request",
    message: {
      type: "checkout_switch_branch_request",
      cwd: SSH_CWD,
      branch: "feature-b",
      requestId: "req-switch",
    },
    expected: {
      type: "checkout_switch_branch_request",
      cwd: REMOTE_CWD,
      branch: "feature-b",
      requestId: "req-switch",
    },
  },
  {
    name: "stash_save_request",
    message: {
      type: "stash_save_request",
      cwd: SSH_CWD,
      branch: "feature-b",
      requestId: "req-stash-save",
    },
    expected: {
      type: "stash_save_request",
      cwd: REMOTE_CWD,
      branch: "feature-b",
      requestId: "req-stash-save",
    },
  },
  {
    name: "stash_pop_request",
    message: {
      type: "stash_pop_request",
      cwd: SSH_CWD,
      stashIndex: 2,
      requestId: "req-stash-pop",
    },
    expected: {
      type: "stash_pop_request",
      cwd: REMOTE_CWD,
      stashIndex: 2,
      requestId: "req-stash-pop",
    },
  },
  {
    name: "stash_list_request",
    message: {
      type: "stash_list_request",
      cwd: SSH_CWD,
      paseoOnly: false,
      requestId: "req-stash-list",
    },
    expected: {
      type: "stash_list_request",
      cwd: REMOTE_CWD,
      paseoOnly: false,
      requestId: "req-stash-list",
    },
  },
  {
    name: "validate_branch_request",
    message: {
      type: "validate_branch_request",
      cwd: SSH_CWD,
      branchName: "main",
      requestId: "req-validate",
    },
    expected: {
      type: "validate_branch_request",
      cwd: REMOTE_CWD,
      branchName: "main",
      requestId: "req-validate",
    },
  },
  {
    name: "branch_suggestions_request",
    message: {
      type: "branch_suggestions_request",
      cwd: SSH_CWD,
      query: "fea",
      limit: 5,
      requestId: "req-branch-suggest",
    },
    expected: {
      type: "branch_suggestions_request",
      cwd: REMOTE_CWD,
      query: "fea",
      limit: 5,
      requestId: "req-branch-suggest",
    },
  },
  {
    name: "paseo_worktree_list_request",
    message: {
      type: "paseo_worktree_list_request",
      cwd: SSH_CWD,
      repoRoot: "/keep/repo-root",
      requestId: "req-worktree-list",
    },
    expected: {
      type: "paseo_worktree_list_request",
      cwd: REMOTE_CWD,
      repoRoot: "/keep/repo-root",
      requestId: "req-worktree-list",
    },
  },
  {
    name: "paseo_worktree_archive_request",
    message: {
      type: "paseo_worktree_archive_request",
      worktreePath: SSH_WORKTREE_PATH,
      repoRoot: "/keep/repo-root",
      branchName: "feature-a",
      requestId: "req-worktree-archive",
    },
    expected: {
      type: "paseo_worktree_archive_request",
      worktreePath: REMOTE_WORKTREE_ID,
      repoRoot: "/keep/repo-root",
      branchName: "feature-a",
      requestId: "req-worktree-archive",
    },
  },
  {
    name: "project_icon_request",
    message: { type: "project_icon_request", cwd: SSH_CWD, requestId: "req-icon" },
    expected: { type: "project_icon_request", cwd: REMOTE_CWD, requestId: "req-icon" },
  },
  {
    name: "archive_workspace_request",
    message: {
      type: "archive_workspace_request",
      workspaceId: SSH_WORKSPACE_ID,
      requestId: "req-archive-workspace",
    },
    expected: {
      type: "archive_workspace_request",
      workspaceId: REMOTE_WORKTREE_ID,
      requestId: "req-archive-workspace",
    },
  },
] as const;

const REMOTE_UNAVAILABLE_CASES = [
  {
    name: "checkout_status_request",
    message: {
      type: "checkout_status_request",
      cwd: SSH_CWD,
      requestId: "req-status",
    },
    expected: {
      type: "checkout_status_response",
      payload: {
        cwd: SSH_CWD,
        isGit: false,
        repoRoot: null,
        currentBranch: null,
        isDirty: null,
        baseRef: null,
        aheadBehind: null,
        aheadOfOrigin: null,
        behindOfOrigin: null,
        hasRemote: false,
        remoteUrl: null,
        isPaseoOwnedWorktree: false,
        error: { code: "UNKNOWN", message: "Remote host is not connected" },
        requestId: "req-status",
      },
    },
  },
  {
    name: "subscribe_checkout_diff_request",
    message: {
      type: "subscribe_checkout_diff_request",
      subscriptionId: "sub-diff",
      cwd: SSH_CWD,
      compare: { mode: "working" },
      requestId: "req-diff",
    },
    expected: {
      type: "subscribe_checkout_diff_response",
      payload: {
        subscriptionId: "sub-diff",
        cwd: SSH_CWD,
        files: [],
        error: { code: "UNKNOWN", message: "Remote host is not connected" },
        requestId: "req-diff",
      },
    },
  },
  {
    name: "checkout_commit_request",
    message: {
      type: "checkout_commit_request",
      cwd: SSH_CWD,
      requestId: "req-commit",
    },
    expected: {
      type: "checkout_commit_response",
      payload: {
        cwd: SSH_CWD,
        success: false,
        error: { code: "UNKNOWN", message: "Remote host is not connected" },
        requestId: "req-commit",
      },
    },
  },
  {
    name: "validate_branch_request",
    message: {
      type: "validate_branch_request",
      cwd: SSH_CWD,
      branchName: "main",
      requestId: "req-validate",
    },
    expected: {
      type: "validate_branch_response",
      payload: {
        exists: false,
        resolvedRef: null,
        isRemote: false,
        error: "Remote host is not connected",
        requestId: "req-validate",
      },
    },
  },
  {
    name: "paseo_worktree_list_request",
    message: {
      type: "paseo_worktree_list_request",
      cwd: SSH_CWD,
      requestId: "req-worktree-list",
    },
    expected: {
      type: "paseo_worktree_list_response",
      payload: {
        worktrees: [],
        error: { code: "UNKNOWN", message: "Remote host is not connected" },
        requestId: "req-worktree-list",
      },
    },
  },
  {
    name: "paseo_worktree_archive_request",
    message: {
      type: "paseo_worktree_archive_request",
      worktreePath: SSH_WORKTREE_PATH,
      requestId: "req-worktree-archive",
    },
    expected: {
      type: "paseo_worktree_archive_response",
      payload: {
        success: false,
        removedAgents: [],
        error: { code: "UNKNOWN", message: "Remote host is not connected" },
        requestId: "req-worktree-archive",
      },
    },
  },
  {
    name: "project_icon_request",
    message: { type: "project_icon_request", cwd: SSH_CWD, requestId: "req-icon" },
    expected: {
      type: "project_icon_response",
      payload: {
        cwd: SSH_CWD,
        icon: null,
        error: "Remote host is not connected",
        requestId: "req-icon",
      },
    },
  },
  {
    name: "archive_workspace_request",
    message: {
      type: "archive_workspace_request",
      workspaceId: SSH_WORKSPACE_ID,
      requestId: "req-archive-workspace",
    },
    expected: {
      type: "archive_workspace_response",
      payload: {
        requestId: "req-archive-workspace",
        workspaceId: SSH_WORKSPACE_ID,
        archivedAt: null,
        error: "Remote host is not connected",
      },
    },
  },
] as const;

function createSessionForRemoteWorkspaceTests(overrides?: {
  downloadTokenStore?: Record<string, unknown>;
  tunnelPorts?: Record<string, number | null>;
}) {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const logger = {
    child: () => logger,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const tunnelPorts = overrides?.tunnelPorts ?? {
    [HOST_ALIAS]: 6768,
    [HOST_ALIAS_2]: 6769,
  };
  const remoteHostManager = {
    getTunnelPort: vi.fn((hostAlias: string) => tunnelPorts[hostAlias] ?? null),
  };

  const session = new Session({
    clientId: "test-client",
    appVersion: null,
    onMessage: (message) => emitted.push(message as any),
    logger: logger as any,
    downloadTokenStore: (overrides?.downloadTokenStore ?? {}) as any,
    pushTokenStore: {} as any,
    paseoHome: "/tmp/paseo-test",
    agentManager: {
      subscribe: () => () => {},
      listAgents: () => [],
      getAgent: () => null,
      archiveAgent: async () => ({ archivedAt: new Date().toISOString() }),
      clearAgentAttention: async () => {},
      notifyAgentState: () => {},
    } as any,
    agentStorage: {
      list: async () => [],
      get: async () => null,
    } as any,
    projectRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    workspaceRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    chatService: {} as any,
    scheduleService: {} as any,
    loopService: {} as any,
    checkoutDiffManager: {
      subscribe: async () => ({
        initial: { cwd: REMOTE_CWD, files: [], error: null },
        unsubscribe: () => {},
      }),
      scheduleRefreshForCwd: vi.fn(),
      dispose: () => {},
    } as any,
    workspaceGitService: {
      getSnapshot: vi.fn(),
      subscribe: vi.fn(),
      scheduleRefreshForCwd: vi.fn(),
      dispose: vi.fn(),
    } as any,
    daemonConfigStore: {
      get: () => ({}),
      patch: vi.fn(),
    } as any,
    mcpBaseUrl: null,
    stt: null,
    tts: null,
    terminalManager: null,
    remoteHostManager: remoteHostManager as any,
    daemonVersion: "0.1.0-test",
  });

  return { session: session as any, emitted, remoteHostManager };
}

describe("remote ssh workspace routing", () => {
  beforeEach(() => {
    createRemoteAgentProxyMock.mockReset();
  });

  test("forwards list_terminals_request by ssh cwd and rewrites the response", async () => {
    const { session, emitted, remoteHostManager } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    await session.handleMessage({
      type: "list_terminals_request",
      cwd: SSH_CWD,
      requestId: "req-list",
    });

    expect(remoteHostManager.getTunnelPort).toHaveBeenCalledWith(HOST_ALIAS);
    expect(createRemoteAgentProxyMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "list_terminals_request",
      cwd: REMOTE_CWD,
      requestId: "req-list",
    });

    onSessionMessage?.({
      type: "list_terminals_response",
      payload: {
        cwd: REMOTE_CWD,
        terminals: [{ id: "term-1", name: "shell" }],
        requestId: "req-list",
      },
    });

    expect(emitted).toEqual([
      {
        type: "list_terminals_response",
        payload: {
          cwd: SSH_CWD,
          terminals: [{ id: "ssh:osmo_9000:term-1", name: "shell" }],
          requestId: "req-list",
        },
      },
    ]);
  });

  test("forwards file explorer requests by ssh cwd", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    await session.handleMessage({
      type: "file_explorer_request",
      cwd: SSH_CWD,
      path: ".",
      mode: "list",
      requestId: "req-explorer",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "file_explorer_request",
      cwd: REMOTE_CWD,
      path: ".",
      mode: "list",
      requestId: "req-explorer",
    });

    onSessionMessage?.({
      type: "file_explorer_response",
      payload: {
        cwd: REMOTE_CWD,
        path: ".",
        mode: "list",
        directory: {
          path: ".",
          entries: [],
        },
        file: null,
        error: null,
        requestId: "req-explorer",
      },
    });

    expect(emitted).toEqual([
      {
        type: "file_explorer_response",
        payload: {
          cwd: SSH_CWD,
          path: ".",
          mode: "list",
          directory: {
            path: ".",
            entries: [],
          },
          file: null,
          error: null,
          requestId: "req-explorer",
        },
      },
    ]);
  });

  test("converts remote download tokens into local proxy tokens without emitting the raw response", async () => {
    const issueRemoteProxyToken = vi.fn(() => ({
      token: "local-proxy-token",
      kind: "remote",
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: HOST_ALIAS,
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
      expiresAt: 1_000,
    }));
    const { session, emitted } = createSessionForRemoteWorkspaceTests({
      downloadTokenStore: { issueRemoteProxyToken },
    });
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    const requestPromise = session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-download-token",
    });

    await vi.waitFor(() => {
      expect(sendSessionMessage).toHaveBeenCalledWith({
        type: "file_download_token_request",
        cwd: REMOTE_CWD,
        path: "download.txt",
        requestId: "req-download-token",
      });
    });

    onSessionMessage?.({
      type: "file_download_token_response",
      payload: {
        cwd: REMOTE_CWD,
        path: "download.txt",
        token: "remote-token-1",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        error: null,
        requestId: "req-download-token",
      },
    });

    await requestPromise;

    expect(issueRemoteProxyToken).toHaveBeenCalledWith({
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: HOST_ALIAS,
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
    });
    expect(emitted).toEqual([
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: "local-proxy-token",
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-download-token",
        },
      },
    ]);
  });

  test("drops late remote download token responses after timeout instead of emitting the raw token", async () => {
    vi.useFakeTimers();
    try {
      const issueRemoteProxyToken = vi.fn();
      const { session, emitted } = createSessionForRemoteWorkspaceTests({
        downloadTokenStore: { issueRemoteProxyToken },
      });
      const sendSessionMessage = vi.fn();
      let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

      createRemoteAgentProxyMock.mockImplementation(async (options) => {
        onSessionMessage = options.onSessionMessage;
        return {
          sendSessionMessage,
          close: vi.fn(),
          alive: true,
          hostAlias: options.hostAlias,
        };
      });

      const requestPromise = session.handleMessage({
        type: "file_download_token_request",
        cwd: SSH_CWD,
        path: "download.txt",
        requestId: "req-timeout",
      });

      await vi.waitFor(() => {
        expect(sendSessionMessage).toHaveBeenCalledWith({
          type: "file_download_token_request",
          cwd: REMOTE_CWD,
          path: "download.txt",
          requestId: "req-timeout",
        });
      });

      await vi.advanceTimersByTimeAsync(15_001);
      await requestPromise;

      expect(emitted).toEqual([
        {
          type: "file_download_token_response",
          payload: {
            cwd: SSH_CWD,
            path: "download.txt",
            token: null,
            fileName: null,
            mimeType: null,
            size: null,
            error: "Timed out waiting for remote file_download_token_response",
            requestId: "req-timeout",
          },
        },
      ]);

      onSessionMessage?.({
        type: "file_download_token_response",
        payload: {
          cwd: REMOTE_CWD,
          path: "download.txt",
          token: "remote-token-late",
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-timeout",
        },
      });

      expect(issueRemoteProxyToken).not.toHaveBeenCalled();
      expect(emitted).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps duplicate request ids isolated across remote hosts", async () => {
    const issueRemoteProxyToken = vi
      .fn()
      .mockImplementation(({ hostAlias }: { hostAlias: string }) => ({
        token: `local-proxy-${hostAlias}`,
        kind: "remote",
        path: "download.txt",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        hostAlias,
        tunnelPort: hostAlias === HOST_ALIAS ? 6768 : 6769,
        remoteToken: `remote-token-${hostAlias}`,
        expiresAt: 1_000,
      }));
    const { session, emitted } = createSessionForRemoteWorkspaceTests({
      downloadTokenStore: { issueRemoteProxyToken },
    });
    const sendSessionMessages = new Map<string, ReturnType<typeof vi.fn>>();
    const onSessionMessages = new Map<string, (msg: Record<string, unknown>) => void>();

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      const sendSessionMessage = vi.fn();
      sendSessionMessages.set(options.hostAlias, sendSessionMessage);
      onSessionMessages.set(options.hostAlias, options.onSessionMessage);
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    const firstRequest = session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-shared",
    });
    const secondRequest = session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD_2,
      path: "download.txt",
      requestId: "req-shared",
    });

    await vi.waitFor(() => {
      expect(sendSessionMessages.get(HOST_ALIAS)).toHaveBeenCalledWith({
        type: "file_download_token_request",
        cwd: REMOTE_CWD,
        path: "download.txt",
        requestId: "req-shared",
      });
      expect(sendSessionMessages.get(HOST_ALIAS_2)).toHaveBeenCalledWith({
        type: "file_download_token_request",
        cwd: REMOTE_CWD_2,
        path: "download.txt",
        requestId: "req-shared",
      });
    });

    onSessionMessages.get(HOST_ALIAS_2)?.({
      type: "file_download_token_response",
      payload: {
        cwd: REMOTE_CWD_2,
        path: "download.txt",
        token: "remote-token-host-2",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        error: null,
        requestId: "req-shared",
      },
    });
    onSessionMessages.get(HOST_ALIAS)?.({
      type: "file_download_token_response",
      payload: {
        cwd: REMOTE_CWD,
        path: "download.txt",
        token: "remote-token-host-1",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        error: null,
        requestId: "req-shared",
      },
    });

    await Promise.all([firstRequest, secondRequest]);

    expect(issueRemoteProxyToken).toHaveBeenNthCalledWith(1, {
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: HOST_ALIAS_2,
      tunnelPort: 6769,
      remoteToken: "remote-token-host-2",
    });
    expect(issueRemoteProxyToken).toHaveBeenNthCalledWith(2, {
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: HOST_ALIAS,
      tunnelPort: 6768,
      remoteToken: "remote-token-host-1",
    });
    expect(emitted).toEqual([
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD_2,
          path: "download.txt",
          token: `local-proxy-${HOST_ALIAS_2}`,
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-shared",
        },
      },
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: `local-proxy-${HOST_ALIAS}`,
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-shared",
        },
      },
    ]);
  });

  test("rejects a concurrent remote download request with the same host and request id", async () => {
    const issueRemoteProxyToken = vi.fn(() => ({
      token: "local-proxy-token",
      kind: "remote",
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: HOST_ALIAS,
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
      expiresAt: 1_000,
    }));
    const { session, emitted } = createSessionForRemoteWorkspaceTests({
      downloadTokenStore: { issueRemoteProxyToken },
    });
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    const firstRequest = session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-duplicate",
    });

    await vi.waitFor(() => {
      expect(sendSessionMessage).toHaveBeenCalledWith({
        type: "file_download_token_request",
        cwd: REMOTE_CWD,
        path: "download.txt",
        requestId: "req-duplicate",
      });
    });

    const secondRequest = session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-duplicate",
    });

    await secondRequest;

    onSessionMessage?.({
      type: "file_download_token_response",
      payload: {
        cwd: REMOTE_CWD,
        path: "download.txt",
        token: "remote-token-1",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        error: null,
        requestId: "req-duplicate",
      },
    });

    await firstRequest;

    expect(issueRemoteProxyToken).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: null,
          fileName: null,
          mimeType: null,
          size: null,
          error:
            'A remote download token request is already pending for "osmo_9000" with requestId "req-duplicate"',
          requestId: "req-duplicate",
        },
      },
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: "local-proxy-token",
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-duplicate",
        },
      },
    ]);
  });

  test("drops late remote download token responses after send failure", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn(() => {
      throw new Error("socket closed");
    });

    createRemoteAgentProxyMock.mockResolvedValue({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-send-failure",
    });

    expect(emitted).toEqual([
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: null,
          fileName: null,
          mimeType: null,
          size: null,
          error: 'Failed to request remote download token from "osmo_9000": socket closed',
          requestId: "req-send-failure",
        },
      },
    ]);

    session.handleRemoteAgentResponse(HOST_ALIAS, {
      type: "file_download_token_response",
      payload: {
        cwd: REMOTE_CWD,
        path: "download.txt",
        token: "remote-token-late",
        fileName: "download.txt",
        mimeType: "text/plain",
        size: 24,
        error: null,
        requestId: "req-send-failure",
      },
    });

    expect(emitted).toHaveLength(1);
  });

  test("rejects same-host request id reuse while the tombstone is still active", async () => {
    vi.useFakeTimers();
    try {
      const issueRemoteProxyToken = vi.fn();
      const { session, emitted } = createSessionForRemoteWorkspaceTests({
        downloadTokenStore: { issueRemoteProxyToken },
      });
      const sendSessionMessage = vi.fn();
      let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

      createRemoteAgentProxyMock.mockImplementation(async (options) => {
        onSessionMessage = options.onSessionMessage;
        return {
          sendSessionMessage,
          close: vi.fn(),
          alive: true,
          hostAlias: options.hostAlias,
        };
      });

      const firstRequest = session.handleMessage({
        type: "file_download_token_request",
        cwd: SSH_CWD,
        path: "download.txt",
        requestId: "req-tombstone",
      });

      await vi.waitFor(() => {
        expect(sendSessionMessage).toHaveBeenCalledTimes(1);
        expect(sendSessionMessage).toHaveBeenCalledWith({
          type: "file_download_token_request",
          cwd: REMOTE_CWD,
          path: "download.txt",
          requestId: "req-tombstone",
        });
      });

      await vi.advanceTimersByTimeAsync(15_001);
      await firstRequest;

      const secondRequest = session.handleMessage({
        type: "file_download_token_request",
        cwd: SSH_CWD,
        path: "download.txt",
        requestId: "req-tombstone",
      });

      await secondRequest;

      onSessionMessage?.({
        type: "file_download_token_response",
        payload: {
          cwd: REMOTE_CWD,
          path: "download.txt",
          token: "remote-token-late",
          fileName: "download.txt",
          mimeType: "text/plain",
          size: 24,
          error: null,
          requestId: "req-tombstone",
        },
      });

      expect(sendSessionMessage).toHaveBeenCalledTimes(1);
      expect(issueRemoteProxyToken).not.toHaveBeenCalled();
      expect(emitted).toEqual([
        {
          type: "file_download_token_response",
          payload: {
            cwd: SSH_CWD,
            path: "download.txt",
            token: null,
            fileName: null,
            mimeType: null,
            size: null,
            error: "Timed out waiting for remote file_download_token_response",
            requestId: "req-tombstone",
          },
        },
        {
          type: "file_download_token_response",
          payload: {
            cwd: SSH_CWD,
            path: "download.txt",
            token: null,
            fileName: null,
            mimeType: null,
            size: null,
            error:
              'A recent remote download token request for "osmo_9000" with requestId "req-tombstone" is still being suppressed',
            requestId: "req-tombstone",
          },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("forwards checkout_status_request by ssh cwd and rewrites the response", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    await session.handleMessage({
      type: "checkout_status_request",
      cwd: SSH_CWD,
      requestId: "req-status",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "checkout_status_request",
      cwd: REMOTE_CWD,
      requestId: "req-status",
    });

    onSessionMessage?.({
      type: "checkout_status_response",
      payload: {
        cwd: REMOTE_CWD,
        isGit: true,
        repoRoot: REMOTE_CWD,
        currentBranch: "feature-a",
        isDirty: false,
        baseRef: "main",
        aheadBehind: null,
        aheadOfOrigin: 0,
        behindOfOrigin: 0,
        hasRemote: true,
        remoteUrl: "git@github.com:getpaseo/paseo.git",
        isPaseoOwnedWorktree: false,
        error: null,
        requestId: "req-status",
      },
    });

    expect(emitted).toEqual([
      {
        type: "checkout_status_response",
        payload: {
          cwd: SSH_CWD,
          isGit: true,
          repoRoot: SSH_CWD,
          currentBranch: "feature-a",
          isDirty: false,
          baseRef: "main",
          aheadBehind: null,
          aheadOfOrigin: 0,
          behindOfOrigin: 0,
          hasRemote: true,
          remoteUrl: "git@github.com:getpaseo/paseo.git",
          isPaseoOwnedWorktree: false,
          error: null,
          requestId: "req-status",
        },
      },
    ]);
  });

  test("forwards repoRoot-only paseo_worktree_list_request through the remote proxy", async () => {
    const { session } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();

    createRemoteAgentProxyMock.mockResolvedValue({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await session.handleMessage({
      type: "paseo_worktree_list_request",
      repoRoot: SSH_CWD,
      requestId: "req-worktree-list-root",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "paseo_worktree_list_request",
      repoRoot: REMOTE_CWD,
      requestId: "req-worktree-list-root",
    });
  });

  test("forwards create_paseo_worktree_request and rewrites workspace / setupTerminalId", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    await session.handleMessage({
      type: "create_paseo_worktree_request",
      cwd: SSH_CWD,
      worktreeSlug: "feature-a",
      requestId: "req-worktree",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "create_paseo_worktree_request",
      cwd: REMOTE_CWD,
      worktreeSlug: "feature-a",
      requestId: "req-worktree",
    });

    onSessionMessage?.({
      type: "create_paseo_worktree_response",
      payload: {
        workspace: {
          id: REMOTE_WORKTREE_ID,
          projectId: REMOTE_CWD,
          projectDisplayName: "repo",
          projectRootPath: REMOTE_CWD,
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
        setupTerminalId: SETUP_TERMINAL_ID,
        requestId: "req-worktree",
      },
    });

    expect(emitted).toEqual([
      {
        type: "create_paseo_worktree_response",
        payload: {
          workspace: {
            id: `ssh:${HOST_ALIAS}:${REMOTE_WORKTREE_ID}`,
            projectId: SSH_CWD,
            projectDisplayName: "repo",
            projectRootPath: REMOTE_CWD,
            projectKind: "git",
            workspaceKind: "worktree",
            name: "feature-a",
            status: "done",
            activityAt: null,
            diffStat: null,
            gitRuntime: null,
            githubRuntime: null,
            executionHost: { kind: "ssh", hostAlias: HOST_ALIAS },
          },
          error: null,
          setupTerminalId: `ssh:${HOST_ALIAS}:${SETUP_TERMINAL_ID}`,
          requestId: "req-worktree",
        },
      },
    ]);
  });

  test("deduplicates concurrent first-use proxy creation for the same host", async () => {
    const { session } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let resolveProxy: ((value: any) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProxy = resolve;
        }),
    );

    const first = session.handleMessage({
      type: "list_terminals_request",
      cwd: SSH_CWD,
      requestId: "req-list-1",
    });
    const second = session.handleMessage({
      type: "list_terminals_request",
      cwd: SSH_CWD,
      requestId: "req-list-2",
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(createRemoteAgentProxyMock).toHaveBeenCalledTimes(1);

    resolveProxy?.({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await Promise.all([first, second]);

    expect(sendSessionMessage).toHaveBeenNthCalledWith(1, {
      type: "list_terminals_request",
      cwd: REMOTE_CWD,
      requestId: "req-list-1",
    });
    expect(sendSessionMessage).toHaveBeenNthCalledWith(2, {
      type: "list_terminals_request",
      cwd: REMOTE_CWD,
      requestId: "req-list-2",
    });
  });

  test("preserves remote create terminal establishment errors", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();

    createRemoteAgentProxyMock.mockRejectedValue(new Error("TLS broke"));

    await session.handleMessage({
      type: "create_terminal_request",
      cwd: SSH_CWD,
      host: HOST_ALIAS,
      name: "shell",
      requestId: "req-create-terminal",
    });

    expect(emitted).toEqual([
      {
        type: "create_terminal_response",
        payload: {
          terminal: null,
          error: 'Failed to create terminal on "osmo_9000": TLS broke',
          requestId: "req-create-terminal",
        },
      },
    ]);
  });

  test("routes create terminal to the remote daemon when cwd is ssh namespaced and host is omitted", async () => {
    const { session } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();

    createRemoteAgentProxyMock.mockResolvedValue({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await session.handleMessage({
      type: "create_terminal_request",
      cwd: SSH_CWD,
      name: "shell",
      requestId: "req-create-terminal-no-host",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "create_terminal_request",
      cwd: REMOTE_CWD,
      name: "shell",
      requestId: "req-create-terminal-no-host",
    });
  });

  test("preserves remote create agent establishment errors", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();

    createRemoteAgentProxyMock.mockRejectedValue(new Error("TLS broke"));

    await session.handleMessage({
      type: "create_agent_request",
      config: {
        provider: "codex",
        cwd: SSH_CWD,
      },
      host: HOST_ALIAS,
      labels: {},
      requestId: "req-create-agent",
    });

    expect(emitted).toEqual([
      {
        type: "status",
        payload: {
          status: "agent_create_failed",
          requestId: "req-create-agent",
          error: 'Failed to connect to "osmo_9000": TLS broke',
        },
      },
    ]);
  });

  test("routes create agent to the remote daemon when cwd is ssh namespaced and host is omitted", async () => {
    const { session } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();

    createRemoteAgentProxyMock.mockResolvedValue({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await session.handleMessage({
      type: "create_agent_request",
      config: {
        provider: "codex",
        cwd: SSH_CWD,
      },
      labels: {},
      requestId: "req-create-agent-no-host",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "create_agent_request",
      config: {
        provider: "codex",
        cwd: REMOTE_CWD,
      },
      labels: {},
      requestId: "req-create-agent-no-host",
    });
  });

  test("routes list_provider_features_request to the remote daemon when draft cwd is ssh namespaced", async () => {
    const { session, emitted } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();
    let onSessionMessage: ((msg: Record<string, unknown>) => void) | null = null;

    createRemoteAgentProxyMock.mockImplementation(async (options) => {
      onSessionMessage = options.onSessionMessage;
      return {
        sendSessionMessage,
        close: vi.fn(),
        alive: true,
        hostAlias: options.hostAlias,
      };
    });

    await session.handleMessage({
      type: "list_provider_features_request",
      draftConfig: {
        provider: "codex",
        cwd: SSH_CWD,
      },
      requestId: "req-features",
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "list_provider_features_request",
      draftConfig: {
        provider: "codex",
        cwd: REMOTE_CWD,
      },
      requestId: "req-features",
    });

    onSessionMessage?.({
      type: "list_provider_features_response",
      payload: {
        provider: "codex",
        features: [],
        error: null,
        fetchedAt: "2026-04-20T00:00:00.000Z",
        requestId: "req-features",
      },
    });

    expect(emitted).toEqual([
      {
        type: "list_provider_features_response",
        payload: {
          provider: "codex",
          features: [],
          error: null,
          fetchedAt: "2026-04-20T00:00:00.000Z",
          requestId: "req-features",
        },
      },
    ]);
  });

  test("emits the remote-unavailable fallback for file download token requests", async () => {
    const { session, emitted, remoteHostManager } = createSessionForRemoteWorkspaceTests();

    remoteHostManager.getTunnelPort.mockReturnValue(null);

    await session.handleMessage({
      type: "file_download_token_request",
      cwd: SSH_CWD,
      path: "download.txt",
      requestId: "req-download-token",
    });

    expect(emitted).toEqual([
      {
        type: "file_download_token_response",
        payload: {
          cwd: SSH_CWD,
          path: "download.txt",
          token: null,
          fileName: null,
          mimeType: null,
          size: null,
          error: "Remote host is not connected",
          requestId: "req-download-token",
        },
      },
    ]);
  });

  test.each(FORWARDING_CASES)("forwards $name through the remote proxy", async ({
    message,
    expected,
  }) => {
    const { session } = createSessionForRemoteWorkspaceTests();
    const sendSessionMessage = vi.fn();

    createRemoteAgentProxyMock.mockResolvedValue({
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: HOST_ALIAS,
    });

    await session.handleMessage(message);

    expect(sendSessionMessage).toHaveBeenCalledWith(expected);
  });

  test.each(REMOTE_UNAVAILABLE_CASES)("emits the remote-unavailable fallback for $name", async ({
    message,
    expected,
  }) => {
    const { session, emitted, remoteHostManager } = createSessionForRemoteWorkspaceTests();

    remoteHostManager.getTunnelPort.mockReturnValue(null);

    await session.handleMessage(message);

    expect(emitted).toEqual([expected]);
  });
});
