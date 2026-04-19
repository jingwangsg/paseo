/**
 * Tests that resume_agent_request and refresh_agent_request emit rpc_error
 * when they fail, instead of only emitting activity_log and leaving the client
 * waiting forever (infinite spinner).
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "./test-utils/paseo-daemon.js";
import { DaemonClient } from "./test-utils/daemon-client.js";

describe("rpc_error responses for resume/refresh agent failures", () => {
  let daemon: TestPaseoDaemon;
  let client: DaemonClient;

  beforeEach(async () => {
    daemon = await createTestPaseoDaemon();
    client = new DaemonClient({
      url: `ws://127.0.0.1:${daemon.port}/ws`,
      messageQueueLimit: null,
    });
    await client.connect();
  });

  afterEach(async () => {
    await client.close().catch(() => {});
    await daemon.close();
  }, 30000);

  test("resume_agent_request sends rpc_error when provider is not registered", async () => {
    // "nonexistent-provider" is not in the fake agent clients, so requireClient throws.
    // Before the fix: catch block only emits activity_log, sendRequest times out (15s).
    // After the fix: catch block also emits rpc_error, sendRequest rejects promptly.
    const handle = {
      provider: "nonexistent-provider",
      sessionId: "test-session-id",
    };

    await expect(client.resumeAgent(handle)).rejects.toThrow(/handler_error|Request failed/);
  }, 10000);

  test("refresh_agent_request sends rpc_error when agent does not exist", async () => {
    // "nonexistent-agent-id" is not in agent storage, so handleRefreshAgentRequest throws
    // "Agent not found: nonexistent-agent-id".
    // Before the fix: catch block only emits activity_log, sendRequest times out (15s).
    // After the fix: catch block also emits rpc_error, sendRequest rejects promptly.
    await expect(client.refreshAgent("nonexistent-agent-id")).rejects.toThrow(
      /handler_error|Request failed|Agent not found/,
    );
  }, 10000);
});
