# Remote Agent Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the local Paseo daemon proxy agent creation, messaging, timeline, and lifecycle operations to remote daemons, so the App on Mac can control Claude/Codex agents running on remote SSH hosts.

**Architecture:** When a `create_agent_request` includes a `host` field (SSH host alias), the session opens a WS proxy to the remote daemon via the SSH tunnel, forwards the request (stripping mirror prefixes), and relays all responses back to the client. Subsequent operations on that agent (send message, fetch timeline, cancel) are detected by the `ssh:` prefix in the agent ID and routed through the same proxy. The local daemon maintains a map of remote agent proxies keyed by agent ID.

**Tech Stack:** TypeScript, Zod, WebSocket (ws), Vitest.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `packages/server/src/server/remote/remote-agent-proxy.ts` | Per-agent WS proxy: connects to remote daemon, relays messages, manages lifecycle |
| `packages/server/src/server/remote/remote-agent-proxy.test.ts` | Unit tests for ID rewriting and message transformation |

### Modified files

| File | Change |
|---|---|
| `packages/server/src/shared/messages.ts` | Re-add `host` field to `CreateAgentRequestMessageSchema` |
| `packages/server/src/server/session.ts` | Intercept agent operations for remote agents, delegate to proxy |
| `packages/server/src/server/remote/remote-proxy.ts` | Add `stripMirrorPrefixFromMessage` helper for bulk ID rewriting |
| `packages/cli/src/commands/agent/run.ts` | Re-add `--ssh-host` option |
| `packages/server/src/client/daemon-client.ts` | Re-add `host` to CreateAgentRequestOptions |

---

## Task 1: Re-add `host` field to CreateAgentRequest schema and CLI

**Files:**
- Modify: `packages/server/src/shared/messages.ts` (CreateAgentRequestMessageSchema)
- Modify: `packages/cli/src/commands/agent/run.ts`
- Modify: `packages/server/src/client/daemon-client.ts`

- [ ] **Step 1: Add host field to schema**

In `packages/server/src/shared/messages.ts`, find `CreateAgentRequestMessageSchema` and add:

```typescript
  host: z.string().optional(),  // SSH host alias — routes creation to remote daemon
```

- [ ] **Step 2: Re-add --ssh-host to CLI run command**

In `packages/cli/src/commands/agent/run.ts`, add back the option:

```typescript
    .option("--ssh-host <alias>", "Run the agent on a remote SSH host")
```

Add `sshHost?: string` to the options interface. Pass `host: options.sshHost` in the `createAgent` call.

- [ ] **Step 3: Re-add host to daemon client**

In `packages/server/src/client/daemon-client.ts`, add `host?: string` to `CreateAgentRequestOptions` and include it in the WS message.

- [ ] **Step 4: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/shared/messages.ts packages/cli/src/commands/agent/run.ts packages/server/src/client/daemon-client.ts
git commit -m "feat(schema): re-add host field to CreateAgentRequest for remote routing"
```

---

## Task 2: Remote agent proxy module

**Files:**
- Create: `packages/server/src/server/remote/remote-agent-proxy.ts`
- Create: `packages/server/src/server/remote/remote-agent-proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/remote-agent-proxy.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { rewriteRemoteAgentId, rewriteLocalAgentId, isRemoteAgentId } from "./remote-agent-proxy.js";

