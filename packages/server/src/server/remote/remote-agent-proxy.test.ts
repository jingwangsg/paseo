import { describe, expect, test } from "vitest";
import {
  rewriteRemoteAgentId,
  rewriteLocalAgentId,
  isRemoteAgentId,
  extractHostAliasFromAgentId,
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
});
