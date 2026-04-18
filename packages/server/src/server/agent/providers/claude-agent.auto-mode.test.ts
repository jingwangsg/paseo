import { afterEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "pino";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const mockState = vi.hoisted(() => ({
  execCommand: vi.fn(),
  findExecutable: vi.fn(),
  isCommandAvailable: vi.fn(),
  spawnProcess: vi.fn(),
}));

vi.mock("../../../utils/executable.js", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/executable.js")>(
    "../../../utils/executable.js",
  );
  return {
    ...actual,
    findExecutable: mockState.findExecutable,
    isCommandAvailable: mockState.isCommandAvailable,
  };
});

vi.mock("../../../utils/spawn.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../../utils/spawn.js")>("../../../utils/spawn.js");
  return {
    ...actual,
    execCommand: mockState.execCommand,
    spawnProcess: mockState.spawnProcess,
  };
});

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./claude-agent.js";

type QueryMock = {
  next: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  return: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  setPermissionMode: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  supportedModels: ReturnType<typeof vi.fn>;
  supportedCommands: ReturnType<typeof vi.fn>;
  rewindFiles: ReturnType<typeof vi.fn>;
  [Symbol.asyncIterator]: () => AsyncIterator<Record<string, unknown>, void>;
};

function createBaseQueryMock(nextImpl: QueryMock["next"]): QueryMock {
  return {
    next: nextImpl,
    interrupt: vi.fn(async () => undefined),
    return: vi.fn(async () => undefined),
    close: vi.fn(() => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    supportedModels: vi.fn(async () => [{ value: "opus", displayName: "Opus" }]),
    supportedCommands: vi.fn(async () => []),
    rewindFiles: vi.fn(async () => ({ canRewind: true })),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function createSpyLogger(): Logger {
  const debug = vi.fn();
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();

  const loggerLike = {
    child: vi.fn(),
    debug,
    info,
    warn,
    error,
    fatal: error,
    trace: debug,
  };
  loggerLike.child.mockReturnValue(loggerLike);

  return loggerLike as unknown as Logger;
}

afterEach(() => {
  mockState.execCommand.mockReset();
  mockState.findExecutable.mockReset();
  mockState.isCommandAvailable.mockReset();
  mockState.spawnProcess.mockReset();
  mockState.spawnProcess.mockReturnValue({
    stderr: { on: vi.fn() },
    stdout: null,
    stdin: null,
    kill: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  });
});

describe("ClaudeAgentClient auto mode", () => {
  test("lists auto mode when the effective Claude runtime supports it", async () => {
    mockState.findExecutable.mockResolvedValue(null);
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
    });

    const modes = await (
      client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
    ).listModes();

    expect(modes.map((mode) => mode.id)).toContain("auto");
  });

  test("uses the bundled Claude runtime version for non-replace mode even when PATH has an older Claude binary", async () => {
    mockState.findExecutable.mockResolvedValue("/usr/local/bin/claude");
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.10 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
    });

    const modes = await (
      client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
    ).listModes();

    expect(modes.map((mode) => mode.id)).toContain("auto");
  });

  test("hides and rejects auto mode when the bundled Claude runtime version is below the minimum", async () => {
    mockState.findExecutable.mockResolvedValue("/usr/local/bin/claude");
    const readFileSpy = vi.spyOn(fs, "readFileSync");
    const originalReadFileSync = readFileSpy.getMockImplementation() ?? fs.readFileSync.bind(fs);

    readFileSpy.mockImplementation(((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
      if (String(filePath).endsWith("@anthropic-ai/claude-agent-sdk/package.json")) {
        return JSON.stringify({ claudeCodeVersion: "2.1.82" });
      }
      return originalReadFileSync(filePath as never, options as never);
    }) as typeof fs.readFileSync);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
    });

    try {
      const modes = await (
        client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
      ).listModes();
      expect(modes.map((mode) => mode.id)).not.toContain("auto");

      await expect(
        client.createSession({
          provider: "claude",
          cwd: process.cwd(),
          modeId: "auto",
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      readFileSpy.mockRestore();
    }
  });

  test("accepts auto mode at the bundled runtime minimum version boundary", async () => {
    mockState.findExecutable.mockResolvedValue("/usr/local/bin/claude");
    const originalReadFileSync = fs.readFileSync.bind(fs);
    const readFileSpy = vi.spyOn(fs, "readFileSync");

    readFileSpy.mockImplementation(((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
      if (String(filePath).endsWith("@anthropic-ai/claude-agent-sdk/package.json")) {
        return JSON.stringify({ claudeCodeVersion: "2.1.83" });
      }
      return originalReadFileSync(filePath as never, options as never);
    }) as typeof fs.readFileSync);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
    });

    try {
      const modes = await (
        client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
      ).listModes();
      expect(modes.map((mode) => mode.id)).toContain("auto");

      const session = await client.createSession({
        provider: "claude",
        cwd: process.cwd(),
        modeId: "auto",
      });
      await session.close();
    } finally {
      readFileSpy.mockRestore();
    }
  });

  test("launches the bundled SDK runtime in default mode even when PATH has a Claude binary", async () => {
    mockState.findExecutable.mockResolvedValue("/usr/local/bin/claude");
    let capturedPathToClaudeCodeExecutable: string | undefined;
    let capturedSpawnClaudeCodeProcess:
      | ((options: {
          command: string;
          args: string[];
          cwd: string;
          env: Record<string, string | undefined>;
          signal?: AbortSignal;
        }) => unknown)
      | undefined;

    const queryFactory = vi.fn(
      ({
        options,
      }: {
        options: {
          pathToClaudeCodeExecutable?: string;
          spawnClaudeCodeProcess?: (input: {
            command: string;
            args: string[];
            cwd: string;
            env: Record<string, string | undefined>;
            signal?: AbortSignal;
          }) => unknown;
        };
      }) => {
        capturedPathToClaudeCodeExecutable = options.pathToClaudeCodeExecutable;
        capturedSpawnClaudeCodeProcess = options.spawnClaudeCodeProcess;
        let step = 0;
        return createBaseQueryMock(
          vi.fn(async () => {
            if (step === 0) {
              step += 1;
              return {
                done: false,
                value: {
                  type: "system",
                  subtype: "init",
                  session_id: "claude-bundled-runtime-session",
                  permissionMode: "default",
                  model: "opus",
                },
              };
            }
            if (step === 1) {
              step += 1;
              return {
                done: false,
                value: {
                  type: "assistant",
                  message: { content: "done" },
                },
              };
            }
            if (step === 2) {
              step += 1;
              return {
                done: false,
                value: {
                  type: "result",
                  subtype: "success",
                  usage: {
                    input_tokens: 1,
                    cache_read_input_tokens: 0,
                    output_tokens: 1,
                  },
                  total_cost_usd: 0,
                },
              };
            }
            return { done: true, value: undefined };
          }),
        );
      },
    );

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory: queryFactory as never,
    });
    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
      modeId: "default",
    });

    try {
      await session.run("use bundled runtime");
      expect(capturedPathToClaudeCodeExecutable).toBeUndefined();
      expect(capturedSpawnClaudeCodeProcess).toBeDefined();
      capturedSpawnClaudeCodeProcess?.({
        command: "node",
        args: ["cli.js"],
        cwd: process.cwd(),
        env: {},
      });
      expect(mockState.spawnProcess).toHaveBeenCalledWith(
        process.execPath,
        ["cli.js"],
        expect.objectContaining({
          cwd: process.cwd(),
          shell: false,
        }),
      );
    } finally {
      await session.close();
    }
  });

  test("hides auto mode for replace-command runtimes below the required Claude version", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/tmp/mock-claude"],
        },
      },
    });

    const modes = await (
      client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
    ).listModes();

    expect(modes.map((mode) => mode.id)).not.toContain("auto");
  });

  test("rejects creating an auto-mode session for replace-command runtimes below the required Claude version", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/tmp/mock-claude"],
        },
      },
    });

    await expect(
      client.createSession({
        provider: "claude",
        cwd: process.cwd(),
        modeId: "auto",
      }),
    ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    expect(mockState.execCommand).toHaveBeenCalledWith(
      "/tmp/mock-claude",
      ["--version"],
      expect.objectContaining({
        cwd: process.cwd(),
        env: expect.any(Object),
      }),
    );
  });

  test("accepts auto mode at the replace-runtime minimum version boundary", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.83 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/tmp/mock-claude"],
        },
      },
    });

    const modes = await (
      client as unknown as { listModes: () => Promise<Array<{ id: string }>> }
    ).listModes();
    expect(modes.map((mode) => mode.id)).toContain("auto");

    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
      modeId: "auto",
    });
    await session.close();
  });

  test("rejects switching into auto mode for replace-command runtimes below the required Claude version", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/tmp/mock-claude"],
        },
      },
    });
    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
      modeId: "default",
    });

    try {
      await expect(session.setMode("auto")).rejects.toThrow(
        /requires a Claude runtime that supports auto mode/i,
      );
    } finally {
      await session.close();
    }
  });

  test("hides and rejects auto mode when Claude settings disable it", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "claude-auto-disabled-"));
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );
    const cwd = mkdtempSync(path.join(tmpdir(), "claude-project-"));
    mkdirSync(path.join(cwd, ".claude"), { recursive: true });

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        env: {
          CLAUDE_CONFIG_DIR: configDir,
        },
      },
    });

    try {
      const modes = await (
        client as unknown as {
          listModes: (input?: { cwd?: string }) => Promise<Array<{ id: string }>>;
        }
      ).listModes({ cwd });
      expect(modes.map((mode) => mode.id)).not.toContain("auto");

      await expect(
        client.createSession({
          provider: "claude",
          cwd,
          modeId: "auto",
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hides and rejects auto mode when project Claude settings disable it", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "claude-project-settings-"));
    mkdirSync(path.join(cwd, ".claude"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".claude", "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      const modes = await (
        client as unknown as {
          listModes: (input?: { cwd?: string }) => Promise<Array<{ id: string }>>;
        }
      ).listModes({ cwd });
      expect(modes.map((mode) => mode.id)).not.toContain("auto");

      await expect(
        client.createSession({
          provider: "claude",
          cwd,
          modeId: "auto",
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("launch-context CLAUDE_CONFIG_DIR disables auto mode for session mode listing and switching", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "claude-launch-context-"));
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });
    const session = await client.createSession(
      {
        provider: "claude",
        cwd: process.cwd(),
        modeId: "default",
      },
      {
        env: {
          CLAUDE_CONFIG_DIR: configDir,
        },
      },
    );

    try {
      expect((await session.getAvailableModes()).map((mode) => mode.id)).not.toContain("auto");
      await expect(session.setMode("auto")).rejects.toThrow(
        /requires a Claude runtime that supports auto mode/i,
      );
    } finally {
      await session.close();
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("launch-context CLAUDE_CONFIG_DIR wins over runtimeSettings.env for auto-mode gating", async () => {
    const runtimeConfigDir = mkdtempSync(path.join(tmpdir(), "claude-runtime-settings-"));
    const launchConfigDir = mkdtempSync(path.join(tmpdir(), "claude-launch-settings-"));
    writeFileSync(
      path.join(launchConfigDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        env: {
          CLAUDE_CONFIG_DIR: runtimeConfigDir,
        },
      },
    });

    try {
      await expect(
        client.createSession(
          {
            provider: "claude",
            cwd: process.cwd(),
            modeId: "auto",
          },
          {
            env: {
              CLAUDE_CONFIG_DIR: launchConfigDir,
            },
          },
        ),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(runtimeConfigDir, { recursive: true, force: true });
      rmSync(launchConfigDir, { recursive: true, force: true });
    }
  });

  test("HOME override participates in auto-mode settings resolution when CLAUDE_CONFIG_DIR is absent", async () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), "claude-home-override-"));
    const configDir = path.join(homeDir, ".claude");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      await expect(
        client.createSession(
          {
            provider: "claude",
            cwd: process.cwd(),
            modeId: "auto",
          },
          {
            env: {
              HOME: homeDir,
            },
          },
        ),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test("launch-context CLAUDE_CONFIG_DIR rejects creating an auto-mode session", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "claude-launch-context-create-"));
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      await expect(
        client.createSession(
          {
            provider: "claude",
            cwd: process.cwd(),
            modeId: "auto",
          },
          {
            env: {
              CLAUDE_CONFIG_DIR: configDir,
            },
          },
        ),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("extra.claude.pathToClaudeCodeExecutable controls auto-mode version gating", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    await expect(
      client.createSession({
        provider: "claude",
        cwd: process.cwd(),
        modeId: "auto",
        extra: {
          claude: {
            pathToClaudeCodeExecutable: "/tmp/old-claude",
          },
        },
      }),
    ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    expect(mockState.execCommand).toHaveBeenCalledWith(
      "/tmp/old-claude",
      ["--version"],
      expect.objectContaining({
        cwd: process.cwd(),
        env: expect.any(Object),
      }),
    );
  });

  test("replace-command version probing uses the effective cwd and merged env", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });

    const cwd = mkdtempSync(path.join(tmpdir(), "claude-replace-probe-"));
    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["claude"],
        },
        env: {
          PATH: "/tmp/runtime-bin",
        },
      },
    });

    try {
      await expect(
        client.createSession({
          provider: "claude",
          cwd,
          modeId: "auto",
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
      expect(mockState.execCommand).toHaveBeenCalledWith(
        "claude",
        ["--version"],
        expect.objectContaining({
          cwd,
          env: expect.objectContaining({
            PATH: "/tmp/runtime-bin",
          }),
        }),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("relative extra.claude.pathToClaudeCodeExecutable version probing uses the effective cwd and env", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });

    const cwd = mkdtempSync(path.join(tmpdir(), "claude-extra-probe-"));
    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      await expect(
        client.createSession(
          {
            provider: "claude",
            cwd,
            modeId: "auto",
            extra: {
              claude: {
                pathToClaudeCodeExecutable: "claude-relative",
                env: {
                  PATH: "/tmp/extra-bin",
                },
              },
            },
          },
          {
            env: {
              PATH: "/tmp/launch-bin",
            },
          },
        ),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
      expect(mockState.execCommand).toHaveBeenCalledWith(
        "claude-relative",
        ["--version"],
        expect.objectContaining({
          cwd,
          env: expect.objectContaining({
            PATH: "/tmp/launch-bin",
          }),
        }),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("extra.claude.env CLAUDE_CONFIG_DIR disables auto mode", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "claude-extra-env-"));
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      await expect(
        client.createSession({
          provider: "claude",
          cwd: process.cwd(),
          modeId: "auto",
          extra: {
            claude: {
              env: {
                CLAUDE_CONFIG_DIR: configDir,
              },
            },
          },
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("extra.claude.settingSources can exclude user settings from auto-mode gating", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "claude-setting-sources-"));
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        env: {
          CLAUDE_CONFIG_DIR: configDir,
        },
      },
    });

    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
      modeId: "auto",
      extra: {
        claude: {
          settingSources: ["project"],
        },
      },
    });

    try {
      expect(await session.getCurrentMode()).toBe("auto");
    } finally {
      await session.close();
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("extra.claude.settingSources honors local settings.local.json for auto-mode gating", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "claude-local-setting-sources-"));
    mkdirSync(path.join(cwd, ".claude"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".claude", "settings.local.json"),
      JSON.stringify({ disableAutoMode: "disable" }, null, 2),
      "utf8",
    );

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
    });

    try {
      await expect(
        client.createSession({
          provider: "claude",
          cwd,
          modeId: "auto",
          extra: {
            claude: {
              settingSources: ["local"],
            },
          },
        }),
      ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects resuming an auto-mode session on an unsupported runtime", async () => {
    mockState.execCommand.mockResolvedValue({
      stdout: "2.1.82 (Claude Code)\n",
      stderr: "",
      exitCode: 0,
    });
    mockState.isCommandAvailable.mockResolvedValue(true);

    const client = new ClaudeAgentClient({
      logger: createSpyLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/tmp/mock-claude"],
        },
      },
    });

    await expect(
      client.resumeSession({
        provider: "claude",
        sessionId: "persisted-session",
        metadata: {
          provider: "claude",
          cwd: process.cwd(),
          modeId: "auto",
        },
      }),
    ).rejects.toThrow(/requires a Claude runtime that supports auto mode/i);
  });

  test("passes auto mode through Claude query options", async () => {
    let capturedPermissionMode: string | undefined;
    const queryFactory = vi.fn(({ options }: { options: { permissionMode?: string } }) => {
      capturedPermissionMode = options.permissionMode;
      let step = 0;
      return createBaseQueryMock(
        vi.fn(async () => {
          if (step === 0) {
            step += 1;
            return {
              done: false,
              value: {
                type: "system",
                subtype: "init",
                session_id: "claude-auto-mode-session",
                permissionMode: "auto",
                model: "opus",
              },
            };
          }
          if (step === 1) {
            step += 1;
            return {
              done: false,
              value: {
                type: "assistant",
                message: { content: "done" },
              },
            };
          }
          if (step === 2) {
            step += 1;
            return {
              done: false,
              value: {
                type: "result",
                subtype: "success",
                usage: {
                  input_tokens: 1,
                  cache_read_input_tokens: 0,
                  output_tokens: 1,
                },
                total_cost_usd: 0,
              },
            };
          }
          return { done: true, value: undefined };
        }),
      );
    });

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory: queryFactory as never,
    });
    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
      modeId: "auto",
    });

    try {
      await session.run("trigger auto mode");
      expect(capturedPermissionMode).toBe("auto");
      expect(await session.getCurrentMode()).toBe("auto");
    } finally {
      await session.close();
    }
  });
});
