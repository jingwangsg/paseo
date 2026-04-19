import { describe, expect, test } from "vitest";
import { SshClient, expandRemotePath } from "./ssh-client.js";

describe("SshClient", () => {
  test("buildSshArgs includes BatchMode and ConnectTimeout", () => {
    const client = new SshClient({ hostname: "devbox" });
    const args = client.buildSshArgs();
    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=10");
    expect(args).toContain("devbox");
  });

  test("buildSshArgs uses SSH config alias as hostname", () => {
    const client = new SshClient({ hostname: "osmo_9000" });
    const args = client.buildSshArgs();
    expect(args).toContain("osmo_9000");
  });
});

describe("expandRemotePath", () => {
  test("expands tilde to $HOME with proper quoting", () => {
    const result = expandRemotePath("~/.paseo/bin/paseo-daemon");
    expect(result).toBe(`"$HOME"/'${".paseo/bin/paseo-daemon"}'`);
    // Must NOT start with a single-quoted tilde
    expect(result).not.toMatch(/^'~/);
  });

  test("quotes absolute paths without $HOME expansion", () => {
    const result = expandRemotePath("/usr/local/bin/paseo-daemon");
    expect(result).toBe("'/usr/local/bin/paseo-daemon'");
  });

  test("escapes single quotes in path", () => {
    const result = expandRemotePath("~/it's a path");
    expect(result).toContain("$HOME");
    expect(result).toContain("'\\''");
  });
});
