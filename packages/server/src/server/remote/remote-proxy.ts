import type { Logger } from "pino";
import WebSocket from "ws";

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

export function stripMirrorPrefix(mirroredId: string, hostAlias: string): string {
  const prefix = `ssh:${hostAlias}:`;
  return mirroredId.startsWith(prefix) ? mirroredId.slice(prefix.length) : mirroredId;
}

export interface RemoteWsProxy {
  send(data: string | Buffer): void;
  close(): void;
  readonly readyState: number;
}

export function createRemoteWsProxy(options: {
  tunnelPort: number;
  logger: Logger;
  onMessage: (data: string | Buffer) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}): Promise<RemoteWsProxy> {
  const { tunnelPort, logger, onMessage, onClose, onError } = options;
  const url = buildRemoteDaemonWsUrl(tunnelPort);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on("open", () => {
      logger.debug({ url }, "Remote WS proxy connected");
      resolve({
        send: (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        },
        close: () => ws.close(),
        get readyState() {
          return ws.readyState;
        },
      });
    });

    ws.on("message", (data) => {
      if (typeof data === "string") {
        onMessage(data);
      } else if (Buffer.isBuffer(data)) {
        onMessage(data);
      }
    });

    ws.on("close", onClose);
    ws.on("error", (err) => {
      onError(err);
      reject(err);
    });
  });
}
