import { describe, expect, test } from "vitest";
import { SshClient } from "./ssh-client.js";

describe("SshClient", () => {
  test("buildSshArgs includes BatchMode and ConnectTimeout", () => {
    const client = new SshClient({ hostname: "devbox" });
    const args = client.buildSshArgs();
    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=10");
    expect(args).toContain("devbox");
  });

  test("buildSshArgs includes user when specified", () => {
    const client = new SshClient({ hostname: "devbox", user: "jing" });
    const args = client.buildSshArgs();
    expect(args).toContain("-l");
    expect(args).toContain("jing");
  });

  test("buildSshArgs includes port when specified", () => {
    const client = new SshClient({ hostname: "devbox", port: 2222 });
    const args = client.buildSshArgs();
    expect(args).toContain("-p");
    expect(args).toContain("2222");
  });

  test("buildSshArgs includes identity file when specified", () => {
    const client = new SshClient({
      hostname: "devbox",
      identityFile: "~/.ssh/id_ed25519",
    });
    const args = client.buildSshArgs();
    expect(args).toContain("-i");
    expect(args).toContain("~/.ssh/id_ed25519");
  });
});
