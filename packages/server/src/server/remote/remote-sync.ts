import type { Logger } from "pino";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";

const SYNC_INTERVAL_MS = 5_000;

export function mirrorProjectId(hostAlias: string, remoteProjectId: string): string {
  return `ssh:${hostAlias}:${remoteProjectId}`;
}

export async function reconcileRemoteProjects(options: {
  hostAlias: string;
  hostname: string;
  remoteProjects: PersistedProjectRecord[];
  existingMirrorIds: Set<string>;
  onUpsert: (record: PersistedProjectRecord) => Promise<void> | void;
  onRemove: (projectId: string) => Promise<void> | void;
}): Promise<void> {
  const { hostAlias, hostname, remoteProjects, existingMirrorIds, onUpsert, onRemove } = options;
  const seenIds = new Set<string>();

  for (const remoteProject of remoteProjects) {
    const mirroredId = mirrorProjectId(hostAlias, remoteProject.projectId);
    seenIds.add(mirroredId);

    await onUpsert({
      ...remoteProject,
      projectId: mirroredId,
      executionHost: {
        kind: "ssh",
        hostAlias,
        hostname,
      },
    });
  }

  for (const existingId of existingMirrorIds) {
    if (!seenIds.has(existingId)) {
      await onRemove(existingId);
    }
  }
}

export function mirrorWorkspaceId(hostAlias: string, remoteWorkspaceId: string): string {
  return `ssh:${hostAlias}:${remoteWorkspaceId}`;
}

export async function reconcileRemoteWorkspaces(options: {
  hostAlias: string;
  remoteWorkspaces: PersistedWorkspaceRecord[];
  existingMirrorIds: Set<string>;
  onUpsert: (record: PersistedWorkspaceRecord) => Promise<void> | void;
  onRemove: (workspaceId: string) => Promise<void> | void;
}): Promise<void> {
  const { hostAlias, remoteWorkspaces, existingMirrorIds, onUpsert, onRemove } = options;
  const seenIds = new Set<string>();

  for (const ws of remoteWorkspaces) {
    const mirroredId = mirrorWorkspaceId(hostAlias, ws.workspaceId);
    seenIds.add(mirroredId);

    // NOTE: Mirrored workspaces retain their remote cwd paths. Operations like
    // terminal creation and agent spawning on these workspaces require the remote
    // proxy routing (not yet implemented — see plan "Out of scope" section).
    await onUpsert({
      ...ws,
      workspaceId: mirroredId,
      projectId: mirrorProjectId(hostAlias, ws.projectId),
    });
  }

  for (const existingId of existingMirrorIds) {
    if (!seenIds.has(existingId)) {
      await onRemove(existingId);
    }
  }
}

interface RemoteDaemonApi {
  fetchAll(): Promise<{
    projects: PersistedProjectRecord[];
    workspaces: PersistedWorkspaceRecord[];
  }>;
}

function createRemoteDaemonApi(tunnelPort: number): RemoteDaemonApi {
  const baseUrl = `http://127.0.0.1:${tunnelPort}`;

  return {
    async fetchAll() {
      const res = await fetch(`${baseUrl}/api/workspaces`);
      if (!res.ok) throw new Error(`Remote API error: ${res.status}`);
      const data = await res.json();
      return {
        projects: data.projects ?? [],
        workspaces: data.workspaces ?? [],
      };
    },
  };
}

export class RemoteSyncService {
  private readonly logger: Logger;
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private stopped = new Set<string>(); // Hosts that have been stopped

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

    this.stopSyncForHost(hostAlias);
    this.stopped.delete(hostAlias);

    const api = createRemoteDaemonApi(tunnelPort);
    const prefix = `ssh:${hostAlias}:`;

    let syncing = false;
    const sync = async () => {
      if (syncing) return; // Skip if previous poll still running
      if (this.stopped.has(hostAlias)) return;
      syncing = true;
      try {
        const [remote, allProjects, allWorkspaces] = await Promise.all([
          api.fetchAll(),
          projectRegistry.list(),
          workspaceRegistry.list(),
        ]);

        if (this.stopped.has(hostAlias)) return;

        const existingMirrorIds = new Set(
          allProjects.filter((p) => p.projectId.startsWith(prefix)).map((p) => p.projectId),
        );

        await reconcileRemoteProjects({
          hostAlias,
          hostname,
          remoteProjects: remote.projects,
          existingMirrorIds,
          onUpsert: (record) => projectRegistry.upsert(record),
          onRemove: (id) => projectRegistry.remove(id),
        });

        if (this.stopped.has(hostAlias)) return;

        const existingWsMirrorIds = new Set(
          allWorkspaces.filter((w) => w.workspaceId.startsWith(prefix)).map((w) => w.workspaceId),
        );

        await reconcileRemoteWorkspaces({
          hostAlias,
          remoteWorkspaces: remote.workspaces,
          existingMirrorIds: existingWsMirrorIds,
          onUpsert: (record) => workspaceRegistry.upsert(record),
          onRemove: (id) => workspaceRegistry.remove(id),
        });
      } catch (err) {
        this.logger.warn({ err, hostAlias }, "Remote sync failed");
      } finally {
        syncing = false;
      }
    };

    sync();

    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    timer.unref();
    this.timers.set(hostAlias, timer);
  }

  stopSyncForHost(hostAlias: string): void {
    this.stopped.add(hostAlias);
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
