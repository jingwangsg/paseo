import { describe, expect, test } from "vitest";
import type { WorkspaceDescriptorPayload } from "@server/shared/messages";
import { normalizeWorkspaceDescriptor } from "./session-store";

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
