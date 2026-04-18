import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync, randomUUID } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  randomUUID: vi.fn(() => "12345678-1234-5678-9012-abcdefabcdef"),
}));

vi.mock("node:child_process", () => ({
  spawnSync,
}));

vi.mock("node:crypto", () => ({
  randomUUID,
}));

import { inheritLoginShellEnv } from "./login-shell-env";

const ORIGINAL_ENV = { ...process.env };
const MARK = "123456781234";

function buildProbeOutput(env: Record<string, string>): string {
  return `${MARK}${JSON.stringify(env)}${MARK}`;
}

describe("login-shell-env", () => {
  beforeEach(() => {
    spawnSync.mockReset();
    randomUUID.mockClear();
    process.env = {
      ...ORIGINAL_ENV,
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses a non-interactive login zsh probe", () => {
    spawnSync.mockReturnValue({
      status: 0,
      stdout: buildProbeOutput({ PATH: "/usr/bin:/bin:/opt/homebrew/bin" }),
    });

    inheritLoginShellEnv();

    expect(spawnSync).toHaveBeenCalledWith(
      "/bin/zsh",
      [
        "-l",
        "-c",
        expect.stringContaining(
          `'${process.execPath}' -p '"${MARK}" + JSON.stringify(process.env) + "${MARK}"'`,
        ),
      ],
      expect.objectContaining({
        encoding: "utf8",
        timeout: 10_000,
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: "1",
          ELECTRON_NO_ATTACH_CONSOLE: "1",
        }),
      }),
    );
  });

  it("merges parsed env output and restores electron env flags", () => {
    process.env.ELECTRON_RUN_AS_NODE = "preserve-run-as-node";
    delete process.env.ELECTRON_NO_ATTACH_CONSOLE;
    process.env.XDG_RUNTIME_DIR = "/tmp/original-runtime";

    spawnSync.mockReturnValue({
      status: 0,
      stdout: buildProbeOutput({
        PATH: "/usr/bin:/bin:/opt/homebrew/bin",
        FOO: "bar",
        ELECTRON_RUN_AS_NODE: "wrong",
        ELECTRON_NO_ATTACH_CONSOLE: "wrong",
        XDG_RUNTIME_DIR: "/tmp/new-runtime",
      }),
    });

    inheritLoginShellEnv();

    expect(process.env.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin");
    expect(process.env.FOO).toBe("bar");
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe("preserve-run-as-node");
    expect(process.env.ELECTRON_NO_ATTACH_CONSOLE).toBeUndefined();
    expect(process.env.XDG_RUNTIME_DIR).toBeUndefined();
  });

  it("keeps the inherited environment when the probe returns no output", () => {
    const originalPath = process.env.PATH;

    spawnSync.mockReturnValue({
      status: 0,
      stdout: "",
    });

    inheritLoginShellEnv();

    expect(process.env.PATH).toBe(originalPath);
  });
});
