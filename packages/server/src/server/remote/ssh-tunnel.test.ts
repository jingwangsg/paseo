import { describe, expect, test } from "vitest";
import { buildTunnelArgs } from "./ssh-tunnel.js";

describe("SSH Tunnel", () => {
  test("buildTunnelArgs produces correct port-forward args", () => {
    const args = buildTunnelArgs({
      hostname: "devbox",
      localPort: 41234,
      remotePort: 6767,
    });
    expect(args).toContain("-N");
    expect(args).toContain("-L");
    expect(args.join(" ")).toContain("127.0.0.1:41234:127.0.0.1:6767");
    expect(args).toContain("ExitOnForwardFailure=yes");
    expect(args).toContain("ServerAliveInterval=10");
    expect(args).toContain("ServerAliveCountMax=3");
    expect(args).toContain("devbox");
  });
});
