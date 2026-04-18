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

      // Send hello message to establish session on remote daemon.
      // Must include clientType and protocolVersion per WSHelloMessageSchema.
      ws.send(
        JSON.stringify({
          type: "hello",
          clientId: `proxy-${hostAlias}-${Date.now()}`,
          clientType: "cli",
          protocolVersion: 1,
          appVersion: "0.1.59",
        }),
      );

      const proxy: RemoteAgentProxy = {
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
      };

      // Wait briefly for hello to be processed before allowing sends
      setTimeout(() => resolve(proxy), 500);
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
