# Remote SSH Host Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Paseo daemon on a master dev machine manage AI agent and terminal sessions on multiple remote SSH hosts, with remote daemons running independently (surviving master disconnects) and the master proxying all remote state to App/CLI clients.

**Architecture:** The master daemon maintains a `RemoteHostManager` that owns per-host SSH tunnels, deploys remote Paseo daemons as Node.js SEA binaries, syncs remote state via HTTP polling, and proxies agent/terminal operations through the tunnels. Clients see remote sessions grouped by host in the sidebar, communicate exclusively with the master daemon (unchanged WS protocol), and the master routes requests to the appropriate remote daemon.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js SEA (single executable), Commander (CLI), React Native/Expo (App), Zustand, ssh system binary, Biome formatting.

---

## File Structure

### New files (server — remote module)

| File | Responsibility |
|---|---|
| `packages/server/src/server/remote/types.ts` | Shared types: `RemoteHostRecord`, `RemoteHostStatus`, state enum |
| `packages/server/src/server/remote/remote-host-registry.ts` | `hosts.json` persistence (FileBackedRegistry pattern) |
| `packages/server/src/server/remote/remote-host-registry.test.ts` | Registry CRUD + backward-compat tests |
| `packages/server/src/server/remote/ssh-client.ts` | Thin wrapper over system `ssh` binary |
| `packages/server/src/server/remote/ssh-client.test.ts` | Unit tests (mocked child_process) |
| `packages/server/src/server/remote/ssh-tunnel.ts` | SSH port-forward tunnel lifecycle |
| `packages/server/src/server/remote/ssh-tunnel.test.ts` | Tunnel lifecycle tests |
| `packages/server/src/server/remote/remote-deploy.ts` | Remote daemon detection, upload, start |
| `packages/server/src/server/remote/remote-deploy.test.ts` | Deploy flow tests |
| `packages/server/src/server/remote/remote-host-manager.ts` | Per-host state machine, scanner loop, orchestration |
| `packages/server/src/server/remote/remote-host-manager.test.ts` | State transitions, scanner, reconnect tests |
| `packages/server/src/server/remote/remote-sync.ts` | HTTP polling of remote daemon state → local mirror |
| `packages/server/src/server/remote/remote-sync.test.ts` | Sync upsert/prune tests |
| `packages/server/src/server/remote/remote-proxy.ts` | WS proxy for agent timeline + terminal I/O |
| `packages/server/src/server/remote/remote-proxy.test.ts` | Proxy bidirectional forwarding tests |

### New files (CLI)

| File | Responsibility |
|---|---|
| `packages/cli/src/commands/host/index.ts` | `paseo host` command group |
| `packages/cli/src/commands/host/add.ts` | `paseo host add <alias>` |
| `packages/cli/src/commands/host/remove.ts` | `paseo host remove <alias>` |
| `packages/cli/src/commands/host/ls.ts` | `paseo host ls` |
| `packages/cli/src/commands/host/status.ts` | `paseo host status <alias>` |
| `packages/cli/src/commands/host/retry.ts` | `paseo host retry <alias>` |
| `packages/cli/src/commands/host/deploy.ts` | `paseo host deploy <alias>` |

### New files (App)

| File | Responsibility |
|---|---|
| `packages/app/src/components/sidebar-host-group.tsx` | Host group header in sidebar |
| `packages/app/src/components/sidebar-host-group.test.tsx` | Render tests |
| `packages/app/src/screens/host-management-screen.tsx` | Settings screen for host CRUD |

### Modified files

| File | Change |
|---|---|
| `packages/server/src/shared/messages.ts` | Extend `ExecutionHostSchema` with `ssh` variant; add host management inbound/outbound message schemas |
| `packages/server/src/server/workspace-registry.ts` | No changes (already has `executionHost`) |
| `packages/server/src/server/bootstrap.ts` | Wire `RemoteHostManager` into daemon lifecycle |
| `packages/server/src/server/session.ts` | Route dispatch: check `executionHost`, forward to remote proxy when `kind === "ssh"` |
| `packages/cli/src/cli.ts` | Register `host` command group |
| `packages/cli/src/commands/agent/run.ts` | Add `--host` option |
| `packages/cli/src/commands/agent/ls.ts` | Add `--host` filter, show host column |
| `packages/app/src/stores/session-store.ts` | Add `remoteHosts` state slice |
| `packages/app/src/hooks/use-sidebar-workspaces-list.ts` | Group projects by `executionHost` |
| `packages/app/src/components/sidebar-workspace-list.tsx` | Render host group headers |

---

## Task 1: Extend `ExecutionHostSchema` with SSH variant

**Files:**
- Modify: `packages/server/src/shared/messages.ts:207-213`
- Modify: `packages/server/src/shared/messages.execution-host.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/server/src/shared/messages.execution-host.test.ts`, first update the existing "rejects unknown kind" test (it currently uses `{kind: "ssh"}` which will now be valid), then add new tests:

```typescript
// REPLACE the existing "rejects unknown kind" test:
test("rejects unknown kind", () => {
  expect(() => ExecutionHostSchema.parse({ kind: "docker", image: "x" })).toThrow();
});

// ADD new tests:
test("parses ssh host", () => {
  const result = ExecutionHostSchema.parse({
    kind: "ssh",
    hostAlias: "devbox",
    hostname: "192.168.1.100",
  });
  expect(result).toEqual({
    kind: "ssh",
    hostAlias: "devbox",
    hostname: "192.168.1.100",
  });
});

test("parses ssh host with all optional fields", () => {
  const result = ExecutionHostSchema.parse({
    kind: "ssh",
    hostAlias: "devbox",
    hostname: "192.168.1.100",
    user: "jing",
    port: 2222,
    identityFile: "~/.ssh/id_ed25519",
  });
  expect(result).toEqual({
    kind: "ssh",
    hostAlias: "devbox",
    hostname: "192.168.1.100",
    user: "jing",
    port: 2222,
    identityFile: "~/.ssh/id_ed25519",
  });
});

test("rejects ssh host missing hostname", () => {
  expect(() =>
    ExecutionHostSchema.parse({ kind: "ssh", hostAlias: "devbox" }),
  ).toThrow();
});

test("rejects ssh host missing hostAlias", () => {
  expect(() =>
    ExecutionHostSchema.parse({ kind: "ssh", hostname: "192.168.1.100" }),
  ).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/shared/messages.execution-host.test.ts --bail=1`

Expected: FAIL — `ssh` kind not recognized by discriminated union.

- [ ] **Step 3: Extend the schema**

In `packages/server/src/shared/messages.ts`, replace lines 207-213:

```typescript
export const ExecutionHostSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local") }),
  z.object({
    kind: z.literal("ssh"),
    hostAlias: z.string(),
    hostname: z.string(),
    user: z.string().optional(),
    port: z.number().optional(),
    identityFile: z.string().optional(),
  }),
]);

export function defaultExecutionHost(): z.infer<typeof ExecutionHostSchema> {
  return { kind: "local" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/shared/messages.execution-host.test.ts --bail=1`

Expected: all tests PASS.

- [ ] **Step 5: Run existing backward-compat tests**

Run: `npx vitest run packages/server/src/server/workspace-registry.test.ts --bail=1`

Expected: PASS — legacy records without `executionHost` still default to `{kind: "local"}`.

- [ ] **Step 6: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/shared/messages.ts packages/server/src/shared/messages.execution-host.test.ts
git commit -m "feat(schema): extend ExecutionHostSchema with ssh variant"
```

---

## Task 2: Add host management WS message schemas

**Files:**
- Modify: `packages/server/src/shared/messages.ts` (add schemas near line ~1430, register in inbound/outbound unions)

- [ ] **Step 1: Add inbound message schemas**

In `packages/server/src/shared/messages.ts`, before `SessionInboundMessageSchema`, add:

```typescript
// ---------------------------------------------------------------------------
// Remote host management messages
// ---------------------------------------------------------------------------

const AddRemoteHostRequestSchema = z.object({
  type: z.literal("add_remote_host_request"),
  requestId: z.string(),
  hostAlias: z.string(),
  hostname: z.string(),
  user: z.string().optional(),
  port: z.number().optional(),
  identityFile: z.string().optional(),
});

const RemoveRemoteHostRequestSchema = z.object({
  type: z.literal("remove_remote_host_request"),
  requestId: z.string(),
  hostAlias: z.string(),
});

const FetchRemoteHostsRequestSchema = z.object({
  type: z.literal("fetch_remote_hosts_request"),
  requestId: z.string(),
});

const RetryRemoteHostRequestSchema = z.object({
  type: z.literal("retry_remote_host_request"),
  requestId: z.string(),
  hostAlias: z.string(),
});

const DeployRemoteHostRequestSchema = z.object({
  type: z.literal("deploy_remote_host_request"),
  requestId: z.string(),
  hostAlias: z.string(),
});
```

- [ ] **Step 2: Add outbound message schemas**

Before `SessionOutboundMessageSchema`, add:

```typescript
const RemoteHostStatusPayloadSchema = z.object({
  hostAlias: z.string(),
  hostname: z.string(),
  user: z.string().optional(),
  port: z.number().optional(),
  status: z.enum([
    "registered",
    "connecting",
    "deploying",
    "ready",
    "unreachable",
    "failed",
  ]),
  tunnelPort: z.number().optional(),
  daemonVersion: z.string().optional(),
  error: z.string().optional(),
});

const AddRemoteHostResponseSchema = z.object({
  type: z.literal("add_remote_host_response"),
  payload: z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    host: RemoteHostStatusPayloadSchema.optional(),
  }),
});