describe("remote-agent-proxy", () => {
  test("rewriteRemoteAgentId adds ssh prefix", () => {
    expect(rewriteRemoteAgentId("osmo_9000", "abc-123")).toBe("ssh:osmo_9000:abc-123");
  });

  test("rewriteLocalAgentId strips ssh prefix", () => {
    expect(rewriteLocalAgentId("osmo_9000", "ssh:osmo_9000:abc-123")).toBe("abc-123");
  });

  test("isRemoteAgentId detects ssh prefix", () => {
    expect(isRemoteAgentId("ssh:osmo_9000:abc-123")).toBe(true);
    expect(isRemoteAgentId("abc-123")).toBe(false);
  });

  test("rewriteLocalAgentId returns original if no prefix", () => {
    expect(rewriteLocalAgentId("osmo_9000", "abc-123")).toBe("abc-123");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-agent-proxy.test.ts --bail=1`

- [ ] **Step 3: Implement remote agent proxy**

Create `packages/server/src/server/remote/remote-agent-proxy.ts`:

```typescript
import WebSocket from "ws";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Agent ID rewriting — local daemon uses "ssh:<alias>:<remoteId>" to namespace
// remote agent IDs. When forwarding TO a remote daemon, strip the prefix.
// When receiving FROM a remote daemon, add the prefix.
// ---------------------------------------------------------------------------

export function rewriteRemoteAgentId(hostAlias: string, remoteAgentId: string): string {
  return `ssh:${hostAlias}:${remoteAgentId}`;
}

export function rewriteLocalAgentId(hostAlias: string, mirroredId: string): string {
  const prefix = `ssh:${hostAlias}:`;
  return mirroredId.startsWith(prefix) ? mirroredId.slice(prefix.length) : mirroredId;
}

export function isRemoteAgentId(agentId: string): boolean {
  return agentId.startsWith("ssh:");
}

export function extractHostAliasFromAgentId(agentId: string): string | null {
  if (!agentId.startsWith("ssh:")) return null;
  const rest = agentId.slice(4);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;
  return rest.slice(0, colonIdx);
}

// ---------------------------------------------------------------------------
// RemoteAgentProxy — maintains a WS connection to a remote daemon and proxies
// agent operations bidirectionally.
// ---------------------------------------------------------------------------

export interface RemoteAgentProxy {
  /** Send a JSON message to the remote daemon (as a session-level message) */
  sendSessionMessage(msg: Record<string, unknown>): void;
  /** Register handler for messages from remote daemon */
  onSessionMessage(handler: (msg: Record<string, unknown>) => void): void;
  /** Close the proxy connection */
  close(): void;
  /** Whether the connection is alive */
  readonly alive: boolean;
  /** The host alias this proxy connects to */
  readonly hostAlias: string;
}

export async function createRemoteAgentProxy(options: {
  hostAlias: string;
  tunnelPort: number;
  logger: Logger;
}): Promise<RemoteAgentProxy> {
  const { hostAlias, tunnelPort, logger } = options;
  const url = `ws://127.0.0.1:${tunnelPort}/ws`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let messageHandler: ((msg: Record<string, unknown>) => void) | null = null;
    let alive = true;

    ws.on("open", () => {
      logger.info({ hostAlias, tunnelPort }, "Remote agent proxy connected");

      // Send hello message to establish session on remote daemon
      ws.send(JSON.stringify({
        type: "hello",
        clientId: `proxy-${hostAlias}-${Date.now()}`,
        version: "0.1.0",
      }));

      resolve({
        sendSessionMessage(msg) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "session", message: msg }));
          }
        },
        onSessionMessage(handler) {
          messageHandler = handler;
        },
        close() {
          if (alive) {
            ws.close();
            alive = false;
          }
        },
        get alive() {
          return alive && ws.readyState === WebSocket.OPEN;
        },
        get hostAlias() {
          return hostAlias;
        },
      });
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        // Remote daemon wraps session messages in { type: "session", message: ... }
        if (parsed.type === "session" && parsed.message && messageHandler) {
          messageHandler(parsed.message);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      alive = false;
      logger.info({ hostAlias }, "Remote agent proxy disconnected");
    });

    ws.on("error", (err) => {
      alive = false;
      logger.error({ err, hostAlias }, "Remote agent proxy error");
      reject(err);
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-agent-proxy.test.ts --bail=1`

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/remote-agent-proxy.ts packages/server/src/server/remote/remote-agent-proxy.test.ts
git commit -m "feat(remote): add remote agent proxy with ID rewriting"
```

---

## Task 3: Session — intercept create_agent_request for remote hosts

**Files:**
- Modify: `packages/server/src/server/session.ts`

This is the critical task. When `create_agent_request` includes a `host` field, the session:
1. Looks up the tunnel port from `remoteHostManager`
2. Creates a `RemoteAgentProxy` to the remote daemon
3. Forwards the create request (with `host` stripped)
4. Listens for agent responses from the remote daemon
5. Rewrites agent IDs with `ssh:<alias>:` prefix before forwarding to client

- [ ] **Step 1: Add imports and state**

In `packages/server/src/server/session.ts`, add imports:

```typescript
import {
  createRemoteAgentProxy,
  rewriteRemoteAgentId,
  rewriteLocalAgentId,
  isRemoteAgentId,
  extractHostAliasFromAgentId,
  type RemoteAgentProxy,
} from "./remote/remote-agent-proxy.js";
```

Add to Session class fields:

```typescript
  /** Active remote agent proxies, keyed by hostAlias */
  private readonly remoteAgentProxies = new Map<string, RemoteAgentProxy>();
```

- [ ] **Step 2: Add remote routing in handleCreateAgentRequest**

At the top of `handleCreateAgentRequest` (line ~2754), before existing logic, add:

```typescript
    // Remote host routing: if host is specified, forward to remote daemon
    const hostAlias = msg.host;
    if (hostAlias && this.remoteHostManager) {
      await this.handleRemoteCreateAgent(hostAlias, msg);
      return;
    }
```

- [ ] **Step 3: Implement handleRemoteCreateAgent**

Add this method to the Session class:

```typescript
  private async handleRemoteCreateAgent(
    hostAlias: string,
    msg: CreateAgentRequestMessage,
  ): Promise<void> {
    const tunnelPort = this.remoteHostManager?.getTunnelPort(hostAlias);
    if (!tunnelPort) {
      this.emit({
        type: "agent_create_failed",
        payload: {
          requestId: msg.requestId,
          error: `Remote host "${hostAlias}" is not connected (no tunnel)`,
        },
      });
      return;
    }

    try {
      // Get or create proxy for this host
      let proxy = this.remoteAgentProxies.get(hostAlias);
      if (!proxy?.alive) {
        proxy = await createRemoteAgentProxy({
          hostAlias,
          tunnelPort,
          logger: this.logger,
        });
        this.remoteAgentProxies.set(hostAlias, proxy);

        // Set up response handler: rewrite agent IDs and forward to client
        proxy.onSessionMessage((remoteMsg) => {
          this.handleRemoteAgentResponse(hostAlias, remoteMsg);
        });
      }

      // Forward create request to remote daemon, stripping the host field
      const { host, ...remoteMsg } = msg;
      proxy.sendSessionMessage(remoteMsg as Record<string, unknown>);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "agent_create_failed",
        payload: {
          requestId: msg.requestId,
          error: `Failed to connect to remote host "${hostAlias}": ${message}`,
        },
      });
    }
  }
```

- [ ] **Step 4: Implement handleRemoteAgentResponse**

This handles ALL messages coming back from the remote daemon, rewrites agent IDs, and forwards to client:

```typescript
  private handleRemoteAgentResponse(
    hostAlias: string,
    remoteMsg: Record<string, unknown>,
  ): void {
    // Rewrite agentId fields in the response — add ssh:<alias>: prefix
    const rewritten = this.rewriteAgentIdsInMessage(hostAlias, remoteMsg);
    // Forward to client as-is (the message types are the same)
    this.emit(rewritten as any);
  }

  private rewriteAgentIdsInMessage(
    hostAlias: string,
    msg: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...msg };

    // Rewrite top-level agentId
    if (typeof result.agentId === "string") {
      result.agentId = rewriteRemoteAgentId(hostAlias, result.agentId as string);
    }

    // Rewrite agentId inside payload
    if (result.payload && typeof result.payload === "object") {
      const payload = { ...(result.payload as Record<string, unknown>) };
      if (typeof payload.agentId === "string") {
        payload.agentId = rewriteRemoteAgentId(hostAlias, payload.agentId as string);
      }
      // Handle agent_update payload with nested agent object
      if (payload.agent && typeof payload.agent === "object") {
        const agent = { ...(payload.agent as Record<string, unknown>) };
        if (typeof agent.id === "string") {
          agent.id = rewriteRemoteAgentId(hostAlias, agent.id as string);
        }
        payload.agent = agent;
      }
      result.payload = payload;
    }

    return result;
  }
```

- [ ] **Step 5: Route subsequent agent operations to remote proxy**

For each agent operation handler, add a check at the top. The pattern is the same for all:

In `handleSendAgentMessageRequest` (line ~1489), add at top:
```typescript
    if (isRemoteAgentId(msg.agentId)) {
      this.forwardToRemoteAgent(msg.agentId, msg as Record<string, unknown>);
      return;
    }
```

In `handleCancelAgentRequest` (line ~1566), add at top:
```typescript
    if (isRemoteAgentId(agentId)) {
      this.forwardToRemoteAgent(agentId, { type: "cancel_agent_request", agentId, requestId });
      return;
    }
```

In `handleFetchAgentTimelineRequest` (line ~1578), add at top:
```typescript
    if (isRemoteAgentId(msg.agentId)) {
      this.forwardToRemoteAgent(msg.agentId, msg as Record<string, unknown>);
      return;
    }
```

In `handleFetchAgent` (line ~1465), add at top:
```typescript
    if (isRemoteAgentId(agentId)) {
      this.forwardToRemoteAgent(agentId, { type: "fetch_agent_request", agentId, requestId });
      return;
    }
```

In `handleDeleteAgentRequest` (line ~1469), add at top:
```typescript
    if (isRemoteAgentId(agentId)) {
      this.forwardToRemoteAgent(agentId, { type: "delete_agent_request", agentId, requestId });
      return;
    }
```

In `handleSetAgentModeRequest` (line ~1582), add at top:
```typescript
    if (isRemoteAgentId(agentId)) {
      this.forwardToRemoteAgent(agentId, { type: "set_agent_mode_request", agentId, modeId, requestId });
      return;
    }
```

In `handleSetAgentModelRequest` (line ~1586), add at top:
```typescript
    if (isRemoteAgentId(agentId)) {
      this.forwardToRemoteAgent(agentId, { type: "set_agent_model_request", agentId, modelId, requestId });
      return;
    }
```

- [ ] **Step 6: Implement forwardToRemoteAgent helper**

```typescript
  private forwardToRemoteAgent(agentId: string, msg: Record<string, unknown>): void {
    const hostAlias = extractHostAliasFromAgentId(agentId);
    if (!hostAlias) return;

    const proxy = this.remoteAgentProxies.get(hostAlias);
    if (!proxy?.alive) {
      this.logger.warn({ agentId, hostAlias }, "Remote proxy not available for agent");
      return;
    }

    // Strip ssh:<alias>: prefix from agentId before sending to remote
    const remoteMsg = { ...msg };
    if (typeof remoteMsg.agentId === "string") {
      remoteMsg.agentId = rewriteLocalAgentId(hostAlias, remoteMsg.agentId as string);
    }
    proxy.sendSessionMessage(remoteMsg);
  }
```

- [ ] **Step 7: Clean up proxies on session cleanup**

In the session's `cleanup()` method, add:

```typescript
    // Close all remote agent proxies
    for (const [, proxy] of this.remoteAgentProxies) {
      proxy.close();
    }
    this.remoteAgentProxies.clear();
```

- [ ] **Step 8: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/server/session.ts
git commit -m "feat(remote): route agent operations to remote daemons via WS proxy"
```

---

## Task 4: End-to-end validation

- [ ] **Step 1: Start remote daemon on osmo_9000**

```bash
ssh osmo_9000 'su - jingwang -c "export PATH=/root/micromamba/envs/default/bin:/root/homebrew/bin:/root/.local/bin:\$PATH; cd /mnt/amlfs-03/shared/jingwang/paseo-remote; pkill -f tsx.*index.ts 2>/dev/null; sleep 1; nohup npx tsx packages/server/src/server/index.ts > /tmp/paseo-remote.log 2>&1 &"'
```

Wait 10s, verify: `ssh osmo_9000 'curl -sf http://127.0.0.1:6767/api/status'`

- [ ] **Step 2: Register osmo_9000 as remote host via local daemon**

The local daemon needs to be running the feature branch code. Use `paseo host add`:

```bash
npm run cli -- host add osmo_9000 --hostname osmo_9000
```

Verify: `npm run cli -- host ls` — should show osmo_9000 with status progressing toward "ready"

- [ ] **Step 3: Create agent on remote host**

```bash
npm run cli -- run "say hello from remote" --ssh-host osmo_9000 --cwd /tmp --title "e2e-remote"
```

Expected: agent created with `ssh:osmo_9000:` prefixed ID, status transitions visible.

- [ ] **Step 4: Verify agent visible in ls**

```bash
npm run cli -- ls -a
```

Expected: shows the remote agent with HOST column = "osmo_9000"

- [ ] **Step 5: Verify timeline/logs**

```bash
npm run cli -- logs <agent-id>
```

Expected: shows the agent's conversation with "say hello from remote" and the response.

---

## Out of scope

- **Terminal routing** — same proxy pattern but requires terminal-specific message types. Follow-up.
- **Remote agent resume** — resuming a remote agent after daemon restart. Follow-up.
- **Multi-host proxy pooling** — reusing proxy connections across agents on the same host. Current impl creates one proxy per session per host, which is sufficient.
