import { describe, expect, it } from "vitest";
import {
  canUseWorkspaceFilesystemFeatures,
  getCopyableWorkspacePath,
  getSshWorkspaceHostAlias,
  isSshWorkspaceId,
  stripSshWorkspaceId,
} from "./workspace-execution";

describe("workspace-execution", () => {
  it("recognizes ssh workspace ids as actionable workspace identities", () => {
    expect(isSshWorkspaceId("ssh:osmo_9000:/mnt/data/repo")).toBe(true);
    expect(canUseWorkspaceFilesystemFeatures("ssh:osmo_9000:/mnt/data/repo")).toBe(true);
  });

  it("strips the ssh transport prefix for copy-path behavior", () => {
    expect(stripSshWorkspaceId("ssh:osmo_9000:/mnt/data/repo")).toBe("/mnt/data/repo");
    expect(getCopyableWorkspacePath("ssh:osmo_9000:/mnt/data/repo")).toBe("/mnt/data/repo");
    expect(getSshWorkspaceHostAlias("ssh:osmo_9000:/mnt/data/repo")).toBe("osmo_9000");
  });

  it("keeps local absolute paths unchanged", () => {
    expect(isSshWorkspaceId("/tmp/repo")).toBe(false);
    expect(stripSshWorkspaceId("/tmp/repo")).toBe("/tmp/repo");
    expect(canUseWorkspaceFilesystemFeatures("/tmp/repo")).toBe(true);
    expect(getCopyableWorkspacePath("/tmp/repo")).toBe("/tmp/repo");
    expect(getSshWorkspaceHostAlias("/tmp/repo")).toBeNull();
  });
});
