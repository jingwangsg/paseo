import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { WorkspaceDescriptorPayloadSchema } from "../shared/messages.js";
import { createTestLogger } from "../test-utils/test-logger.js";
import { FileBackedProjectRegistry } from "./workspace-registry.js";

describe("ExecutionHost backward compatibility", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-bc-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("legacy projects.json without executionHost loads as local", async () => {
    const file = path.join(tmpDir, "projects.json");
    const legacy = [
      {
        projectId: "p1",
        rootPath: "/tmp/p1",
        kind: "git" as const,
        displayName: "p1",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        archivedAt: null,
      },
    ];
    await fs.writeFile(file, JSON.stringify(legacy));

    const registry = new FileBackedProjectRegistry(file, createTestLogger());
    await registry.initialize();

    const project = await registry.get("p1");
    expect(project?.executionHost).toEqual({ kind: "local" });
  });

  test("old-client schema strips additive executionHost field", () => {
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
      gitRuntime: null,
      githubRuntime: null,
    };

    const parsed = LegacyWorkspaceDescriptorSchema.parse(newDaemonPayload);
    expect((parsed as { executionHost?: unknown }).executionHost).toBeUndefined();
    expect(parsed.id).toBe("w1");
  });
});
