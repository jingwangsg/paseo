# Project ExecutionHost Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `executionHost` field to paseo's Project entity (V1: only `{kind:"local"}`) and thread it through server persistence, WebSocket payloads, client state, and sidebar UI — laying the foundation for Plan B (remote SSH execution) to slot in as a pure extension.

**Architecture:** Paseo already has a `Project → Workspace` hierarchy (`workspace-registry.ts`) where agents and terminals transitively belong to a Project. This plan extends `PersistedProjectRecord` with `executionHost`, propagates it into `WorkspaceDescriptorPayload`, surfaces it in `WorkspaceDescriptor` client-side, and adds a small read-only host badge to each sidebar project header. All additions are `.optional()` with default `{kind:"local"}` for full backward compatibility — old daemons against new clients and new daemons against old clients must keep working (per `CLAUDE.md` WS schema rules).

**Tech Stack:** TypeScript, Zod, Vitest, React Native (Expo), Zustand, Biome (2-space, double quotes, trailing commas, semicolons).

---

## Why "Project" and not a new "Group" entity

Paseo's existing `Project` (`packages/server/src/server/workspace-registry.ts:10-18`) is exactly the organizational unit tether calls "group": persisted, user-labeled, contains workspaces which contain agents/terminals, already supports `projectKind: "non_git"` for ad-hoc directories. Introducing a parallel Group entity would duplicate sidebar / navigation / persistence logic. We extend Project instead. Plan B will widen `ExecutionHost` to a discriminated union that includes `{kind:"ssh", ...}`; nothing else about the entity shape needs to change.

---

## File Structure

**New files:**
- `packages/server/src/shared/messages.execution-host.test.ts` — schema tests
- `packages/app/src/components/sidebar-execution-host-badge.tsx` — small read-only host indicator
- `packages/app/src/components/sidebar-execution-host-badge.test.ts` — render test

**Modified files (server):**
- `packages/server/src/shared/messages.ts` — add `ExecutionHostSchema`, extend `WorkspaceDescriptorPayloadSchema`
- `packages/server/src/server/workspace-registry.ts` — extend `PersistedProjectRecordSchema` + factory
- `packages/server/src/server/workspace-registry.test.ts` — backward-compat + roundtrip tests
- `packages/server/src/server/session.ts` — thread `executionHost` through `buildPersistedProjectRecord`; emit it when building `WorkspaceDescriptorPayload` for clients

**Modified files (client):**
- `packages/app/src/stores/session-store.ts` — extend `WorkspaceDescriptor` type + `normalizeWorkspaceDescriptor`
- `packages/app/src/hooks/use-sidebar-workspaces-list.ts` — surface `executionHost` on `SidebarProjectEntry`
- `packages/app/src/components/sidebar-workspace-list.tsx` — render the new badge in the project row

**Backward-compat guarantees this plan must preserve:**
- Old daemon → new client: payload missing `executionHost` must parse as `{kind:"local"}`.
- New daemon → old client: extra `executionHost` key must be silently dropped by old Zod schema (Zod default is strip; verify no `.strict()` on affected schemas).
- On-disk JSON written by earlier daemons must load correctly after upgrade.

---

## Task 1: Add `ExecutionHostSchema` to shared messages

**Files:**
- Create: `packages/server/src/shared/messages.execution-host.test.ts`
- Modify: `packages/server/src/shared/messages.ts` — insert near line ~200 (before `AgentSessionConfigSchema`); add type export alongside other `export type` lines around line ~2890

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/shared/messages.execution-host.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { ExecutionHostSchema, defaultExecutionHost } from "./messages.js";

