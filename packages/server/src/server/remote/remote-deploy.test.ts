import { describe, expect, test } from "vitest";
import {
  mapUnameToTarget,
  remoteStartCommand,
  buildKillScript,
  REMOTE_DAEMON_PORT,
} from "./remote-deploy.js";

describe("remote deploy", () => {
  test("mapUnameToTarget maps Linux x86_64", () => {
    expect(mapUnameToTarget("Linux x86_64")).toBe("x64-linux");
  });

  test("mapUnameToTarget maps Linux aarch64", () => {
    expect(mapUnameToTarget("Linux aarch64")).toBe("arm64-linux");
  });

  test("mapUnameToTarget maps Darwin arm64", () => {
    expect(mapUnameToTarget("Darwin arm64")).toBe("arm64-darwin");
  });

  test("mapUnameToTarget maps Darwin x86_64", () => {
    expect(mapUnameToTarget("Darwin x86_64")).toBe("x64-darwin");
  });

  test("mapUnameToTarget throws on unknown", () => {
    expect(() => mapUnameToTarget("FreeBSD amd64")).toThrow("Unsupported");
  });

  test("remoteStartCommand uses correct port and flags", () => {
    const cmd = remoteStartCommand();
    expect(cmd).toContain("~/.paseo/bin/paseo-daemon");
    expect(cmd).toContain("--daemon");
    expect(cmd).toContain("--no-host-scan");
    expect(cmd).toContain(String(REMOTE_DAEMON_PORT));
  });

  test("buildKillScript verifies process name before killing", () => {
    const script = buildKillScript();
    expect(script).toContain("paseo-daemon");
    expect(script).toContain("ps -p");
    expect(script).toContain("grep -q paseo-daemon");
    // The kill should only happen inside the process name check
    const grepIdx = script.indexOf("grep -q paseo-daemon");
    const killIdx = script.indexOf('kill "$pid"');
    expect(grepIdx).toBeLessThan(killIdx);
  });
});
