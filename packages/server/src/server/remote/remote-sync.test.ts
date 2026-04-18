import { describe, expect, test } from "vitest";
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
      hostAlias: "osmo_9000",
      hostname: "192.168.1.100",
      remoteProjects,
      existingMirrorIds: new Set(),
      onUpsert: (record) => upserted.push(record),
      onRemove: (id) => removed.push(id),
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0].executionHost).toEqual({
      kind: "ssh",
      hostAlias: "osmo_9000",
      hostname: "192.168.1.100",
    });
    expect(upserted[0].projectId).toBe("ssh:osmo_9000:remote:github.com/user/repo");
  });

  test("removes stale mirrors not in remote list", () => {
    const upserted: PersistedProjectRecord[] = [];
    const removed: string[] = [];

    reconcileRemoteProjects({
      hostAlias: "osmo_9000",
      hostname: "192.168.1.100",
      remoteProjects: [],
      existingMirrorIds: new Set(["ssh:osmo_9000:remote:github.com/user/old-repo"]),
      onUpsert: (record) => upserted.push(record),
      onRemove: (id) => removed.push(id),
    });

    expect(upserted).toHaveLength(0);
    expect(removed).toEqual(["ssh:osmo_9000:remote:github.com/user/old-repo"]);
  });
});
