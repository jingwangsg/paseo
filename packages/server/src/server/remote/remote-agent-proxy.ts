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
// Helpers for remote daemon URLs and project IDs
// ---------------------------------------------------------------------------

export function buildRemoteDaemonWsUrl(tunnelPort: number): string {
  return `ws://127.0.0.1:${tunnelPort}/ws`;
}

export function extractHostAliasFromProjectId(projectId: string): string | null {
  if (!projectId.startsWith("ssh:")) return null;
  const afterPrefix = projectId.slice(4);
  const colonIndex = afterPrefix.indexOf(":");
  if (colonIndex === -1) return null;
  return afterPrefix.slice(0, colonIndex);
}

/**
 * Returns true if the value looks like an SSH-namespaced identifier
 * (e.g. workspace ID, project ID, agent ID, or cwd that was accidentally
 * prefixed with the `ssh:<alias>:` namespace).
 */
export function isSshNamespacedId(value: string): boolean {
  return value.startsWith("ssh:");
}

/**
 * Strips the `ssh:<alias>:` prefix from a mirrored identifier, returning the
 * remote-local value. If the value does not carry the prefix, it is returned
 * unchanged.
 */
export function stripSshNamespace(value: string): string {
  if (!value.startsWith("ssh:")) return value;
  const rest = value.slice(4);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return value;
  return rest.slice(colonIdx + 1);
}

// ---------------------------------------------------------------------------
// RemoteAgentProxy — maintains a WS connection to a remote daemon and proxies
// agent operations bidirectionally.
// ---------------------------------------------------------------------------

export interface RemoteAgentProxy {
  /** Send a JSON message to the remote daemon (as a session-level message) */
  sendSessionMessage(msg: Record<string, unknown>): void;
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
  daemonVersion: string;
  logger: Logger;
  /** Handler for session messages from the remote daemon. Set at creation
   *  time so no messages are lost during the hello handshake. */
  onSessionMessage: (msg: Record<string, unknown>) => void;
}): Promise<RemoteAgentProxy> {
  const { hostAlias, tunnelPort, daemonVersion, logger, onSessionMessage } = options;
  const url = `ws://127.0.0.1:${tunnelPort}/ws`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let alive = true;
    let helloAcked = false;
    const pendingMessages: Record<string, unknown>[] = [];

    ws.on("open", () => {
      logger.info({ hostAlias, tunnelPort }, "Remote agent proxy connected");

      // Send hello message to establish session on remote daemon.
      ws.send(
        JSON.stringify({
          type: "hello",
          clientId: `proxy-${hostAlias}-${Date.now()}`,
          clientType: "cli",
          protocolVersion: 1,
          appVersion: daemonVersion,
        }),
      );
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());

        // The first response after hello is the server_info/status message
        // confirming the session is established.
        if (!helloAcked) {
          helloAcked = true;
          logger.info({ hostAlias }, "Remote agent proxy session established");

          // Resolve the proxy now that the session is ready
          resolve({
            sendSessionMessage(msg) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "session", message: msg }));
              }
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

          // Flush any messages that arrived during hello
          for (const pending of pendingMessages) {
            onSessionMessage(pending);
          }
          pendingMessages.length = 0;
          return;
        }

        // Remote daemon wraps session messages in { type: "session", message: ... }
        if (parsed.type === "session" && parsed.message) {
          onSessionMessage(parsed.message);
        }
      } catch (err) {
        logger.warn({ err, hostAlias }, "Remote proxy failed to parse message");
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
