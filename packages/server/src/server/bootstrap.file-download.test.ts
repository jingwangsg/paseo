import { afterEach, describe, expect, test, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import pino from "pino";

import { DownloadTokenStore } from "./file-download/token-store.js";

async function requestDownload(
  port: number,
  token: string,
): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: `/api/files/download?token=${encodeURIComponent(token)}`,
        method: "GET",
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("file download route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 502 when the remote proxy fetch fails", async () => {
    const bootstrap = await import("./bootstrap.js");
    const createFileDownloadHandler = (bootstrap as any).createFileDownloadHandler;

    const store = new DownloadTokenStore({ ttlMs: 60_000 });
    const entry = store.issueRemoteProxyToken({
      path: "download.txt",
      fileName: "download.txt",
      mimeType: "text/plain",
      size: 24,
      hostAlias: "osmo_9000",
      tunnelPort: 6768,
      remoteToken: "remote-token-1",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    const app = express();
    app.get("/api/files/download", createFileDownloadHandler(store, pino({ level: "silent" })));
    const server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address");
      }

      const response = await requestDownload(address.port, entry.token);

      expect(response.statusCode).toBe(502);
      expect(response.body).toContain("Failed to fetch remote file");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
