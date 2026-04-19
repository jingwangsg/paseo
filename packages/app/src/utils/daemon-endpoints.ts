import {
  buildDaemonWebSocketUrl,
  deriveLabelFromEndpoint,
  extractHostPortFromWebSocketUrl,
  normalizeHostPort,
  parseHostPort,
  type HostPortParts,
} from "@server/shared/daemon-endpoints";

export type { HostPortParts };

export {
  buildDaemonWebSocketUrl,
  deriveLabelFromEndpoint,
  extractHostPortFromWebSocketUrl,
  normalizeHostPort,
  parseHostPort,
};