describe("ExecutionHostSchema", () => {
  test("parses local host", () => {
    expect(ExecutionHostSchema.parse({ kind: "local" })).toEqual({ kind: "local" });
  });

  test("rejects unknown kind", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "ssh", host: "x" })).toThrow();
  });

  test("rejects missing kind", () => {
    expect(() => ExecutionHostSchema.parse({})).toThrow();
  });

  test("defaultExecutionHost returns a fresh local host", () => {
    const a = defaultExecutionHost();
    const b = defaultExecutionHost();
    expect(a).toEqual({ kind: "local" });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/shared/messages.execution-host.test.ts --bail=1`

Expected: FAIL with `ExecutionHostSchema is not exported` (or similar import error).

- [ ] **Step 3: Add the schema + helper**

In `packages/server/src/shared/messages.ts`, immediately before the existing `const AgentSessionConfigSchema = z.object({` line (around line 207), insert:

```typescript
export const ExecutionHostSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local") }),
]);

export function defaultExecutionHost(): z.infer<typeof ExecutionHostSchema> {
  return { kind: "local" };
}
```

At the end of the file, alongside the other `export type ... = z.infer<...>` lines (near line ~2890), add:

```typescript
export type ExecutionHost = z.infer<typeof ExecutionHostSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/server/src/shared/messages.execution-host.test.ts --bail=1`

Expected: all 4 tests PASS.

- [ ] **Step 5: Typecheck and format**

Run: `npm run typecheck && npm run format`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/shared/messages.ts packages/server/src/shared/messages.execution-host.test.ts
git commit -m "feat(schema): add ExecutionHostSchema foundation"
```

---

## Task 2: Extend `PersistedProjectRecord` with `executionHost`

**Files:**
- Modify: `packages/server/src/server/workspace-registry.ts:10-18` (schema), `200-213` (factory)
- Modify: `packages/server/src/server/workspace-registry.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/server/workspace-registry.test.ts`:

```typescript
import { PersistedProjectRecordSchema } from "./workspace-registry.js";

describe("PersistedProjectRecord executionHost", () => {
  test("loads legacy project record without executionHost as local", () => {
    const legacy = {
      projectId: "p1",
      rootPath: "/tmp/p1",
      kind: "git" as const,
      displayName: "p1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      archivedAt: null,
    };
    const parsed = PersistedProjectRecordSchema.parse(legacy);
    expect(parsed.executionHost).toEqual({ kind: "local" });
  });

  test("createPersistedProjectRecord defaults executionHost to local", () => {
    const record = createPersistedProjectRecord({
      projectId: "p1",
      rootPath: "/tmp/p1",
      kind: "git",
      displayName: "p1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(record.executionHost).toEqual({ kind: "local" });
  });

  test("createPersistedProjectRecord accepts explicit executionHost", () => {
    const record = createPersistedProjectRecord({
      projectId: "p1",
      rootPath: "/tmp/p1",
      kind: "git",
      displayName: "p1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      executionHost: { kind: "local" },
    });
    expect(record.executionHost).toEqual({ kind: "local" });
  });
});
```

Note: `PersistedProjectRecordSchema` is currently not exported from `workspace-registry.ts`. Exporting it is part of this task.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/server/workspace-registry.test.ts --bail=1`

Expected: FAIL with `PersistedProjectRecordSchema is not exported` and/or the `executionHost` field missing from the record type.

- [ ] **Step 3: Extend the schema**

In `packages/server/src/server/workspace-registry.ts`, update imports (line 1-8):

```typescript
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Logger } from "pino";
import { z } from "zod";

import {
  ExecutionHostSchema,
  defaultExecutionHost,
  type ExecutionHost,
} from "../shared/messages.js";
import type { PersistedProjectKind, PersistedWorkspaceKind } from "./workspace-registry-model.js";
```

Replace the `PersistedProjectRecordSchema` declaration (lines 10-18):

```typescript
export const PersistedProjectRecordSchema = z.object({
  projectId: z.string(),
  rootPath: z.string(),
  kind: z.enum(["git", "non_git"]),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  executionHost: ExecutionHostSchema.default({ kind: "local" as const }),
});
```

(`export` is added so tests can import it.)

Replace `createPersistedProjectRecord` (lines 200-213):

```typescript
export function createPersistedProjectRecord(input: {
  projectId: string;
  rootPath: string;
  kind: PersistedProjectKind;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  executionHost?: ExecutionHost;
}): PersistedProjectRecord {
  return PersistedProjectRecordSchema.parse({
    ...input,
    archivedAt: input.archivedAt ?? null,
    executionHost: input.executionHost ?? defaultExecutionHost(),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/server/src/server/workspace-registry.test.ts --bail=1`

Expected: all tests including the three new ones PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors. (Existing `createPersistedProjectRecord` call sites without `executionHost` still type-check because it's optional.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server/workspace-registry.ts packages/server/src/server/workspace-registry.test.ts
git commit -m "feat(project): persist executionHost on Project (default local)"
```

---

## Task 3: Preserve `executionHost` in session reconciliation

**Files:**
- Modify: `packages/server/src/server/session.ts:1212-1230` (`buildPersistedProjectRecord` method)
- Modify: `packages/server/src/server/session.ts:1282-1287` (call site in `reconcileWorkspaceRecord`)

**Context:** When an existing project is re-materialized (e.g. re-opening a project, new agent under an existing project), `reconcileWorkspaceRecord` rebuilds its `PersistedProjectRecord`. Without preserving `executionHost`, every reconcile would silently overwrite it with the default. Plan B depends on `executionHost` being stable across reconciles.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/server/session.workspaces.test.ts` (mirror the harness used by other tests in this file, e.g. the `open_project_request registers a workspace before any agent exists` test around line 1296):

```typescript
test("reconcileWorkspaceRecord preserves executionHost on existing project", async () => {
  // Arrange: a project already in the registry with executionHost preset (simulating Plan B state).
  const projects = new Map<string, PersistedProjectRecord>();
  const existing = createPersistedProjectRecord({
    projectId: "project:/tmp/repo",
    rootPath: "/tmp/repo",
    kind: "non_git",
    displayName: "repo",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    executionHost: { kind: "local" },
  });
  projects.set(existing.projectId, existing);

  // ... set up Session harness as in neighbouring tests, injecting stubs
  // that expose projects/workspaces Maps through the ProjectRegistry /
  // WorkspaceRegistry interfaces. See the existing `open_project_request`
  // test at session.workspaces.test.ts:1296 for the pattern.

  await session.dispatch({
    type: "open_project_request",
    cwd: "/tmp/repo",
    requestId: "r1",
  });

  const after = projects.get("project:/tmp/repo");
  expect(after?.executionHost).toEqual({ kind: "local" });
});
```

If the harness requires more setup than shown, model it exactly on the pre-existing `open_project_request registers a workspace` test body (lines 1296-1343) — same stubs, just add the pre-seeded record to the `projects` map.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/server/session.workspaces.test.ts --bail=1 -t "preserves executionHost"`

Expected: FAIL — either `executionHost` missing from the result (because `buildPersistedProjectRecord` doesn't accept it) or the reconcile overwrites the seeded value.

- [ ] **Step 3: Thread `executionHost` through the builder**

In `packages/server/src/server/session.ts`, update `buildPersistedProjectRecord` (lines 1212-1230):

```typescript
private buildPersistedProjectRecord(input: {
  workspaceId: string;
  placement: ProjectPlacementPayload;
  createdAt: string;
  updatedAt: string;
  executionHost?: ExecutionHost;
}): PersistedProjectRecord {
  return createPersistedProjectRecord({
    projectId: input.placement.projectKey,
    rootPath: deriveProjectRootPath({
      cwd: input.workspaceId,
      checkout: input.placement.checkout,
    }),
    kind: deriveProjectKind(input.placement.checkout),
    displayName: input.placement.projectName,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    archivedAt: null,
    executionHost: input.executionHost,
  });
}
```

Add the import near the top of `session.ts` (merge with the existing `../shared/messages.js` import block):

```typescript
import type { ExecutionHost } from "../shared/messages.js";
```

Update the call site in `reconcileWorkspaceRecord` (lines 1282-1287):

```typescript
const nextProjectRecord = this.buildPersistedProjectRecord({
  workspaceId: resolvedWorkspaceId,
  placement,
  createdAt: currentProjectRecord?.createdAt ?? nextProjectCreatedAt,
  updatedAt: now,
  executionHost: currentProjectRecord?.executionHost,
});
```

Update the `needsProjectUpdate` comparison (lines 1302-1307) to include `executionHost` so a host change triggers a persistence write in Plan B:

```typescript
const needsProjectUpdate =
  !currentProjectRecord ||
  currentProjectRecord.archivedAt ||
  currentProjectRecord.rootPath !== nextProjectRecord.rootPath ||
  currentProjectRecord.kind !== nextProjectRecord.kind ||
  currentProjectRecord.displayName !== nextProjectRecord.displayName ||
  currentProjectRecord.executionHost.kind !== nextProjectRecord.executionHost.kind;
```

(Use `.kind` comparison — deep equality on the discriminated union is only meaningful once `"ssh"` lands with more fields in Plan B. For V1 both sides are always `"local"` so this check is a no-op, but the hook is in place.)

- [ ] **Step 4: Check bootstrap site**

Open `packages/server/src/server/workspace-registry-bootstrap.ts:128-140`. The existing `createPersistedProjectRecord` call does NOT pass `executionHost`. That's fine — the factory defaults to `{kind:"local"}`, which is correct for records bootstrapped from pre-Plan-A agents.

Leave this file unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run packages/server/src/server/session.workspaces.test.ts --bail=1
npx vitest run packages/server/src/server/workspace-registry-bootstrap.test.ts --bail=1
```

Expected: PASS (existing behaviour preserved; new test green).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/server/session.ts packages/server/src/server/session.workspaces.test.ts
git commit -m "feat(project): preserve executionHost across workspace reconciliation"
```

---

## Task 4: Extend `WorkspaceDescriptorPayload` with `executionHost`

**Files:**
- Modify: `packages/server/src/shared/messages.ts:1911-1930` (WorkspaceDescriptorPayloadSchema)
- Modify: `packages/server/src/shared/messages.workspaces.test.ts` — add backward-compat + roundtrip tests

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/shared/messages.workspaces.test.ts`:

```typescript
import { WorkspaceDescriptorPayloadSchema } from "./messages.js";

const BASE_DESCRIPTOR = {
  id: "w1",
  projectId: "p1",
  projectDisplayName: "p",
  projectRootPath: "/tmp/p",
  projectKind: "git" as const,
  workspaceKind: "local_checkout" as const,
  name: "main",
  status: "done" as const,
  activityAt: null,
};

describe("WorkspaceDescriptorPayload executionHost", () => {
  test("defaults to local when missing (old daemon → new client)", () => {
    const parsed = WorkspaceDescriptorPayloadSchema.parse(BASE_DESCRIPTOR);
    expect(parsed.executionHost).toEqual({ kind: "local" });
  });

  test("accepts explicit local", () => {
    const parsed = WorkspaceDescriptorPayloadSchema.parse({
      ...BASE_DESCRIPTOR,
      executionHost: { kind: "local" },
    });
    expect(parsed.executionHost).toEqual({ kind: "local" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/shared/messages.workspaces.test.ts --bail=1`

Expected: FAIL — `executionHost` missing on parsed type.

- [ ] **Step 3: Extend the schema**

In `packages/server/src/shared/messages.ts`, update `WorkspaceDescriptorPayloadSchema` (lines 1911-1930):

```typescript
export const WorkspaceDescriptorPayloadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectDisplayName: z.string(),
  projectRootPath: z.string(),
  projectKind: z.enum(["git", "non_git"]),
  workspaceKind: z.enum(["local_checkout", "worktree", "directory"]),
  name: z.string(),
  status: WorkspaceStateBucketSchema,
  activityAt: z.string().nullable(),
  diffStat: z
    .object({
      additions: z.number(),
      deletions: z.number(),
    })
    .nullable()
    .optional(),
  gitRuntime: WorkspaceGitRuntimePayloadSchema,
  githubRuntime: WorkspaceGitHubRuntimePayloadSchema,
  executionHost: ExecutionHostSchema.default({ kind: "local" as const }),
});
```

(The schema file already has `ExecutionHostSchema` in scope via Task 1 — no import changes needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/shared/messages.workspaces.test.ts --bail=1`

Expected: PASS. Existing tests must also still pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors. (Client code consumes `WorkspaceDescriptorPayload["executionHost"]` only where Task 6 adds it; this task leaves server emission unchanged so no new required field on the output side yet.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/shared/messages.ts packages/server/src/shared/messages.workspaces.test.ts
git commit -m "feat(schema): add executionHost to WorkspaceDescriptorPayload"
```

---

## Task 5: Emit `executionHost` when building descriptors for clients

**Files:**
- Modify: `packages/server/src/server/session.ts` — wherever `WorkspaceDescriptorPayload` is constructed from registry records (discovery step below)
- Modify: `packages/server/src/server/session.workspaces.test.ts` — assert the emitted payload contains `executionHost`

- [ ] **Step 1: Discover the builder location**

Run:
```bash
grep -n "projectDisplayName:" packages/server/src/server/session.ts
grep -n "projectRootPath:" packages/server/src/server/session.ts
```

These locate the sites that construct `WorkspaceDescriptorPayload` shapes (typically in a helper like `buildWorkspaceDescriptorPayload`, `toWorkspaceDescriptorPayload`, or inline inside `emitWorkspaceUpdate` / `reconcileAndEmitWorkspaceUpdates`). Note each match — multiple sites may exist.

- [ ] **Step 2: Write the failing test**

In `packages/server/src/server/session.workspaces.test.ts`, add (after the test from Task 3):

```typescript
test("emitted WorkspaceDescriptorPayload includes project executionHost", async () => {
  // Reuse the test harness from the "open_project_request registers a workspace" test.
  // Seed a project with executionHost = { kind: "local" }, then dispatch
  // a subscribe-style request that causes the session to emit a workspace_update
  // and assert the emitted payload has executionHost: { kind: "local" }.

  // Capture emitted messages:
  const emitted: Array<{ type: string; payload: unknown }> = [];
  session.on("emit", (msg) => emitted.push(msg));

  await session.dispatch({
    type: "open_project_request",
    cwd: "/tmp/repo",
    requestId: "r1",
  });

  const update = emitted.find((m) => m.type === "workspace_update");
  expect(update).toBeDefined();
  const payload = (update?.payload as { workspace: { executionHost?: unknown } }).workspace;
  expect(payload.executionHost).toEqual({ kind: "local" });
});
```

Adjust the harness-specific bits (`session.on` / event-capture mechanism) to match the file's existing conventions — the `workspace-git-watch.test.ts` and `workspaces.test.ts` files in the same directory both illustrate how to capture emitted messages.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/server/session.workspaces.test.ts --bail=1 -t "executionHost"`

Expected: FAIL — `executionHost` is `undefined` in the emitted payload (builder not yet including it).

- [ ] **Step 4: Update every descriptor builder**

At each site discovered in Step 1, include the project's `executionHost` in the emitted payload. The common pattern:

```typescript
const descriptor: WorkspaceDescriptorPayload = {
  id: workspace.workspaceId,
  projectId: project.projectId,
  projectDisplayName: project.displayName,
  projectRootPath: project.rootPath,
  projectKind: project.kind,
  workspaceKind: workspace.kind,
  name: workspace.displayName,
  status: computedStatus,
  activityAt,
  diffStat,
  gitRuntime,
  githubRuntime,
  executionHost: project.executionHost,
};
```

Every builder must pull `executionHost` from the `PersistedProjectRecord` (not the workspace — the host lives on the project). If a builder currently takes only the workspace record and not the project record, widen its input to include the project (or look it up via `projectRegistry.get(workspace.projectId)`).

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run packages/server/src/server/session.workspaces.test.ts --bail=1
npx vitest run packages/server/src/server/session.workspace-git-watch.test.ts --bail=1
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no errors. If TypeScript complains that a builder returns a payload missing `executionHost`, that builder was missed — go back to Step 4.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/server/session.ts packages/server/src/server/session.workspaces.test.ts
git commit -m "feat(workspace): emit project executionHost in WorkspaceDescriptorPayload"
```

---

## Task 6: Client `WorkspaceDescriptor` carries `executionHost`

**Files:**
- Modify: `packages/app/src/stores/session-store.ts:114-140` (type + normalize + merge)
- Modify: tests in the same package — add a normalize test file if one doesn't exist

- [ ] **Step 1: Find or create the normalize test**

Run: `grep -rn "normalizeWorkspaceDescriptor" packages/app/src`

If there is no existing test for `normalizeWorkspaceDescriptor`, create `packages/app/src/stores/session-store.workspace-descriptor.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { normalizeWorkspaceDescriptor } from "./session-store";
import type { WorkspaceDescriptorPayload } from "@server/shared/messages";

const BASE: WorkspaceDescriptorPayload = {
  id: "w1",
  projectId: "p1",
  projectDisplayName: "p",
  projectRootPath: "/tmp/p",
  projectKind: "git",
  workspaceKind: "local_checkout",
  name: "main",
  status: "done",
  activityAt: null,
  diffStat: null,
  gitRuntime: null,
  githubRuntime: null,
  executionHost: { kind: "local" },
};

describe("normalizeWorkspaceDescriptor", () => {
  test("carries executionHost through", () => {
    const descriptor = normalizeWorkspaceDescriptor(BASE);
    expect(descriptor.executionHost).toEqual({ kind: "local" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/stores/session-store.workspace-descriptor.test.ts --bail=1`

Expected: FAIL — `executionHost` missing from the `WorkspaceDescriptor` type or dropped by normalize.

- [ ] **Step 3: Extend the type + normalize**

In `packages/app/src/stores/session-store.ts`, update imports at the top of the file to include the new type:

```typescript
import type { WorkspaceDescriptorPayload, ExecutionHost } from "@server/shared/messages";
```

Update the `WorkspaceDescriptor` interface (lines 114-124):

```typescript
export interface WorkspaceDescriptor {
  id: string;
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
  projectKind: WorkspaceDescriptorPayload["projectKind"];
  workspaceKind: WorkspaceDescriptorPayload["workspaceKind"];
  name: string;
  status: WorkspaceDescriptorPayload["status"];
  diffStat: { additions: number; deletions: number } | null;
  executionHost: ExecutionHost;
}
```

Update `normalizeWorkspaceDescriptor` (lines 126-140):

```typescript
export function normalizeWorkspaceDescriptor(
  payload: WorkspaceDescriptorPayload,
): WorkspaceDescriptor {
  return {
    id: normalizeWorkspaceIdentity(payload.id) ?? payload.id,
    projectId: payload.projectId,
    projectDisplayName: payload.projectDisplayName,
    projectRootPath: payload.projectRootPath,
    projectKind: payload.projectKind,
    workspaceKind: payload.workspaceKind,
    name: payload.name,
    status: payload.status,
    diffStat: payload.diffStat ?? null,
    executionHost: payload.executionHost,
  };
}
```

(`payload.executionHost` is non-optional after Zod default; no fallback needed.)

Update `mergeWorkspaceSnapshotWithExisting` (lines 142-155) — nothing to change, `executionHost` comes from `incoming` and gets spread through. Keep as-is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/app/src/stores/session-store.workspace-descriptor.test.ts --bail=1`

Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors. Any consumer that destructures `WorkspaceDescriptor` and is missing `executionHost` will be caught here — add `executionHost: incoming.executionHost` at those sites if Zod complains.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/stores/session-store.ts packages/app/src/stores/session-store.workspace-descriptor.test.ts
git commit -m "feat(client): carry executionHost on WorkspaceDescriptor"
```

---

## Task 7: `SidebarProjectEntry` exposes `executionHost`

**Files:**
- Modify: `packages/app/src/hooks/use-sidebar-workspaces-list.ts:29-38` (type), aggregation logic further down in the same file
- Modify: existing test or create new test file for the hook

**Context:** All workspaces within a single project share the same `executionHost` (it lives on the project, not the workspace). Client aggregation takes the host from the first workspace.

- [ ] **Step 1: Read the aggregation function**

Run: `grep -n "SidebarProjectEntry" packages/app/src/hooks/use-sidebar-workspaces-list.ts`

Locate the function that builds `SidebarProjectEntry` objects from `WorkspaceDescriptor[]` (expect one or two call sites).

- [ ] **Step 2: Write the failing test**

In `packages/app/src/hooks/use-sidebar-workspaces-list.test.ts` (create if it doesn't exist), add:

```typescript
import { describe, expect, test } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
// Import the pure aggregation function (export it from the hook file if it isn't already).
import { aggregateSidebarProjects } from "./use-sidebar-workspaces-list";

const BASE_WORKSPACE: WorkspaceDescriptor = {
  id: "w1",
  projectId: "p1",
  projectDisplayName: "p",
  projectRootPath: "/tmp/p",
  projectKind: "git",
  workspaceKind: "local_checkout",
  name: "main",
  status: "done",
  diffStat: null,
  executionHost: { kind: "local" },
};

describe("aggregateSidebarProjects", () => {
  test("project entry exposes executionHost from its workspaces", () => {
    const projects = aggregateSidebarProjects([BASE_WORKSPACE]);
    expect(projects[0].executionHost).toEqual({ kind: "local" });
  });
});
```

If the aggregation is currently an inline closure inside the hook, extract it to a pure exported function `aggregateSidebarProjects(descriptors: WorkspaceDescriptor[]): SidebarProjectEntry[]` as part of this task — it should have no React dependencies.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-workspaces-list.test.ts --bail=1`

Expected: FAIL.

- [ ] **Step 4: Extend `SidebarProjectEntry` and aggregator**

Update the interface (lines 29-38):

```typescript
export interface SidebarProjectEntry {
  projectKey: string;
  projectName: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  iconWorkingDir: string;
  statusBucket: SidebarStateBucket;
  activeCount: number;
  totalWorkspaces: number;
  workspaces: SidebarWorkspaceEntry[];
  executionHost: WorkspaceDescriptor["executionHost"];
}
```

In the aggregation function, when building each `SidebarProjectEntry`, include:

```typescript
executionHost: workspacesForProject[0]?.executionHost ?? { kind: "local" as const },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-workspaces-list.test.ts --bail=1`

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no errors. Consumers of `SidebarProjectEntry` that pattern-match all fields will be caught — widen them to carry `executionHost` through (typically just `...project` spreads).

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/hooks/use-sidebar-workspaces-list.ts packages/app/src/hooks/use-sidebar-workspaces-list.test.ts
git commit -m "feat(sidebar): expose executionHost on SidebarProjectEntry"
```

---

## Task 8: Sidebar executionHost badge (read-only)

**Files:**
- Create: `packages/app/src/components/sidebar-execution-host-badge.tsx`
- Create: `packages/app/src/components/sidebar-execution-host-badge.test.tsx`
- Modify: `packages/app/src/components/sidebar-workspace-list.tsx` — insert the badge into the project row header

**Design:** V1 shows nothing for `{kind:"local"}` (avoid visual clutter for the common case) but still renders a test-visible marker. Plan B will show a labelled badge for `"ssh"`. Keeping the component in place now means Plan B is a pure CSS/label change.

- [ ] **Step 1: Write the failing component test**

Create `packages/app/src/components/sidebar-execution-host-badge.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react-native";
import { SidebarExecutionHostBadge } from "./sidebar-execution-host-badge";

describe("SidebarExecutionHostBadge", () => {
  test("renders nothing visible for local host but includes test id", () => {
    const { getByTestId, queryByText } = render(
      <SidebarExecutionHostBadge host={{ kind: "local" }} />,
    );
    expect(getByTestId("sidebar-execution-host-badge")).toBeTruthy();
    expect(queryByText(/ssh/i)).toBeNull();
  });
});
```

Check test harness: if `@testing-library/react-native` isn't already installed in the app package, verify by running `grep -rl "@testing-library/react-native" packages/app/src | head -5`. If it's missing, the team is testing React Native components through a different harness — find an existing `.test.tsx` in `packages/app/src/components/` and mirror its imports/setup.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/components/sidebar-execution-host-badge.test.tsx --bail=1`

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `packages/app/src/components/sidebar-execution-host-badge.tsx`:

```tsx
import { View } from "react-native";
import type { ExecutionHost } from "@server/shared/messages";

interface Props {
  host: ExecutionHost;
}

export function SidebarExecutionHostBadge({ host }: Props): JSX.Element {
  if (host.kind === "local") {
    return <View testID="sidebar-execution-host-badge" />;
  }
  // Plan B: render an "SSH hostname" chip here when host.kind === "ssh".
  return <View testID="sidebar-execution-host-badge" />;
}
```

- [ ] **Step 4: Wire the badge into the project row**

In `packages/app/src/components/sidebar-workspace-list.tsx`, import the new component near the other component imports (line 1-87):

```tsx
import { SidebarExecutionHostBadge } from "./sidebar-execution-host-badge";
```

Locate `FlattenedProjectRow` (starts around line 1270). In its render output, next to where the project display name / icon is rendered, add:

```tsx
<SidebarExecutionHostBadge host={project.executionHost} />
```

The exact JSX location depends on the row layout — place it inline with the project header cluster (icon + name + status dot). If you're not sure, put it immediately after the project name `Text` element; visual tweaks can come later.

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npx vitest run packages/app/src/components/sidebar-execution-host-badge.test.tsx --bail=1`

Expected: PASS.

- [ ] **Step 6: Smoke-test the UI**

```bash
npm run dev
```

Open the web app. Verify:
- Sidebar renders project rows identically to before (local badge invisible).
- DevTools inspection shows a `View` with `testID="sidebar-execution-host-badge"` inside each project row.
- No console errors.

If you can't easily drive the Expo UI (e.g. you're running headless), note this explicitly rather than claiming success.

- [ ] **Step 7: Typecheck + format**

```bash
npm run typecheck && npm run format
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/components/sidebar-execution-host-badge.tsx packages/app/src/components/sidebar-execution-host-badge.test.tsx packages/app/src/components/sidebar-workspace-list.tsx
git commit -m "feat(sidebar): render executionHost badge (invisible for local in V1)"
```

---

## Task 9: End-to-end backward-compat verification

**Files:**
- Create: `packages/server/src/server/workspace-registry.backcompat.test.ts`

**Why:** CLAUDE.md requires that old mobile clients (6-month-old schemas) keep working against a new daemon, and that new clients tolerate payloads from old daemons. Tasks 1-8 encode this via `.default()` on every new field, but we need an explicit integration-style test so future refactors can't silently re-break it.

- [ ] **Step 1: Write the failing (integration) test**

Create `packages/server/src/server/workspace-registry.backcompat.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import pino from "pino";

import {
  FileBackedProjectRegistry,
} from "./workspace-registry.js";
import { WorkspaceDescriptorPayloadSchema } from "../shared/messages.js";

const SILENT_LOGGER = pino({ level: "silent" });

describe("ExecutionHost backward compatibility", () => {
  test("legacy projects.json without executionHost loads as local", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-bc-"));
    const file = path.join(dir, "projects.json");
    const legacy = {
      projects: [
        {
          projectId: "p1",
          rootPath: "/tmp/p1",
          kind: "git",
          displayName: "p1",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          archivedAt: null,
        },
      ],
    };
    await fs.writeFile(file, JSON.stringify(legacy));

    const registry = new FileBackedProjectRegistry(file, SILENT_LOGGER);
    await registry.initialize();

    const project = await registry.get("p1");
    expect(project?.executionHost).toEqual({ kind: "local" });

    await fs.rm(dir, { recursive: true, force: true });
  });

  test("old-client Zod schema strips extra executionHost field", () => {
    // Simulate: a 6-month-old client whose WorkspaceDescriptorPayload schema
    // does not know about executionHost. An old Zod `z.object({...})` strips
    // unknown keys by default.
    const LegacyWorkspaceDescriptorSchema = WorkspaceDescriptorPayloadSchema.omit({
      executionHost: true,
    });

    const newDaemonPayload = {
      id: "w1",
      projectId: "p1",
      projectDisplayName: "p",
      projectRootPath: "/tmp/p",
      projectKind: "git" as const,
      workspaceKind: "local_checkout" as const,
      name: "main",
      status: "done" as const,
      activityAt: null,
      executionHost: { kind: "local" as const },
    };

    const parsed = LegacyWorkspaceDescriptorSchema.parse(newDaemonPayload);
    expect((parsed as { executionHost?: unknown }).executionHost).toBeUndefined();
    expect(parsed.id).toBe("w1");
  });
});
```

If the exact `FileBackedProjectRegistry` import path or constructor shape differs, adjust to match `workspace-registry.ts` exports.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/server/workspace-registry.backcompat.test.ts --bail=1`

Expected: either FAIL (if Tasks 1-4 weren't completed) or PASS (if they were). Since this is the last task, it should PASS on first run — but running it confirms the wiring.

If it fails, that is the signal that a previous task regressed backward compatibility; do NOT work around in this test, go fix the underlying issue.

- [ ] **Step 3: Run the affected test suites sequentially**

Do NOT run the whole suite (per CLAUDE.md). Run only the files touched by this plan:

```bash
npx vitest run packages/server/src/shared/messages.execution-host.test.ts --bail=1
npx vitest run packages/server/src/shared/messages.workspaces.test.ts --bail=1
npx vitest run packages/server/src/server/workspace-registry.test.ts --bail=1
npx vitest run packages/server/src/server/workspace-registry.backcompat.test.ts --bail=1
npx vitest run packages/server/src/server/session.workspaces.test.ts --bail=1
npx vitest run packages/app/src/stores/session-store.workspace-descriptor.test.ts --bail=1
npx vitest run packages/app/src/hooks/use-sidebar-workspaces-list.test.ts --bail=1
npx vitest run packages/app/src/components/sidebar-execution-host-badge.test.tsx --bail=1
```

Expected: every suite PASSes.

- [ ] **Step 4: Final typecheck + format**

```bash
npm run typecheck && npm run format
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server/workspace-registry.backcompat.test.ts
git commit -m "test: lock ExecutionHost backward-compat against old clients and legacy JSON"
```

---

## Out of scope for this plan (handled by Plan B)

- Adding `{kind:"ssh", ...}` variants to `ExecutionHostSchema`
- UI for picking / changing a project's executionHost (not useful until there's more than one option)
- Remote daemon deployment, SSH tunnel management, remote PTY spawning
- Threading `executionHost` into `createTerminal` / `createAgent` spawn paths (they currently always spawn locally; that stays true until Plan B adds a host resolver)
- Migration story for existing workspaces that users might want to "move" to a remote host

These are deferred so this plan remains an independently shippable, zero-visible-regression refactor.

---

## Execution options

Once this plan is saved:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task via `superpowers:subagent-driven-development`, review between tasks. Safer for this plan because Task 5 ("find every descriptor builder") involves codebase discovery that benefits from an isolated context.

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans` with checkpoints after Tasks 3, 5, and 8.

Recommend (1) given the Task 5 discovery burden and the cross-package spread of modifications.
