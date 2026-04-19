import { describe, expect, test } from "vitest";
import {
  rewriteRemoteAgentId,
  rewriteLocalAgentId,
  isRemoteAgentId,
  isSshNamespacedId,
  stripSshNamespace,
  extractHostAliasFromAgentId,
  buildRemoteDaemonWsUrl,
  extractHostAliasFromProjectId,
} from "./remote-agent-proxy.js";

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

  test("extractHostAliasFromAgentId extracts alias", () => {
    expect(extractHostAliasFromAgentId("ssh:osmo_9000:abc-123")).toBe("osmo_9000");
    expect(extractHostAliasFromAgentId("abc-123")).toBeNull();
  });

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

  test("isSshNamespacedId detects ssh-namespaced values", () => {
    expect(isSshNamespacedId("ssh:osmo_9000:/mnt/data/project")).toBe(true);
    expect(isSshNamespacedId("ssh:devbox:ws:/home/user/repo")).toBe(true);
    expect(isSshNamespacedId("/mnt/data/project")).toBe(false);
    expect(isSshNamespacedId("")).toBe(false);
  });

  test("stripSshNamespace extracts remote-local value", () => {
    expect(stripSshNamespace("ssh:osmo_9000:/mnt/data/project")).toBe("/mnt/data/project");
    expect(stripSshNamespace("ssh:devbox:ws:/home/user/repo")).toBe("ws:/home/user/repo");
    expect(stripSshNamespace("ssh:host:abc-123")).toBe("abc-123");
  });

  test("stripSshNamespace returns original for non-ssh values", () => {
    expect(stripSshNamespace("/mnt/data/project")).toBe("/mnt/data/project");
    expect(stripSshNamespace("abc-123")).toBe("abc-123");
  });

  test("stripSshNamespace returns original for malformed ssh prefix", () => {
    expect(stripSshNamespace("ssh:noColon")).toBe("ssh:noColon");
  });
});
