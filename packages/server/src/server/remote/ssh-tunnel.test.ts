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
  });

  test("buildTunnelArgs includes user and port when specified", () => {
    const args = buildTunnelArgs({
      hostname: "devbox",
      localPort: 41234,
      remotePort: 6767,
      user: "jing",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
    });
    expect(args).toContain("-l");
    expect(args).toContain("jing");
    expect(args).toContain("-p");
    expect(args).toContain("2222");
    expect(args).toContain("-i");
    expect(args).toContain("~/.ssh/id_ed25519");
  });
});
