import { describe, expect, test, vi } from "vitest";

import { resolveWaitForFinishError, Session } from "./session.js";

function createSessionForWaitTests() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const logger = {
    child: () => logger,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const session = new Session({
    clientId: "test-client",
    appVersion: null,
    onMessage: (message) => emitted.push(message as any),
    logger: logger as any,
    downloadTokenStore: {} as any,
    pushTokenStore: {} as any,
    paseoHome: "/tmp/paseo-test",
    agentManager: {
      subscribe: () => () => {},
      listAgents: () => [],
      getAgent: () => null,
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
    checkoutDiffManager: {} as any,
    workspaceGitService: {} as any,
    daemonConfigStore: {
      get: () => ({}),
      patch: vi.fn(),
    } as any,
    mcpBaseUrl: null,
    stt: null,
    tts: null,
    terminalManager: null,
  });

  return { session: session as any, emitted };
}

describe("resolveWaitForFinishError", () => {
  test("returns the agent error when the wait result is an error", () => {
    expect(
      resolveWaitForFinishError({
        status: "error",
        final: { lastError: "invalid_json_schema" } as any,
      }),
    ).toBe("invalid_json_schema");
  });

  test("returns a generic fallback when the agent ended in error without a message", () => {
    expect(
      resolveWaitForFinishError({
        status: "error",
        final: {} as any,
      }),
    ).toBe("Agent failed");
  });

  test("returns null for non-error wait results", () => {
    expect(
      resolveWaitForFinishError({
        status: "idle",
        final: { lastError: "should not surface" } as any,
      }),
    ).toBeNull();
  });
});

describe("remote wait_for_finish routing", () => {
  test("forwards wait_for_finish requests for remote agents through the proxy", async () => {
    const { session, emitted } = createSessionForWaitTests();
    const sendSessionMessage = vi.fn();

    session.remoteAgentProxies.set("osmo_9000", {
      sendSessionMessage,
      close: vi.fn(),
      alive: true,
      hostAlias: "osmo_9000",
    });

    await session.handleMessage({
      type: "wait_for_finish_request",
      agentId: "ssh:osmo_9000:remote-agent-1",
      requestId: "req-1",
      timeoutMs: 30_000,
    });

    expect(sendSessionMessage).toHaveBeenCalledWith({
      type: "wait_for_finish_request",
      agentId: "remote-agent-1",
      requestId: "req-1",
      timeoutMs: 30_000,
    });
    expect(emitted).toEqual([]);
  });

  test("rewrites remote final agent ids in wait_for_finish responses before emitting", () => {
    const { session, emitted } = createSessionForWaitTests();

    session.handleRemoteAgentResponse("osmo_9000", {
      type: "wait_for_finish_response",
      payload: {
        requestId: "req-1",
        status: "idle",
        final: {
          id: "remote-agent-1",
        },
        error: null,
        lastMessage: "done",
      },
    });

    expect(emitted).toEqual([
      {
        type: "wait_for_finish_response",
        payload: {
          requestId: "req-1",
          status: "idle",
          final: {
            id: "ssh:osmo_9000:remote-agent-1",
          },
          error: null,
          lastMessage: "done",
        },
      },
    ]);
  });
});
