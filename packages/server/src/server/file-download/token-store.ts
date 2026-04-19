import { randomUUID } from "node:crypto";

type DownloadTokenEntryBase = {
  token: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresAt: number;
};

export type LocalDownloadTokenEntry = DownloadTokenEntryBase & {
  kind: "local";
  absolutePath: string;
};

export type RemoteDownloadTokenEntry = DownloadTokenEntryBase & {
  kind: "remote";
  hostAlias: string;
  tunnelPort: number;
  remoteToken: string;
};

export type DownloadTokenEntry = LocalDownloadTokenEntry | RemoteDownloadTokenEntry;

type DownloadTokenStoreOptions = {
  ttlMs: number;
  now?: () => number;
};

export class DownloadTokenStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly tokens = new Map<string, DownloadTokenEntry>();

  constructor(options: DownloadTokenStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? (() => Date.now());
  }

  issueToken(
    input: Omit<LocalDownloadTokenEntry, "token" | "expiresAt" | "kind">,
  ): LocalDownloadTokenEntry {
    this.pruneExpired();
    const token = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    const entry: LocalDownloadTokenEntry = {
      ...input,
      kind: "local",
      token,
      expiresAt,
    };
    this.tokens.set(token, entry);
    return entry;
  }

  issueRemoteProxyToken(
    input: Omit<RemoteDownloadTokenEntry, "token" | "expiresAt" | "kind">,
  ): RemoteDownloadTokenEntry {
    this.pruneExpired();
    const token = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    const entry: RemoteDownloadTokenEntry = {
      ...input,
      kind: "remote",
      token,
      expiresAt,
    };
    this.tokens.set(token, entry);
    return entry;
  }

  consumeToken(token: string): DownloadTokenEntry | null {
    const entry = this.tokens.get(token);
    if (!entry) {
      return null;
    }

    this.tokens.delete(token);

    if (entry.expiresAt <= this.now()) {
      return null;
    }

    return entry;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, entry] of this.tokens) {
      if (entry.expiresAt <= now) {
        this.tokens.delete(token);
      }
    }
  }
}
