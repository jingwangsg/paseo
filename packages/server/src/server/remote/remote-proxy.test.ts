import { describe, expect, test } from "vitest";
import { buildRemoteDaemonWsUrl, extractHostAliasFromProjectId } from "./remote-proxy.js";

describe("remote-proxy", () => {
  test("buildRemoteDaemonWsUrl builds correct URL", () => {
    const url = buildRemoteDaemonWsUrl(41234);
    expect(url).toBe("ws://127.0.0.1:41234/ws");
  });

  test("extractHostAliasFromProjectId extracts alias from ssh: prefix", () => {
    expect(extractHostAliasFromProjectId("ssh:devbox:remote:github.com/user/repo")).toBe("devbox");
  });

  test("extractHostAliasFromProjectId returns null for local projects", () => {
    expect(extractHostAliasFromProjectId("remote:github.com/user/repo")).toBeNull();
    expect(extractHostAliasFromProjectId("/tmp/project")).toBeNull();
  });
});