const RemoveRemoteHostResponseSchema = z.object({
  type: z.literal("remove_remote_host_response"),
  payload: z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

const FetchRemoteHostsResponseSchema = z.object({
  type: z.literal("fetch_remote_hosts_response"),
  payload: z.object({
    requestId: z.string(),
    hosts: z.array(RemoteHostStatusPayloadSchema),
  }),
});

const RemoteHostUpdateSchema = z.object({
  type: z.literal("remote_host_update"),
  payload: z.object({
    host: RemoteHostStatusPayloadSchema,
  }),
});

const RetryRemoteHostResponseSchema = z.object({
  type: z.literal("retry_remote_host_response"),
  payload: z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

const DeployRemoteHostResponseSchema = z.object({
  type: z.literal("deploy_remote_host_response"),
  payload: z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});
```

- [ ] **Step 3: Register in inbound/outbound unions**

Add to `SessionInboundMessageSchema` array:

```typescript
  AddRemoteHostRequestSchema,
  RemoveRemoteHostRequestSchema,
  FetchRemoteHostsRequestSchema,
  RetryRemoteHostRequestSchema,
  DeployRemoteHostRequestSchema,
```

Add to `SessionOutboundMessageSchema` array:

```typescript
  AddRemoteHostResponseSchema,
  RemoveRemoteHostResponseSchema,
  FetchRemoteHostsResponseSchema,
  RemoteHostUpdateSchema,
  RetryRemoteHostResponseSchema,
  DeployRemoteHostResponseSchema,
```

- [ ] **Step 4: Export types**

Near the other `export type` lines at the end of the file:

```typescript
export type RemoteHostStatusPayload = z.infer<typeof RemoteHostStatusPayloadSchema>;
```

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/shared/messages.ts
git commit -m "feat(schema): add remote host management WS message schemas"
```

---

## Task 3: Remote host registry (`hosts.json` persistence)

**Files:**
- Create: `packages/server/src/server/remote/types.ts`
- Create: `packages/server/src/server/remote/remote-host-registry.ts`
- Create: `packages/server/src/server/remote/remote-host-registry.test.ts`

- [ ] **Step 1: Create shared types**

Create `packages/server/src/server/remote/types.ts`:

```typescript
import { z } from "zod";

export const RemoteHostRecordSchema = z.object({
  hostAlias: z.string(),
  hostname: z.string(),
  user: z.string().optional(),
  port: z.number().optional(),
  identityFile: z.string().optional(),
  addedAt: z.string(),
});

export type RemoteHostRecord = z.infer<typeof RemoteHostRecordSchema>;

export type RemoteHostConnectionStatus =
  | "registered"
  | "connecting"
  | "deploying"
  | "ready"
  | "unreachable"
  | "failed";

export interface RemoteHostState {
  record: RemoteHostRecord;
  status: RemoteHostConnectionStatus;
  tunnelPort: number | null;
  daemonVersion: string | null;
  error: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/server/src/server/remote/remote-host-registry.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import pino from "pino";
import { RemoteHostRegistry } from "./remote-host-registry.js";

const SILENT_LOGGER = pino({ level: "silent" });

describe("RemoteHostRegistry", () => {
  let dir: string;
  let registry: RemoteHostRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-hosts-"));
    registry = new RemoteHostRegistry(path.join(dir, "hosts.json"), SILENT_LOGGER);
    await registry.initialize();
  });

  test("starts empty", async () => {
    const hosts = await registry.list();
    expect(hosts).toEqual([]);
  });

  test("add and get a host", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      user: "jing",
      addedAt: "2026-04-18T00:00:00.000Z",
    });
    const host = await registry.get("devbox");
    expect(host?.hostAlias).toBe("devbox");
    expect(host?.hostname).toBe("192.168.1.100");
    expect(host?.user).toBe("jing");
  });

  test("remove a host", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      addedAt: "2026-04-18T00:00:00.000Z",
    });
    await registry.remove("devbox");
    const host = await registry.get("devbox");
    expect(host).toBeNull();
  });

  test("persists across reloads", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      addedAt: "2026-04-18T00:00:00.000Z",
    });

    const registry2 = new RemoteHostRegistry(path.join(dir, "hosts.json"), SILENT_LOGGER);
    await registry2.initialize();
    const host = await registry2.get("devbox");
    expect(host?.hostAlias).toBe("devbox");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-host-registry.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the registry**

Create `packages/server/src/server/remote/remote-host-registry.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { z } from "zod";
import { RemoteHostRecordSchema, type RemoteHostRecord } from "./types.js";

export class RemoteHostRegistry {
  private readonly filePath: string;
  private readonly logger: Logger;
  private loaded = false;
  private readonly cache = new Map<string, RemoteHostRecord>();
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string, logger: Logger) {
    this.filePath = filePath;
    this.logger = logger.child({ module: "remote-host-registry" });
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  async list(): Promise<RemoteHostRecord[]> {
    await this.load();
    return Array.from(this.cache.values());
  }

  async get(hostAlias: string): Promise<RemoteHostRecord | null> {
    await this.load();
    return this.cache.get(hostAlias) ?? null;
  }

  async upsert(record: RemoteHostRecord): Promise<void> {
    await this.load();
    const parsed = RemoteHostRecordSchema.parse(record);
    this.cache.set(parsed.hostAlias, parsed);
    await this.enqueuePersist();
  }

  async remove(hostAlias: string): Promise<void> {
    await this.load();
    if (!this.cache.delete(hostAlias)) {
      return;
    }
    await this.enqueuePersist();
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.cache.clear();
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = z.array(RemoteHostRecordSchema).parse(JSON.parse(raw));
      for (const record of parsed) {
        this.cache.set(record.hostAlias, record);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        this.logger.error({ err: error, filePath: this.filePath }, "Failed to load hosts registry");
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const records = Array.from(this.cache.values());
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(records, null, 2), "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  private async enqueuePersist(): Promise<void> {
    const nextPersist = this.persistQueue.then(() => this.persist());
    this.persistQueue = nextPersist.catch(() => {});
    await nextPersist;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-host-registry.test.ts --bail=1`

Expected: all 4 tests PASS.

- [ ] **Step 6: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/server/remote/types.ts packages/server/src/server/remote/remote-host-registry.ts packages/server/src/server/remote/remote-host-registry.test.ts
git commit -m "feat(remote): add RemoteHostRegistry for hosts.json persistence"
```

---

## Task 4: SSH client wrapper

**Files:**
- Create: `packages/server/src/server/remote/ssh-client.ts`
- Create: `packages/server/src/server/remote/ssh-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/ssh-client.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/ssh-client.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SshClient**

Create `packages/server/src/server/remote/ssh-client.ts`:

```typescript
import { spawn } from "node:child_process";

export interface SshClientConfig {
  hostname: string;
  user?: string;
  port?: number;
  identityFile?: string;
  connectTimeoutSec?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class SshClient {
  private readonly config: SshClientConfig;

  constructor(config: SshClientConfig) {
    this.config = config;
  }

  buildSshArgs(): string[] {
    const args: string[] = [
      "-o", "BatchMode=yes",
      "-o", `ConnectTimeout=${this.config.connectTimeoutSec ?? 10}`,
      "-o", "StrictHostKeyChecking=accept-new",
    ];
    if (this.config.user) {
      args.push("-l", this.config.user);
    }
    if (this.config.port) {
      args.push("-p", String(this.config.port));
    }
    if (this.config.identityFile) {
      args.push("-i", this.config.identityFile);
    }
    args.push(this.config.hostname);
    return args;
  }

  async exec(command: string): Promise<ExecResult> {
    const args = [...this.buildSshArgs(), command];
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
    });
  }

  async execChecked(command: string): Promise<string> {
    const result = await this.exec(command);
    if (result.exitCode !== 0) {
      throw new Error(
        `SSH command failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    return result.stdout;
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.exec("true");
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async upload(data: Buffer, remotePath: string): Promise<void> {
    const args = [...this.buildSshArgs(), `cat > ${remotePath}`];
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(`Upload failed (exit ${exitCode}): ${stderr.trim()}`));
        } else {
          resolve();
        }
      });
      child.stdin.end(data);
    });
  }

  async detectRemoteArch(): Promise<string> {
    const output = await this.execChecked("uname -sm");
    return output.trim();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/ssh-client.test.ts --bail=1`

Expected: all 4 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/ssh-client.ts packages/server/src/server/remote/ssh-client.test.ts
git commit -m "feat(remote): add SshClient wrapper over system ssh binary"
```

---

## Task 5: SSH tunnel management

**Files:**
- Create: `packages/server/src/server/remote/ssh-tunnel.ts`
- Create: `packages/server/src/server/remote/ssh-tunnel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/ssh-tunnel.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/ssh-tunnel.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SSH tunnel**

Create `packages/server/src/server/remote/ssh-tunnel.ts`:

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import type { Logger } from "pino";

export interface TunnelConfig {
  hostname: string;
  localPort: number;
  remotePort: number;
  user?: string;
  port?: number;
  identityFile?: string;
}

export function buildTunnelArgs(config: TunnelConfig): string[] {
  const args: string[] = [
    "-N",
    "-L", `127.0.0.1:${config.localPort}:127.0.0.1:${config.remotePort}`,
    "-S", "none",
    "-o", "ControlMaster=no",
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=10",
    "-o", "ServerAliveCountMax=3",
  ];
  if (config.user) {
    args.push("-l", config.user);
  }
  if (config.port) {
    args.push("-p", String(config.port));
  }
  if (config.identityFile) {
    args.push("-i", config.identityFile);
  }
  args.push(config.hostname);
  return args;
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to get address"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const { createConnection } = await import("node:net");
  const start = Date.now();
  const intervalMs = 500;

  while (Date.now() - start < timeoutMs) {
    const reachable = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: "127.0.0.1", port });
      sock.on("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (reachable) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export interface SshTunnel {
  localPort: number;
  close(): void;
  readonly alive: boolean;
}

export async function startTunnel(
  config: Omit<TunnelConfig, "localPort">,
  logger: Logger,
): Promise<SshTunnel> {
  const localPort = await findFreePort();
  const args = buildTunnelArgs({ ...config, localPort });

  const child: ChildProcess = spawn("ssh", args, {
    stdio: ["ignore", "ignore", "pipe"],
    detached: false,
  });

  let alive = true;
  child.on("exit", () => {
    alive = false;
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    logger.debug({ tunnel: config.hostname }, `tunnel stderr: ${chunk.toString("utf8").trim()}`);
  });

  const ready = await waitForPort(localPort, 10_000);
  if (!ready) {
    child.kill();
    throw new Error(`SSH tunnel to ${config.hostname} failed: port ${localPort} not reachable after 10s`);
  }

  logger.info(
    { hostname: config.hostname, localPort, remotePort: config.remotePort },
    "SSH tunnel established",
  );

  return {
    localPort,
    close() {
      if (alive) {
        child.kill();
        alive = false;
      }
    },
    get alive() {
      return alive;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/ssh-tunnel.test.ts --bail=1`

Expected: all 2 tests PASS (these test arg construction, not actual SSH).

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/ssh-tunnel.ts packages/server/src/server/remote/ssh-tunnel.test.ts
git commit -m "feat(remote): add SSH tunnel management with port-forward lifecycle"
```

---

## Task 6: Remote daemon deployment

**Files:**
- Create: `packages/server/src/server/remote/remote-deploy.ts`
- Create: `packages/server/src/server/remote/remote-deploy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/remote-deploy.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { mapUnameToTarget, remoteStartCommand, REMOTE_DAEMON_PORT } from "./remote-deploy.js";

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-deploy.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement remote deploy**

Create `packages/server/src/server/remote/remote-deploy.ts`:

```typescript
import type { Logger } from "pino";
import type { SshClient } from "./ssh-client.js";

export const REMOTE_DAEMON_PORT = 6767;
const REMOTE_BIN_PATH = "~/.paseo/bin/paseo-daemon";
const REMOTE_PID_PATH = "~/.paseo/paseo.pid";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 20;

export function mapUnameToTarget(uname: string): string {
  const mapping: Record<string, string> = {
    "Linux x86_64": "x64-linux",
    "Linux aarch64": "arm64-linux",
    "Darwin arm64": "arm64-darwin",
    "Darwin x86_64": "x64-darwin",
  };
  const target = mapping[uname];
  if (!target) {
    throw new Error(`Unsupported remote platform: ${uname}`);
  }
  return target;
}

export function remoteStartCommand(): string {
  return `${REMOTE_BIN_PATH} --daemon --no-host-scan --listen 127.0.0.1:${REMOTE_DAEMON_PORT}`;
}

export async function getRemoteVersion(ssh: SshClient): Promise<string | null> {
  try {
    const output = await ssh.execChecked(`${REMOTE_BIN_PATH} --version`);
    return output.trim();
  } catch {
    return null;
  }
}

export async function isRemoteDaemonRunning(ssh: SshClient): Promise<boolean> {
  try {
    const result = await ssh.exec(
      `pid=$(cat ${REMOTE_PID_PATH} 2>/dev/null) && [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null`,
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function killRemoteDaemon(ssh: SshClient, logger: Logger): Promise<void> {
  const script = [
    `pid=$(cat ${REMOTE_PID_PATH} 2>/dev/null)`,
    `if [ -n "$pid" ]; then`,
    `  kill "$pid" 2>/dev/null`,
    `  for i in 1 2 3; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done`,
    `fi`,
    `rm -f ${REMOTE_PID_PATH}`,
  ].join("; ");

  await ssh.exec(script);
  logger.info("Killed existing remote daemon");
}

export async function uploadBinary(
  ssh: SshClient,
  binary: Buffer,
  logger: Logger,
): Promise<void> {
  await ssh.execChecked("mkdir -p ~/.paseo/bin");
  await ssh.upload(binary, REMOTE_BIN_PATH);
  await ssh.execChecked(`chmod +x ${REMOTE_BIN_PATH}`);
  logger.info({ size: binary.length }, "Uploaded remote daemon binary");
}

export async function startRemoteDaemon(ssh: SshClient, logger: Logger): Promise<void> {
  const cmd = remoteStartCommand();
  // Use nohup + background to detach from SSH session
  await ssh.exec(`nohup ${cmd} > /dev/null 2>&1 &`);
  logger.info("Remote daemon start command issued");
}

export async function waitForRemoteDaemon(
  ssh: SshClient,
  logger: Logger,
): Promise<boolean> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const running = await isRemoteDaemonRunning(ssh);
    if (running) {
      // Also check TCP port reachability
      const portCheck = await ssh.exec(
        `(echo > /dev/tcp/127.0.0.1/${REMOTE_DAEMON_PORT}) 2>/dev/null`,
      );
      if (portCheck.exitCode === 0) {
        logger.info("Remote daemon is ready");
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  logger.warn("Remote daemon did not become ready within timeout");
  return false;
}

export interface DeployResult {
  success: boolean;
  version: string | null;
  error?: string;
}

export async function ensureRemoteDaemon(options: {
  ssh: SshClient;
  localVersion: string;
  getBinary: (target: string) => Promise<Buffer>;
  logger: Logger;
}): Promise<DeployResult> {
  const { ssh, localVersion, getBinary, logger } = options;

  // 1. Detect remote arch
  const uname = await ssh.detectRemoteArch();
  const target = mapUnameToTarget(uname);
  logger.info({ uname, target }, "Detected remote platform");

  // 2. Check existing version
  const remoteVersion = await getRemoteVersion(ssh);
  logger.info({ remoteVersion, localVersion }, "Version comparison");

  if (remoteVersion === localVersion) {
    // Version matches — just ensure it's running
    const running = await isRemoteDaemonRunning(ssh);
    if (running) {
      logger.info("Remote daemon already running with matching version");
      return { success: true, version: remoteVersion };
    }
    logger.info("Remote daemon not running, starting...");
    await startRemoteDaemon(ssh, logger);
    const ready = await waitForRemoteDaemon(ssh, logger);
    return { success: ready, version: remoteVersion };
  }

  // 3. Get binary for target platform
  const binary = await getBinary(target);

  // 4. Kill existing if running
  if (remoteVersion) {
    await killRemoteDaemon(ssh, logger);
  }

  // 5. Upload and start
  await uploadBinary(ssh, binary, logger);
  await startRemoteDaemon(ssh, logger);
  const ready = await waitForRemoteDaemon(ssh, logger);

  if (!ready) {
    return { success: false, version: null, error: "Remote daemon failed to start" };
  }

  const newVersion = await getRemoteVersion(ssh);
  return { success: true, version: newVersion };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-deploy.test.ts --bail=1`

Expected: all 6 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/remote-deploy.ts packages/server/src/server/remote/remote-deploy.test.ts
git commit -m "feat(remote): add remote daemon deployment (detect, upload, start)"
```

---

## Task 7: RemoteHostManager — state machine and scanner

**Files:**
- Create: `packages/server/src/server/remote/remote-host-manager.ts`
- Create: `packages/server/src/server/remote/remote-host-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/remote-host-manager.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from "vitest";
import { RemoteHostManager } from "./remote-host-manager.js";
import type { RemoteHostRegistry } from "./remote-host-registry.js";
import type { RemoteHostRecord } from "./types.js";
import pino from "pino";

const SILENT_LOGGER = pino({ level: "silent" });

function stubRegistry(hosts: RemoteHostRecord[] = []): RemoteHostRegistry {
  const map = new Map(hosts.map((h) => [h.hostAlias, h]));
  return {
    initialize: vi.fn(),
    list: vi.fn(async () => Array.from(map.values())),
    get: vi.fn(async (alias: string) => map.get(alias) ?? null),
    upsert: vi.fn(async (record: RemoteHostRecord) => { map.set(record.hostAlias, record); }),
    remove: vi.fn(async (alias: string) => { map.delete(alias); }),
  };
}

describe("RemoteHostManager", () => {
  test("addHost registers and sets status to registered", async () => {
    const registry = stubRegistry();
    const manager = new RemoteHostManager({ registry, logger: SILENT_LOGGER, localVersion: "1.0.0" });

    await manager.addHost({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
    });

    const statuses = manager.listStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].hostAlias).toBe("devbox");
    expect(statuses[0].status).toBe("registered");
  });

  test("removeHost clears state and registry", async () => {
    const registry = stubRegistry([
      { hostAlias: "devbox", hostname: "192.168.1.100", addedAt: "2026-04-18T00:00:00.000Z" },
    ]);
    const manager = new RemoteHostManager({ registry, logger: SILENT_LOGGER, localVersion: "1.0.0" });
    await manager.initialize();

    await manager.removeHost("devbox");

    expect(manager.listStatuses()).toHaveLength(0);
    expect(registry.remove).toHaveBeenCalledWith("devbox");
  });

  test("getHostState returns null for unknown host", () => {
    const registry = stubRegistry();
    const manager = new RemoteHostManager({ registry, logger: SILENT_LOGGER, localVersion: "1.0.0" });

    expect(manager.getHostState("unknown")).toBeNull();
  });

  test("initialize loads hosts from registry as registered", async () => {
    const registry = stubRegistry([
      { hostAlias: "devbox", hostname: "192.168.1.100", addedAt: "2026-04-18T00:00:00.000Z" },
      { hostAlias: "gpu", hostname: "10.0.0.5", user: "admin", addedAt: "2026-04-18T00:00:00.000Z" },
    ]);
    const manager = new RemoteHostManager({ registry, logger: SILENT_LOGGER, localVersion: "1.0.0" });
    await manager.initialize();

    const statuses = manager.listStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses.every((s) => s.status === "registered")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-host-manager.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement RemoteHostManager**

Create `packages/server/src/server/remote/remote-host-manager.ts`:

```typescript
import type { Logger } from "pino";
import { EventEmitter } from "node:events";
import type { RemoteHostRegistry } from "./remote-host-registry.js";
import type { RemoteHostRecord, RemoteHostConnectionStatus, RemoteHostState } from "./types.js";
import { SshClient } from "./ssh-client.js";
import { startTunnel, type SshTunnel } from "./ssh-tunnel.js";
import { ensureRemoteDaemon, REMOTE_DAEMON_PORT } from "./remote-deploy.js";

const SCAN_INTERVAL_MS = 30_000;

export interface RemoteHostManagerConfig {
  registry: RemoteHostRegistry;
  logger: Logger;
  localVersion: string;
  getBinary?: (target: string) => Promise<Buffer>;
  scanIntervalMs?: number;
}

export interface RemoteHostStatusEntry {
  hostAlias: string;
  hostname: string;
  user?: string;
  port?: number;
  status: RemoteHostConnectionStatus;
  tunnelPort: number | null;
  daemonVersion: string | null;
  error: string | null;
}

export class RemoteHostManager extends EventEmitter {
  private readonly registry: RemoteHostRegistry;
  private readonly logger: Logger;
  private readonly localVersion: string;
  private readonly getBinary: (target: string) => Promise<Buffer>;
  private readonly scanIntervalMs: number;
  private readonly hosts = new Map<string, RemoteHostState>();
  private readonly tunnels = new Map<string, SshTunnel>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RemoteHostManagerConfig) {
    super();
    this.registry = config.registry;
    this.logger = config.logger.child({ module: "remote-host-manager" });
    this.localVersion = config.localVersion;
    this.getBinary = config.getBinary ?? (() => {
      throw new Error("No binary provider configured");
    });
    this.scanIntervalMs = config.scanIntervalMs ?? SCAN_INTERVAL_MS;
  }

  async initialize(): Promise<void> {
    const records = await this.registry.list();
    for (const record of records) {
      this.hosts.set(record.hostAlias, {
        record,
        status: "registered",
        tunnelPort: null,
        daemonVersion: null,
        error: null,
      });
    }
    this.logger.info({ count: records.length }, "Loaded registered remote hosts");
  }

  startScanner(): void {
    if (this.scanTimer) return;

    // Trigger initial connect for all registered hosts
    for (const [alias] of this.hosts) {
      this.triggerConnect(alias).catch((err) => {
        this.logger.error({ err, hostAlias: alias }, "Initial connect failed");
      });
    }

    this.scanTimer = setInterval(() => {
      this.scanAll().catch((err) => {
        this.logger.error({ err }, "Scanner tick failed");
      });
    }, this.scanIntervalMs);
    this.scanTimer.unref();
    this.logger.info({ intervalMs: this.scanIntervalMs }, "Host scanner started");
  }

  stopScanner(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  async addHost(input: {
    hostAlias: string;
    hostname: string;
    user?: string;
    port?: number;
    identityFile?: string;
  }): Promise<void> {
    const record: RemoteHostRecord = {
      hostAlias: input.hostAlias,
      hostname: input.hostname,
      user: input.user,
      port: input.port,
      identityFile: input.identityFile,
      addedAt: new Date().toISOString(),
    };

    await this.registry.upsert(record);

    this.hosts.set(input.hostAlias, {
      record,
      status: "registered",
      tunnelPort: null,
      daemonVersion: null,
      error: null,
    });

    this.emitStatusUpdate(input.hostAlias);

    // Trigger connect immediately
    this.triggerConnect(input.hostAlias).catch((err) => {
      this.logger.error({ err, hostAlias: input.hostAlias }, "Connect after add failed");
    });
  }

  async removeHost(alias: string): Promise<void> {
    // Close tunnel if exists
    const tunnel = this.tunnels.get(alias);
    if (tunnel) {
      tunnel.close();
      this.tunnels.delete(alias);
    }

    this.hosts.delete(alias);
    await this.registry.remove(alias);
    this.emit("host_removed", alias);
  }

  getHostState(alias: string): RemoteHostState | null {
    return this.hosts.get(alias) ?? null;
  }

  getTunnelPort(alias: string): number | null {
    const tunnel = this.tunnels.get(alias);
    return tunnel?.alive ? tunnel.localPort : null;
  }

  listStatuses(): RemoteHostStatusEntry[] {
    return Array.from(this.hosts.values()).map((state) => ({
      hostAlias: state.record.hostAlias,
      hostname: state.record.hostname,
      user: state.record.user,
      port: state.record.port,
      status: state.status,
      tunnelPort: this.getTunnelPort(state.record.hostAlias),
      daemonVersion: state.daemonVersion,
      error: state.error,
    }));
  }

  async triggerConnect(alias: string): Promise<void> {
    const state = this.hosts.get(alias);
    if (!state) return;

    // Skip if already connecting/deploying/ready
    if (state.status === "connecting" || state.status === "deploying" || state.status === "ready") {
      return;
    }

    this.setStatus(alias, "connecting");

    try {
      const ssh = new SshClient({
        hostname: state.record.hostname,
        user: state.record.user,
        port: state.record.port,
        identityFile: state.record.identityFile,
      });

      // 1. Test SSH connectivity
      const reachable = await ssh.testConnection();
      if (!reachable) {
        this.setStatus(alias, "unreachable", "SSH connection failed");
        return;
      }

      // 2. Deploy/verify remote daemon
      this.setStatus(alias, "deploying");
      const deployResult = await ensureRemoteDaemon({
        ssh,
        localVersion: this.localVersion,
        getBinary: this.getBinary,
        logger: this.logger.child({ hostAlias: alias }),
      });

      if (!deployResult.success) {
        this.setStatus(alias, "failed", deployResult.error ?? "Deployment failed");
        return;
      }

      // 3. Establish SSH tunnel
      const existingTunnel = this.tunnels.get(alias);
      if (existingTunnel?.alive) {
        existingTunnel.close();
      }

      const tunnel = await startTunnel(
        {
          hostname: state.record.hostname,
          remotePort: REMOTE_DAEMON_PORT,
          user: state.record.user,
          port: state.record.port,
          identityFile: state.record.identityFile,
        },
        this.logger,
      );

      this.tunnels.set(alias, tunnel);

      // 4. Mark ready
      const hostState = this.hosts.get(alias);
      if (hostState) {
        hostState.daemonVersion = deployResult.version;
        hostState.tunnelPort = tunnel.localPort;
      }
      this.setStatus(alias, "ready");

      this.emit("host_ready", alias, tunnel.localPort);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(alias, "failed", message);
    }
  }

  async retryHost(alias: string): Promise<void> {
    const state = this.hosts.get(alias);
    if (!state) {
      throw new Error(`Unknown host: ${alias}`);
    }
    // Reset to registered, then trigger connect
    state.error = null;
    this.setStatus(alias, "registered");
    await this.triggerConnect(alias);
  }

  private setStatus(alias: string, status: RemoteHostConnectionStatus, error?: string): void {
    const state = this.hosts.get(alias);
    if (!state) return;
    state.status = status;
    state.error = error ?? null;
    if (status !== "ready") {
      state.tunnelPort = null;
    }
    this.emitStatusUpdate(alias);
  }

  private emitStatusUpdate(alias: string): void {
    const state = this.hosts.get(alias);
    if (!state) return;
    this.emit("status_update", {
      hostAlias: state.record.hostAlias,
      hostname: state.record.hostname,
      user: state.record.user,
      port: state.record.port,
      status: state.status,
      tunnelPort: this.getTunnelPort(alias),
      daemonVersion: state.daemonVersion,
      error: state.error,
    } satisfies RemoteHostStatusEntry);
  }

  private async scanAll(): Promise<void> {
    for (const [alias, state] of this.hosts) {
      if (state.status === "connecting" || state.status === "deploying") {
        continue; // Don't interfere with in-progress operations
      }

      if (state.status === "failed") {
        continue; // User must manually retry
      }

      if (state.status === "ready") {
        // Check tunnel health
        const tunnel = this.tunnels.get(alias);
        if (!tunnel?.alive) {
          this.logger.warn({ hostAlias: alias }, "Tunnel dead, marking unreachable");
          this.tunnels.delete(alias);
          this.setStatus(alias, "unreachable", "Tunnel lost");
        }
        continue;
      }

      // registered or unreachable → attempt connect
      this.triggerConnect(alias).catch((err) => {
        this.logger.error({ err, hostAlias: alias }, "Scanner connect failed");
      });
    }
  }

  async stop(): Promise<void> {
    this.stopScanner();
    for (const [alias, tunnel] of this.tunnels) {
      tunnel.close();
      this.tunnels.delete(alias);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-host-manager.test.ts --bail=1`

Expected: all 4 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/remote-host-manager.ts packages/server/src/server/remote/remote-host-manager.test.ts
git commit -m "feat(remote): add RemoteHostManager with state machine and scanner"
```

---

## Task 8: Remote state sync (HTTP polling)

> **Dependency:** Task 17 (`/api/workspaces` and `/api/agents` endpoints) must be implemented before this task, since the sync service calls those endpoints on remote daemons. Implement Task 17 first, then return here.

**Files:**
- Create: `packages/server/src/server/remote/remote-sync.ts`
- Create: `packages/server/src/server/remote/remote-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/remote-sync.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
import { reconcileRemoteProjects } from "./remote-sync.js";
import type { PersistedProjectRecord } from "../workspace-registry.js";

describe("reconcileRemoteProjects", () => {
  test("upserts new remote projects with ssh executionHost", () => {
    const upserted: PersistedProjectRecord[] = [];
    const removed: string[] = [];

    const remoteProjects: PersistedProjectRecord[] = [
      {
        projectId: "remote:github.com/user/repo",
        rootPath: "/home/jing/repo",
        kind: "git",
        displayName: "repo",
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
        archivedAt: null,
        executionHost: { kind: "local" },
      },
    ];

    reconcileRemoteProjects({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      remoteProjects,
      existingMirrorIds: new Set(),
      onUpsert: (record) => upserted.push(record),
      onRemove: (id) => removed.push(id),
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0].executionHost).toEqual({
      kind: "ssh",
      hostAlias: "devbox",
      hostname: "192.168.1.100",
    });
    expect(upserted[0].projectId).toBe("ssh:devbox:remote:github.com/user/repo");
  });

  test("removes stale mirrors not in remote list", () => {
    const upserted: PersistedProjectRecord[] = [];
    const removed: string[] = [];

    reconcileRemoteProjects({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      remoteProjects: [],
      existingMirrorIds: new Set(["ssh:devbox:remote:github.com/user/old-repo"]),
      onUpsert: (record) => upserted.push(record),
      onRemove: (id) => removed.push(id),
    });

    expect(upserted).toHaveLength(0);
    expect(removed).toEqual(["ssh:devbox:remote:github.com/user/old-repo"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-sync.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement remote sync**

Create `packages/server/src/server/remote/remote-sync.ts`:

```typescript
import type { Logger } from "pino";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import type { PersistedWorkspaceRecord } from "../workspace-registry.js";

const SYNC_INTERVAL_MS = 5_000;

export function mirrorProjectId(hostAlias: string, remoteProjectId: string): string {
  return `ssh:${hostAlias}:${remoteProjectId}`;
}

export function reconcileRemoteProjects(options: {
  hostAlias: string;
  hostname: string;
  remoteProjects: PersistedProjectRecord[];
  existingMirrorIds: Set<string>;
  onUpsert: (record: PersistedProjectRecord) => void;
  onRemove: (projectId: string) => void;
}): void {
  const { hostAlias, hostname, remoteProjects, existingMirrorIds, onUpsert, onRemove } = options;
  const seenIds = new Set<string>();

  for (const remoteProject of remoteProjects) {
    const mirroredId = mirrorProjectId(hostAlias, remoteProject.projectId);
    seenIds.add(mirroredId);

    onUpsert({
      ...remoteProject,
      projectId: mirroredId,
      executionHost: {
        kind: "ssh",
        hostAlias,
        hostname,
      },
    });
  }

  // Remove stale mirrors
  for (const existingId of existingMirrorIds) {
    if (!seenIds.has(existingId)) {
      onRemove(existingId);
    }
  }
}

export function mirrorWorkspaceId(hostAlias: string, remoteWorkspaceId: string): string {
  return `ssh:${hostAlias}:${remoteWorkspaceId}`;
}

export function reconcileRemoteWorkspaces(options: {
  hostAlias: string;
  remoteWorkspaces: PersistedWorkspaceRecord[];
  existingMirrorIds: Set<string>;
  onUpsert: (record: PersistedWorkspaceRecord) => void;
  onRemove: (workspaceId: string) => void;
}): void {
  const { hostAlias, remoteWorkspaces, existingMirrorIds, onUpsert, onRemove } = options;
  const seenIds = new Set<string>();

  for (const ws of remoteWorkspaces) {
    const mirroredId = mirrorWorkspaceId(hostAlias, ws.workspaceId);
    seenIds.add(mirroredId);

    onUpsert({
      ...ws,
      workspaceId: mirroredId,
      projectId: mirrorProjectId(hostAlias, ws.projectId),
    });
  }

  for (const existingId of existingMirrorIds) {
    if (!seenIds.has(existingId)) {
      onRemove(existingId);
    }
  }
}

interface RemoteDaemonApi {
  fetchProjects(): Promise<PersistedProjectRecord[]>;
  fetchWorkspaces(): Promise<PersistedWorkspaceRecord[]>;
}

function createRemoteDaemonApi(tunnelPort: number): RemoteDaemonApi {
  const baseUrl = `http://127.0.0.1:${tunnelPort}`;

  return {
    async fetchProjects(): Promise<PersistedProjectRecord[]> {
      const res = await fetch(`${baseUrl}/api/workspaces`);
      if (!res.ok) throw new Error(`Remote API error: ${res.status}`);
      const data = await res.json();
      return data.projects ?? [];
    },
    async fetchWorkspaces(): Promise<PersistedWorkspaceRecord[]> {
      const res = await fetch(`${baseUrl}/api/workspaces`);
      if (!res.ok) throw new Error(`Remote API error: ${res.status}`);
      const data = await res.json();
      return data.workspaces ?? [];
    },
  };
}

export class RemoteSyncService {
  private readonly logger: Logger;
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(logger: Logger) {
    this.logger = logger.child({ module: "remote-sync" });
  }

  startSyncForHost(options: {
    hostAlias: string;
    hostname: string;
    tunnelPort: number;
    projectRegistry: {
      list(): Promise<PersistedProjectRecord[]>;
      upsert(record: PersistedProjectRecord): Promise<void>;
      remove(id: string): Promise<void>;
    };
    workspaceRegistry: {
      list(): Promise<PersistedWorkspaceRecord[]>;
      upsert(record: PersistedWorkspaceRecord): Promise<void>;
      remove(id: string): Promise<void>;
    };
  }): void {
    const { hostAlias, hostname, tunnelPort, projectRegistry, workspaceRegistry } = options;

    // Clear any existing timer
    this.stopSyncForHost(hostAlias);

    const api = createRemoteDaemonApi(tunnelPort);
    const prefix = `ssh:${hostAlias}:`;

    const sync = async () => {
      try {
        // Sync projects
        const [remoteProjects, allProjects] = await Promise.all([
          api.fetchProjects(),
          projectRegistry.list(),
        ]);

        const existingMirrorIds = new Set(
          allProjects
            .filter((p) => p.projectId.startsWith(prefix))
            .map((p) => p.projectId),
        );

        reconcileRemoteProjects({
          hostAlias,
          hostname,
          remoteProjects,
          existingMirrorIds,
          onUpsert: (record) => projectRegistry.upsert(record),
          onRemove: (id) => projectRegistry.remove(id),
        });

        // Sync workspaces
        const [remoteWorkspaces, allWorkspaces] = await Promise.all([
          api.fetchWorkspaces(),
          workspaceRegistry.list(),
        ]);

        const existingWsMirrorIds = new Set(
          allWorkspaces
            .filter((w) => w.workspaceId.startsWith(prefix))
            .map((w) => w.workspaceId),
        );

        reconcileRemoteWorkspaces({
          hostAlias,
          remoteWorkspaces,
          existingMirrorIds: existingWsMirrorIds,
          onUpsert: (record) => workspaceRegistry.upsert(record),
          onRemove: (id) => workspaceRegistry.remove(id),
        });
      } catch (err) {
        this.logger.warn({ err, hostAlias }, "Remote sync failed");
      }
    };

    // Initial sync
    sync();

    // Periodic sync
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    timer.unref();
    this.timers.set(hostAlias, timer);
  }

  stopSyncForHost(hostAlias: string): void {
    const timer = this.timers.get(hostAlias);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(hostAlias);
    }
  }

  stopAll(): void {
    for (const [alias] of this.timers) {
      this.stopSyncForHost(alias);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-sync.test.ts --bail=1`

Expected: all 2 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/remote-sync.ts packages/server/src/server/remote/remote-sync.test.ts
git commit -m "feat(remote): add HTTP-based remote state sync service"
```

---

## Task 9: Remote WS proxy for agent timeline and terminal I/O

**Files:**
- Create: `packages/server/src/server/remote/remote-proxy.ts`
- Create: `packages/server/src/server/remote/remote-proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/server/remote/remote-proxy.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/server/remote/remote-proxy.test.ts --bail=1`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement remote proxy**

Create `packages/server/src/server/remote/remote-proxy.ts`:

```typescript
import WebSocket from "ws";
import type { Logger } from "pino";

export function buildRemoteDaemonWsUrl(tunnelPort: number): string {
  return `ws://127.0.0.1:${tunnelPort}/ws`;
}

export function extractHostAliasFromProjectId(projectId: string): string | null {
  if (!projectId.startsWith("ssh:")) return null;
  // Format: ssh:{hostAlias}:{originalProjectId}
  const afterPrefix = projectId.slice(4);
  const colonIndex = afterPrefix.indexOf(":");
  if (colonIndex === -1) return null;
  return afterPrefix.slice(0, colonIndex);
}

export function stripMirrorPrefix(mirroredId: string, hostAlias: string): string {
  const prefix = `ssh:${hostAlias}:`;
  return mirroredId.startsWith(prefix) ? mirroredId.slice(prefix.length) : mirroredId;
}

export interface RemoteWsProxy {
  send(data: string | Buffer): void;
  close(): void;
  readonly readyState: number;
}

export function createRemoteWsProxy(options: {
  tunnelPort: number;
  logger: Logger;
  onMessage: (data: string | Buffer) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}): Promise<RemoteWsProxy> {
  const { tunnelPort, logger, onMessage, onClose, onError } = options;
  const url = buildRemoteDaemonWsUrl(tunnelPort);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on("open", () => {
      logger.debug({ url }, "Remote WS proxy connected");
      resolve({
        send: (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        },
        close: () => ws.close(),
        get readyState() {
          return ws.readyState;
        },
      });
    });

    ws.on("message", (data) => {
      if (typeof data === "string") {
        onMessage(data);
      } else if (Buffer.isBuffer(data)) {
        onMessage(data);
      }
    });

    ws.on("close", onClose);
    ws.on("error", (err) => {
      onError(err);
      reject(err);
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/server/remote/remote-proxy.test.ts --bail=1`

Expected: all 3 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/remote/remote-proxy.ts packages/server/src/server/remote/remote-proxy.test.ts
git commit -m "feat(remote): add WS proxy for forwarding to remote daemons"
```

---

## Task 10: Wire RemoteHostManager into daemon bootstrap

**Files:**
- Modify: `packages/server/src/server/bootstrap.ts:340-415` (initialization), `559-710` (start/stop)

- [ ] **Step 1: Add imports**

At the top of `packages/server/src/server/bootstrap.ts`, add after the existing import block:

```typescript
import { RemoteHostRegistry } from "./remote/remote-host-registry.js";
import { RemoteHostManager } from "./remote/remote-host-manager.js";
import { RemoteSyncService } from "./remote/remote-sync.js";
```

- [ ] **Step 2: Create instances in createPaseoDaemon**

After `const checkoutDiffManager = new CheckoutDiffManager(...)` (line ~395), add:

```typescript
    const remoteHostRegistry = new RemoteHostRegistry(
      path.join(config.paseoHome, "hosts.json"),
      logger,
    );
    await remoteHostRegistry.initialize();
    logger.info({ elapsed: elapsed() }, "Remote host registry initialized");

    const remoteHostManager = new RemoteHostManager({
      registry: remoteHostRegistry,
      logger,
      localVersion: daemonVersion,
      getBinary: async (target: string) => {
        // TODO: Implement SEA binary resolution for target platform
        // For now, throw a clear error directing users to pre-build
        throw new Error(
          `No pre-built binary available for ${target}. ` +
          `Place the binary at ~/.paseo/cache/paseo-daemon-${target}`,
        );
      },
    });
    await remoteHostManager.initialize();
    logger.info({ elapsed: elapsed() }, "Remote host manager initialized");

    const remoteSyncService = new RemoteSyncService(logger);

    // Wire sync: when a host becomes ready, start syncing its state
    remoteHostManager.on("host_ready", (hostAlias: string, tunnelPort: number) => {
      const state = remoteHostManager.getHostState(hostAlias);
      if (!state) return;
      remoteSyncService.startSyncForHost({
        hostAlias,
        hostname: state.record.hostname,
        tunnelPort,
        projectRegistry,
        workspaceRegistry,
      });
    });

    // Wire sync: when a host is removed or goes unreachable, stop syncing
    remoteHostManager.on("host_removed", (hostAlias: string) => {
      remoteSyncService.stopSyncForHost(hostAlias);
    });
```

- [ ] **Step 3: Start scanner in the `start` function**

Inside the `start` function, after the relay transport setup (after line ~664), add:

```typescript
            remoteHostManager.startScanner();
            logger.info({ elapsed: elapsed() }, "Remote host scanner started");
```

- [ ] **Step 4: Stop in the `stop` function**

In the `stop` function (after `await scheduleService.stop()`, line ~698), add:

```typescript
      remoteSyncService.stopAll();
      await remoteHostManager.stop();
```

- [ ] **Step 5: Pass remoteHostManager to VoiceAssistantWebSocketServer**

The `VoiceAssistantWebSocketServer` constructor (line ~597) needs `remoteHostManager` so sessions can route requests. Add it after `workspaceGitService`:

```typescript
              remoteHostManager,
```

This requires updating the `VoiceAssistantWebSocketServer` constructor signature to accept `remoteHostManager` — see Task 11.

- [ ] **Step 6: Typecheck and format**

Run: `npm run typecheck && npm run format`

Expected: type errors from the constructor change — these will be resolved in Task 11.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/server/bootstrap.ts
git commit -m "feat(remote): wire RemoteHostManager into daemon bootstrap"
```

---

## Task 11: Session dispatch routing for remote hosts

**Files:**
- Modify: `packages/server/src/server/websocket-server.ts` — accept and pass `remoteHostManager` to sessions
- Modify: `packages/server/src/server/session.ts` — add host management dispatch cases + remote agent routing

- [ ] **Step 1: Update VoiceAssistantWebSocketServer constructor**

In `packages/server/src/server/websocket-server.ts`, add the import:

```typescript
import type { RemoteHostManager } from "./remote/remote-host-manager.js";
```

Add `remoteHostManager: RemoteHostManager` as the last constructor parameter. Store it as `this.remoteHostManager`. Pass it to `new Session(...)` calls.

- [ ] **Step 2: Add host management dispatch cases in session.ts**

In `packages/server/src/server/session.ts`, import:

```typescript
import type { RemoteHostManager } from "./remote/remote-host-manager.js";
import { extractHostAliasFromProjectId, stripMirrorPrefix } from "./remote/remote-proxy.js";
```

Add `remoteHostManager` to the Session constructor dependencies:

1. In `SessionOptions` type (session.ts:425-466), add: `remoteHostManager?: RemoteHostManager;` (optional so existing callers and tests don't break).
2. In the constructor destructuring (session.ts:638-669), add: `remoteHostManager` and store as `this.remoteHostManager = remoteHostManager ?? null;`
3. Add the field: `private readonly remoteHostManager: RemoteHostManager | null;`

In the dispatch switch statement, add cases:

```typescript
          case "add_remote_host_request":
            await this.handleAddRemoteHost(msg);
            break;

          case "remove_remote_host_request":
            await this.handleRemoveRemoteHost(msg);
            break;

          case "fetch_remote_hosts_request":
            await this.handleFetchRemoteHosts(msg);
            break;

          case "retry_remote_host_request":
            await this.handleRetryRemoteHost(msg);
            break;

          case "deploy_remote_host_request":
            await this.handleDeployRemoteHost(msg);
            break;
```

- [ ] **Step 3: Implement host management handlers**

Add handler methods to the Session class:

```typescript
  private async handleAddRemoteHost(msg: { requestId: string; hostAlias: string; hostname: string; user?: string; port?: number; identityFile?: string }): Promise<void> {
    if (!this.remoteHostManager) {
      this.emit({ type: "add_remote_host_response", payload: { requestId: msg.requestId, success: false, error: "Remote host management not available" } });
      return;
    }
    try {
      await this.remoteHostManager.addHost({
        hostAlias: msg.hostAlias,
        hostname: msg.hostname,
        user: msg.user,
        port: msg.port,
        identityFile: msg.identityFile,
      });
      this.emit({
        type: "add_remote_host_response",
        payload: { requestId: msg.requestId, success: true },
      });
    } catch (err) {
      this.emit({
        type: "add_remote_host_response",
        payload: {
          requestId: msg.requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async handleRemoveRemoteHost(msg: { requestId: string; hostAlias: string }): Promise<void> {
    if (!this.remoteHostManager) {
      this.emit({ type: "remove_remote_host_response", payload: { requestId: msg.requestId, success: false, error: "Remote host management not available" } });
      return;
    }
    try {
      await this.remoteHostManager.removeHost(msg.hostAlias);

      // Clean up mirrored projects/workspaces from registries
      const prefix = `ssh:${msg.hostAlias}:`;
      const allProjects = await this.projectRegistry.list();
      for (const p of allProjects) {
        if (p.projectId.startsWith(prefix)) {
          await this.projectRegistry.remove(p.projectId);
        }
      }
      const allWorkspaces = await this.workspaceRegistry.list();
      for (const w of allWorkspaces) {
        if (w.workspaceId.startsWith(prefix)) {
          await this.workspaceRegistry.remove(w.workspaceId);
        }
      }
      this.emit({
        type: "remove_remote_host_response",
        payload: { requestId: msg.requestId, success: true },
      });
    } catch (err) {
      this.emit({
        type: "remove_remote_host_response",
        payload: {
          requestId: msg.requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async handleFetchRemoteHosts(msg: { requestId: string }): Promise<void> {
    if (!this.remoteHostManager) {
      this.emit({ type: "fetch_remote_hosts_response", payload: { requestId: msg.requestId, hosts: [] } });
      return;
    }
    const hosts = this.remoteHostManager.listStatuses();
    this.emit({
      type: "fetch_remote_hosts_response",
      payload: { requestId: msg.requestId, hosts },
    });
  }

  private async handleRetryRemoteHost(msg: { requestId: string; hostAlias: string }): Promise<void> {
    if (!this.remoteHostManager) {
      this.emit({ type: "retry_remote_host_response", payload: { requestId: msg.requestId, success: false, error: "Remote host management not available" } });
      return;
    }
    try {
      await this.remoteHostManager.retryHost(msg.hostAlias);
      this.emit({
        type: "retry_remote_host_response",
        payload: { requestId: msg.requestId, success: true },
      });
    } catch (err) {
      this.emit({
        type: "retry_remote_host_response",
        payload: {
          requestId: msg.requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async handleDeployRemoteHost(msg: { requestId: string; hostAlias: string }): Promise<void> {
    if (!this.remoteHostManager) {
      this.emit({ type: "deploy_remote_host_response", payload: { requestId: msg.requestId, success: false, error: "Remote host management not available" } });
      return;
    }
    try {
      await this.remoteHostManager.triggerConnect(msg.hostAlias);
      this.emit({
        type: "deploy_remote_host_response",
        payload: { requestId: msg.requestId, success: true },
      });
    } catch (err) {
      this.emit({
        type: "deploy_remote_host_response",
        payload: {
          requestId: msg.requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
```

- [ ] **Step 4: Subscribe session to host status updates**

**Backward-compat guard:** Do NOT subscribe all sessions to host status updates unconditionally — old clients will fail to parse `remote_host_update`. Instead, track whether this session has opted in by sending `fetch_remote_hosts_request`. Only send updates to opted-in sessions:

```typescript
    // Add fields to Session:
    private remoteHostStatusListener: ((status: RemoteHostStatusEntry) => void) | null = null;

    // In handleFetchRemoteHosts, after emitting the response:
    if (!this.remoteHostStatusListener && this.remoteHostManager) {
      this.remoteHostStatusListener = (status) => {
        this.emit({
          type: "remote_host_update",
          payload: { host: status },
        });
      };
      this.remoteHostManager.on("status_update", this.remoteHostStatusListener);
    }

    // In session cleanup/dispose (find the existing cleanup method that removes
    // other subscriptions like unsubscribeAgentEvents, unsubscribeTerminalsChanged):
    if (this.remoteHostStatusListener && this.remoteHostManager) {
      this.remoteHostManager.removeListener("status_update", this.remoteHostStatusListener);
      this.remoteHostStatusListener = null;
    }
```

This ensures:
1. Old clients that never send `fetch_remote_hosts_request` never receive the new message type (backward compat).
2. The listener is cleaned up when the session disconnects (no memory/event leak).

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/websocket-server.ts packages/server/src/server/session.ts
git commit -m "feat(remote): add host management dispatch + status broadcasting in session"
```

---

## Task 12: CLI `paseo host` command group

**Files:**
- Create: `packages/cli/src/commands/host/index.ts`
- Create: `packages/cli/src/commands/host/add.ts`
- Create: `packages/cli/src/commands/host/remove.ts`
- Create: `packages/cli/src/commands/host/ls.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Create host command index**

Create `packages/cli/src/commands/host/index.ts`:

```typescript
import { Command } from "commander";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { withOutput } from "../../output/index.js";
import { addHostAddOptions, runHostAddCommand } from "./add.js";
import { addHostRemoveOptions, runHostRemoveCommand } from "./remove.js";
import { addHostLsOptions, runHostLsCommand } from "./ls.js";

export function createHostCommand(): Command {
  const host = new Command("host").description("Manage remote SSH hosts");

  addJsonAndDaemonHostOptions(addHostAddOptions(host.command("add"))).action(
    withOutput(runHostAddCommand),
  );

  addJsonAndDaemonHostOptions(addHostRemoveOptions(host.command("remove"))).action(
    withOutput(runHostRemoveCommand),
  );

  addJsonAndDaemonHostOptions(addHostLsOptions(host.command("ls"))).action(
    withOutput(runHostLsCommand),
  );

  return host;
}
```

- [ ] **Step 2: Create `paseo host add`**

Create `packages/cli/src/commands/host/add.ts`:

```typescript
import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandOptions, SingleResult, OutputSchema, CommandError } from "../../output/index.js";

export interface HostAddResult {
  hostAlias: string;
  hostname: string;
  status: string;
}

export const hostAddSchema: OutputSchema<HostAddResult> = {
  idField: "hostAlias",
  columns: [
    { header: "ALIAS", field: "hostAlias", width: 15 },
    { header: "HOSTNAME", field: "hostname", width: 25 },
    { header: "STATUS", field: "status", width: 12 },
  ],
};

export function addHostAddOptions(cmd: Command): Command {
  return cmd
    .description("Register a remote SSH host")
    .argument("<alias>", "Short name for the host (e.g., devbox)")
    .requiredOption("--hostname <host>", "SSH hostname or IP address")
    .option("--user <user>", "SSH user")
    .option("--port <port>", "SSH port", parseInt)
    .option("--identity-file <path>", "Path to SSH private key");
}

interface HostAddOptions extends CommandOptions {
  hostname: string;
  user?: string;
  port?: number;
  identityFile?: string;
}

export async function runHostAddCommand(
  alias: string,
  options: HostAddOptions,
  _command: Command,
): Promise<SingleResult<HostAddResult>> {
  const host = getDaemonHost({ host: options.host as string | undefined });
  let client;
  try {
    client = await connectToDaemon({ host: options.host as string | undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${host}: ${message}`,
      details: "Start the daemon with: paseo daemon start",
    };
    throw error;
  }

  try {
    const result = await client.addRemoteHost({
      hostAlias: alias,
      hostname: options.hostname,
      user: options.user,
      port: options.port,
      identityFile: options.identityFile,
    });

    await client.close();

    if (!result.success) {
      const error: CommandError = {
        code: "HOST_ADD_FAILED",
        message: result.error ?? "Failed to add host",
      };
      throw error;
    }

    return {
      type: "single",
      data: {
        hostAlias: alias,
        hostname: options.hostname,
        status: "registered",
      },
      schema: hostAddSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});
    if (err && typeof err === "object" && "code" in err) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = { code: "HOST_ADD_FAILED", message };
    throw error;
  }
}
```

- [ ] **Step 3: Create `paseo host remove`**

Create `packages/cli/src/commands/host/remove.ts`:

```typescript
import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandOptions, SingleResult, OutputSchema, CommandError } from "../../output/index.js";

export interface HostRemoveResult {
  hostAlias: string;
  removed: boolean;
}

export const hostRemoveSchema: OutputSchema<HostRemoveResult> = {
  idField: "hostAlias",
  columns: [
    { header: "ALIAS", field: "hostAlias", width: 15 },
    { header: "REMOVED", field: "removed", width: 10 },
  ],
};

export function addHostRemoveOptions(cmd: Command): Command {
  return cmd
    .description("Remove a registered remote SSH host")
    .argument("<alias>", "Host alias to remove");
}

export async function runHostRemoveCommand(
  alias: string,
  options: CommandOptions,
  _command: Command,
): Promise<SingleResult<HostRemoveResult>> {
  const host = getDaemonHost({ host: options.host as string | undefined });
  let client;
  try {
    client = await connectToDaemon({ host: options.host as string | undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${host}: ${message}`,
    };
    throw error;
  }

  try {
    const result = await client.removeRemoteHost({ hostAlias: alias });
    await client.close();

    return {
      type: "single",
      data: { hostAlias: alias, removed: result.success },
      schema: hostRemoveSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = { code: "HOST_REMOVE_FAILED", message };
    throw error;
  }
}
```

- [ ] **Step 4: Create `paseo host ls`**

Create `packages/cli/src/commands/host/ls.ts`:

```typescript
import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandOptions, ListResult, OutputSchema, CommandError } from "../../output/index.js";

export interface HostListItem {
  hostAlias: string;
  hostname: string;
  user: string;
  status: string;
  tunnelPort: string;
  daemonVersion: string;
}

export const hostLsSchema: OutputSchema<HostListItem> = {
  idField: "hostAlias",
  columns: [
    { header: "ALIAS", field: "hostAlias", width: 15 },
    { header: "HOSTNAME", field: "hostname", width: 25 },
    { header: "USER", field: "user", width: 10 },
    {
      header: "STATUS",
      field: "status",
      width: 12,
      color: (value) => {
        if (value === "ready") return "green";
        if (value === "connecting" || value === "deploying") return "yellow";
        if (value === "failed" || value === "unreachable") return "red";
        return undefined;
      },
    },
    { header: "TUNNEL", field: "tunnelPort", width: 8 },
    { header: "VERSION", field: "daemonVersion", width: 12 },
  ],
};

export function addHostLsOptions(cmd: Command): Command {
  return cmd.description("List registered remote SSH hosts");
}

export async function runHostLsCommand(
  options: CommandOptions,
  _command: Command,
): Promise<ListResult<HostListItem>> {
  const host = getDaemonHost({ host: options.host as string | undefined });
  let client;
  try {
    client = await connectToDaemon({ host: options.host as string | undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${host}: ${message}`,
    };
    throw error;
  }

  try {
    const result = await client.fetchRemoteHosts();
    await client.close();

    const items: HostListItem[] = result.hosts.map((h) => ({
      hostAlias: h.hostAlias,
      hostname: h.hostname,
      user: h.user ?? "-",
      status: h.status,
      tunnelPort: h.tunnelPort ? String(h.tunnelPort) : "-",
      daemonVersion: h.daemonVersion ?? "-",
    }));

    return {
      type: "list",
      data: items,
      schema: hostLsSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = { code: "HOST_LIST_FAILED", message };
    throw error;
  }
}
```

- [ ] **Step 5: Register in cli.ts**

In `packages/cli/src/cli.ts`, add import:

```typescript
import { createHostCommand } from "./commands/host/index.js";
```

After `program.addCommand(createWorktreeCommand());` (line ~177), add:

```typescript
  // Host commands
  program.addCommand(createHostCommand());
```

- [ ] **Step 6: Typecheck and format**

Run: `npm run typecheck && npm run format`

Note: The `client.addRemoteHost()`, `client.removeRemoteHost()`, `client.fetchRemoteHosts()` methods need to be added to the daemon client — see Task 13.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/host/ packages/cli/src/cli.ts
git commit -m "feat(cli): add paseo host add/remove/ls commands"
```

---

## Task 13: Daemon client methods for remote host management

**Files:**
- Modify: `packages/server/src/client/daemon-client.ts` (or wherever `connectToDaemon` returns its client interface)
- Modify: `packages/cli/src/utils/client.ts` (if the client wrapper lives in CLI)

- [ ] **Step 1: Discover the client interface location**

Run:

```bash
grep -rn "addRemoteHost\|fetchRemoteHosts\|removeRemoteHost\|fetchAgents\|createAgent" packages/server/src/client/ packages/cli/src/utils/client.ts | head -20
```

Locate where methods like `fetchAgents` and `createAgent` are defined on the connected client. Mirror that pattern for the three new host management methods.

- [ ] **Step 2: Add methods to the client**

Add these methods to the `DaemonClient` class in `packages/server/src/client/daemon-client.ts`, following the existing `sendCorrelatedSessionRequest` pattern (see e.g. `fetchAgentTimeline` at line ~1330):

```typescript
  async addRemoteHost(input: {
    hostAlias: string;
    hostname: string;
    user?: string;
    port?: number;
    identityFile?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.sendCorrelatedSessionRequest({
      message: { type: "add_remote_host_request" as const, ...input },
      responseType: "add_remote_host_response" as const,
      timeout: 30_000,
    });
  }

  async removeRemoteHost(input: {
    hostAlias: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.sendCorrelatedSessionRequest({
      message: { type: "remove_remote_host_request" as const, ...input },
      responseType: "remove_remote_host_response" as const,
      timeout: 10_000,
    });
  }

  async fetchRemoteHosts(): Promise<{ hosts: Array<{ hostAlias: string; hostname: string; status: string; tunnelPort?: number; daemonVersion?: string; error?: string }> }> {
    return this.sendCorrelatedSessionRequest({
      message: { type: "fetch_remote_hosts_request" as const },
      responseType: "fetch_remote_hosts_response" as const,
      timeout: 10_000,
    });
  }

  async retryRemoteHost(input: {
    hostAlias: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.sendCorrelatedSessionRequest({
      message: { type: "retry_remote_host_request" as const, ...input },
      responseType: "retry_remote_host_response" as const,
      timeout: 30_000,
    });
  }

  async deployRemoteHost(input: {
    hostAlias: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.sendCorrelatedSessionRequest({
      message: { type: "deploy_remote_host_request" as const, ...input },
      responseType: "deploy_remote_host_response" as const,
      timeout: 60_000,
    });
  }
```

Note: The `CorrelatedResponseMessage` type (line 503-506) auto-discovers types with `{ payload: { requestId: string } }` shape, so these new response types will automatically work with `sendCorrelatedSessionRequest` — no manual type registration needed.

- [ ] **Step 3: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/client/ packages/cli/src/utils/
git commit -m "feat(client): add remote host management methods to daemon client"
```

---

## Task 14: App sidebar — host-grouped project list

**Files:**
- Modify: `packages/app/src/hooks/use-sidebar-workspaces-list.ts` — group by executionHost
- Modify: `packages/app/src/components/sidebar-workspace-list.tsx` — render host group headers
- Create: `packages/app/src/components/sidebar-host-group.tsx`
- Create: `packages/app/src/components/sidebar-host-group.test.tsx`

- [ ] **Step 1: Write the failing test for host grouping**

Create `packages/app/src/components/sidebar-host-group.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react-native";
import { SidebarHostGroup } from "./sidebar-host-group";

describe("SidebarHostGroup", () => {
  test("renders local group header", () => {
    const { getByText } = render(
      <SidebarHostGroup
        hostAlias={null}
        status="ready"
        projectCount={3}
      />,
    );
    expect(getByText("Local")).toBeTruthy();
  });

  test("renders remote host header with alias and status", () => {
    const { getByText } = render(
      <SidebarHostGroup
        hostAlias="devbox"
        status="ready"
        projectCount={2}
      />,
    );
    expect(getByText("devbox")).toBeTruthy();
  });

  test("renders unreachable state", () => {
    const { getByText } = render(
      <SidebarHostGroup
        hostAlias="gpu-server"
        status="unreachable"
        projectCount={0}
      />,
    );
    expect(getByText("gpu-server")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/app/src/components/sidebar-host-group.test.tsx --bail=1`

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement SidebarHostGroup**

Create `packages/app/src/components/sidebar-host-group.tsx`:

```tsx
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import type { RemoteHostConnectionStatus } from "@server/server/remote/types";

interface Props {
  hostAlias: string | null;
  status: RemoteHostConnectionStatus | "ready";
  projectCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "#22c55e",
  connecting: "#eab308",
  deploying: "#eab308",
  registered: "#6b7280",
  unreachable: "#ef4444",
  failed: "#ef4444",
};

export function SidebarHostGroup({ hostAlias, status, projectCount }: Props): JSX.Element {
  const theme = useTheme();
  const isLocal = hostAlias === null;
  const label = isLocal ? "Local" : hostAlias;
  const dotColor = STATUS_COLORS[status] ?? "#6b7280";

  return (
    <View style={styles.container} testID="sidebar-host-group">
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {!isLocal && (
        <Text style={[styles.status, { color: theme.colors.textSecondary }]}>
          {status === "ready" ? "" : ` (${status})`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  status: {
    fontSize: 10,
    marginLeft: 4,
  },
});
```

- [ ] **Step 4: Update sidebar grouping hook**

In `packages/app/src/hooks/use-sidebar-workspaces-list.ts`, update the aggregation to group projects by `executionHost`. The local group has `hostAlias: null`, each SSH host gets its own group keyed by `hostAlias`.

In the `aggregateSidebarProjects` function (or the hook's memo), after building `SidebarProjectEntry[]`, partition into groups:

```typescript
export interface SidebarHostGroupEntry {
  hostAlias: string | null;
  hostname: string | null;
  status: string;
  projects: SidebarProjectEntry[];
}

export function groupProjectsByHost(
  projects: SidebarProjectEntry[],
  remoteHostStatuses: Map<string, { status: string; hostname: string }>,
): SidebarHostGroupEntry[] {
  const localProjects: SidebarProjectEntry[] = [];
  const hostMap = new Map<string, SidebarProjectEntry[]>();

  for (const project of projects) {
    if (project.executionHost.kind === "local") {
      localProjects.push(project);
    } else if (project.executionHost.kind === "ssh") {
      const alias = project.executionHost.hostAlias;
      const list = hostMap.get(alias) ?? [];
      list.push(project);
      hostMap.set(alias, list);
    }
  }

  const groups: SidebarHostGroupEntry[] = [];

  // Local always first
  if (localProjects.length > 0) {
    groups.push({
      hostAlias: null,
      hostname: null,
      status: "ready",
      projects: localProjects,
    });
  }

  // Remote hosts sorted by alias
  for (const [alias, hostProjects] of [...hostMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hostStatus = remoteHostStatuses.get(alias);
    groups.push({
      hostAlias: alias,
      hostname: hostStatus?.hostname ?? null,
      status: hostStatus?.status ?? "registered",
      projects: hostProjects,
    });
  }

  return groups;
}
```

- [ ] **Step 5: Update sidebar-workspace-list.tsx to render host groups**

In the `FlattenedProjectRow` section of `packages/app/src/components/sidebar-workspace-list.tsx`, wrap the project list in host groups. Before each group of projects sharing the same host, render a `<SidebarHostGroup>` header.

This depends on the exact current implementation of the sidebar FlatList — the host group headers become section separators in the flattened list.

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/app/src/components/sidebar-host-group.test.tsx --bail=1`

Expected: PASS.

- [ ] **Step 7: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/components/sidebar-host-group.tsx packages/app/src/components/sidebar-host-group.test.tsx packages/app/src/hooks/use-sidebar-workspaces-list.ts packages/app/src/components/sidebar-workspace-list.tsx
git commit -m "feat(app): group sidebar projects by execution host"
```

---

## Task 15: App remote host state in session store

**Files:**
- Modify: `packages/app/src/stores/session-store.ts` — add `remoteHosts` slice

- [ ] **Step 1: Add remote host state to the store**

In `packages/app/src/stores/session-store.ts`, add to the store interface:

```typescript
  remoteHosts: Map<string, RemoteHostStatusPayload>;
```

Initialize as `new Map()` in the store creator.

- [ ] **Step 2: Handle remote_host_update messages**

In the message handler (wherever `workspace_update` and other outbound messages are processed), add a case for `remote_host_update`:

```typescript
case "remote_host_update": {
  const { host } = msg.payload;
  set((state) => {
    const next = new Map(state.remoteHosts);
    next.set(host.hostAlias, host);
    return { remoteHosts: next };
  });
  break;
}
```

- [ ] **Step 3: Handle fetch_remote_hosts_response**

```typescript
case "fetch_remote_hosts_response": {
  const { hosts } = msg.payload;  // payload wrapper matches schema
  set((state) => {
    const next = new Map<string, RemoteHostStatusPayload>();
    for (const h of hosts) {
      next.set(h.hostAlias, h);
    }
    return { remoteHosts: next };
  });
  break;
}
```

- [ ] **Step 4: Request remote hosts on connection**

After the WS handshake (where `fetch_workspaces_request` is sent), also send:

```typescript
ws.send(JSON.stringify({ type: "fetch_remote_hosts_request", requestId: generateRequestId() }));
```

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/stores/session-store.ts
git commit -m "feat(app): add remote host state to session store"
```

---

## Task 16: `--host` flag on `paseo run` and `paseo ls`

**Files:**
- Modify: `packages/cli/src/commands/agent/run.ts`
- Modify: `packages/cli/src/commands/agent/ls.ts`

- [ ] **Step 1: Add --host option to run command**

In `packages/cli/src/commands/agent/run.ts`, in `addRunOptions`, add:

```typescript
    .option("--host <alias>", "Run the agent on a remote SSH host")
```

Add `host?: string` to `AgentRunOptions`.

In `runRunCommand`, if `options.host` is provided, include it in `createAgent`:

```typescript
    const agent = await client.createAgent({
      provider: resolvedProviderModel.provider,
      cwd,
      title: resolvedTitle,
      // ... existing fields
      host: options.host,  // new: routes to remote daemon
    });
```

This requires the `CreateAgentRequest` schema to accept an optional `host` field. Add to the schema in `messages.ts`:

```typescript
  host: z.string().optional(),  // SSH host alias — routes creation to remote daemon
```

- [ ] **Step 2: Add --host filter to ls command**

In `packages/cli/src/commands/agent/ls.ts`, in `addLsOptions`, add:

```typescript
    .option("--host <alias>", "Filter agents by remote SSH host")
```

Add `host?: string` to `AgentLsOptions` (note: rename the daemon host option to avoid collision — use the existing `--daemon-host` for daemon connection, `--host` for SSH host filter).

In `runLsCommand`, after fetching agents, filter by host:

```typescript
    if (options.host) {
      agents = agents.filter((a) => {
        // Check if agent's project has executionHost.hostAlias matching
        return a.executionHost?.kind === "ssh" && a.executionHost?.hostAlias === options.host;
      });
    }
```

- [ ] **Step 3: Add HOST column to ls output**

Update `agentLsSchema` and `toListItem` to include a `host` column:

```typescript
export interface AgentListItem {
  // ... existing fields
  host: string;
}

// In toListItem:
host: agent.executionHost?.kind === "ssh" ? agent.executionHost.hostAlias : "local",

// In agentLsSchema columns:
{ header: "HOST", field: "host", width: 12 },
```

- [ ] **Step 4: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/agent/run.ts packages/cli/src/commands/agent/ls.ts packages/server/src/shared/messages.ts
git commit -m "feat(cli): add --host flag to paseo run and paseo ls"
```

---

## Task 17: Expose `/api/workspaces` HTTP endpoint for remote sync

**Files:**
- Modify: `packages/server/src/server/bootstrap.ts` — add REST endpoint

- [ ] **Step 1: Add the endpoint**

In `packages/server/src/server/bootstrap.ts`, after the `/api/status` endpoint (line ~291), add:

```typescript
    app.get("/api/workspaces", async (_req, res) => {
      try {
        const projects = await projectRegistry.list();
        const workspaces = await workspaceRegistry.list();
        res.json({ projects, workspaces });
      } catch (err) {
        logger.error({ err }, "Failed to list workspaces for API");
        res.status(500).json({ error: "Failed to list workspaces" });
      }
    });

    app.get("/api/agents", async (_req, res) => {
      try {
        const records = await agentStorage.list();
        const agents = records.map((r) => ({
          id: r.id,
          provider: r.config.provider,
          cwd: r.config.cwd,
          status: r.status ?? "closed",
          title: r.title ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
        res.json({ agents });
      } catch (err) {
        logger.error({ err }, "Failed to list agents for API");
        res.status(500).json({ error: "Failed to list agents" });
      }
    });
```

These endpoints are used by `RemoteSyncService` to poll remote daemon state.

- [ ] **Step 2: Typecheck and format**

Run: `npm run typecheck && npm run format`

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server/bootstrap.ts
git commit -m "feat(api): add /api/workspaces and /api/agents endpoints for remote sync"
```

---

## Task 18: Node.js SEA build pipeline

**Files:**
- Create: `scripts/build-sea.ts` (or `scripts/build-sea.sh`)

This task sets up the cross-compilation pipeline for building Paseo daemon as a Node.js Single Executable Application. This is a build-time concern, not runtime.

- [ ] **Step 1: Create the SEA build script**

Create `scripts/build-sea.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build Paseo daemon as a Node.js SEA binary
# Usage: ./scripts/build-sea.sh [target]
# Targets: x64-linux, arm64-linux, x64-darwin, arm64-darwin

TARGET="${1:-$(node -e "console.log(process.arch + '-' + process.platform)")}"
OUT_DIR="${PASEO_HOME:-$HOME/.paseo}/cache"
OUT_NAME="paseo-daemon-${TARGET}"

echo "Building SEA for target: ${TARGET}"
echo "Output: ${OUT_DIR}/${OUT_NAME}"

# 1. Bundle the daemon into a single JS file
npx esbuild packages/server/src/server/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --outfile=dist/sea/daemon.cjs \
  --format=cjs \
  --external:@anthropic-ai/sdk \
  --external:pino \
  --external:ws \
  --external:express

# 2. Generate SEA config
cat > dist/sea/sea-config.json << EOF
{
  "main": "daemon.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

# 3. Generate the blob
cd dist/sea
node --experimental-sea-config sea-config.json

# 4. Copy node binary and inject blob
cp "$(which node)" "${OUT_NAME}"
if [[ "${TARGET}" == *darwin* ]]; then
  codesign --remove-signature "${OUT_NAME}"
  npx postject "${OUT_NAME}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
  codesign --sign - "${OUT_NAME}"
else
  npx postject "${OUT_NAME}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
fi

# 5. Move to cache
mkdir -p "${OUT_DIR}"
mv "${OUT_NAME}" "${OUT_DIR}/${OUT_NAME}"
chmod +x "${OUT_DIR}/${OUT_NAME}"

echo "SEA binary built: ${OUT_DIR}/${OUT_NAME}"
```

- [ ] **Step 2: Wire getBinary in RemoteHostManager**

In `packages/server/src/server/bootstrap.ts`, replace the TODO `getBinary` with:

```typescript
      getBinary: async (target: string) => {
        const cachePath = path.join(config.paseoHome, "cache", `paseo-daemon-${target}`);
        try {
          return await fs.readFile(cachePath);
        } catch {
          throw new Error(
            `No pre-built binary for ${target} at ${cachePath}. ` +
            `Build it with: ./scripts/build-sea.sh ${target}`,
          );
        }
      },
```

Add the `fs` import if not already present:

```typescript
import { promises as fs } from "node:fs";
```

- [ ] **Step 3: Make script executable**

Run: `chmod +x scripts/build-sea.sh`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sea.sh packages/server/src/server/bootstrap.ts
git commit -m "feat(build): add Node.js SEA build script for remote daemon binary"
```

---

## Out of scope for this plan

- **Remote agent creation routing** — The full end-to-end flow where `create_agent_request` with `host: "devbox"` is intercepted by the session, forwarded to the remote daemon via HTTP/WS proxy, and the response is mirrored back. This requires significant changes to `session.ts` dispatch and the agent subscription model. It should be a follow-up plan after the infrastructure (Tasks 1-18) is validated.
- **Remote terminal session routing** — Same pattern: terminal create/subscribe requests for remote hosts need to be proxied. Follow-up plan.
- **App host management settings screen** — The full CRUD UI for adding/removing hosts in the App settings. The CLI commands (Task 12) cover this for V1.
- **Automated SEA cross-compilation** — Building binaries for non-native targets (e.g., building Linux binary on macOS). V1 requires pre-building on the target platform or using a CI matrix. The `build-sea.sh` script handles native builds.
- **Remote daemon auto-upgrade** — When the local daemon updates, automatically upgrading all remote daemons. The version check in `ensureRemoteDaemon` detects mismatches; manual `paseo host deploy <alias>` handles upgrades for now.

---

## Execution options

Once this plan is saved:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Good for this plan because tasks span multiple packages and each can be validated independently.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints after Tasks 3, 7, 11, 14, and 18.

Which approach?
