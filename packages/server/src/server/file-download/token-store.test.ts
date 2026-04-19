import { describe, expect, test } from "vitest";

import { DownloadTokenStore } from "./token-store.js";

describe("DownloadTokenStore", () => {
  test("issues and consumes remote proxy tokens", () => {
    const store = new DownloadTokenStore({ ttlMs: 60_000, now: () => 1_000 });

    const entry = store.issueRemoteProxyToken({
      path: "artifacts/build.log",
      fileName: "build.log",
      mimeType: "text/plain",
      size: 128,
      hostAlias: "osmo_9000",
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
    });

    expect(entry).toMatchObject({
      kind: "remote",
      path: "artifacts/build.log",
      fileName: "build.log",
      mimeType: "text/plain",
      size: 128,
      hostAlias: "osmo_9000",
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
      expiresAt: 61_000,
    });
    expect(entry.token).toEqual(expect.any(String));

    expect(store.consumeToken(entry.token)).toEqual(entry);
    expect(store.consumeToken(entry.token)).toBeNull();
  });

  test("expires remote proxy tokens before consumption", () => {
    let now = 1_000;
    const store = new DownloadTokenStore({ ttlMs: 50, now: () => now });

    const entry = store.issueRemoteProxyToken({
      path: "artifacts/build.log",
      fileName: "build.log",
      mimeType: "text/plain",
      size: 128,
      hostAlias: "osmo_9000",
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
    });

    now = 1_051;

    expect(store.consumeToken(entry.token)).toBeNull();
  });
});
