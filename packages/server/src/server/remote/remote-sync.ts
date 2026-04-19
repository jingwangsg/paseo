import type { Logger } from "pino";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";

const SYNC_INTERVAL_MS = 5_000;

export function mirrorProjectId(hostAlias: string, remoteProjectId: string): string {
  return `ssh:${hostAlias}:${remoteProjectId}`;
}

export async function reconcileRemoteProjects(options: {
  hostAlias: string;
  remoteProjects: PersistedProjectRecord[];
  existingMirrorIds: Set<string>;
  onUpsert: (record: PersistedProjectRecord) => Promise<void> | void;
  onRemove: (projectId: string) => Promise<void> | void;
}): Promise<void> {
  const { hostAlias, remoteProjects, existingMirrorIds, onUpsert, onRemove } = options;
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
  /** Per-host generation counter: incremented on every start/stop. Sync closures
   *  capture the generation at creation time and bail if it no longer matches. */
  private syncGeneration = new Map<string, number>();

  constructor(logger: Logger) {
    this.logger = logger.child({ module: "remote-sync" });
  }

  startSyncForHost(options: {
    hostAlias: string;
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
    const { hostAlias, tunnelPort, projectRegistry, workspaceRegistry } = options;

    this.stopSyncForHost(hostAlias);

    // Assign a new generation — any in-flight sync from a previous start will
    // see a stale generation and bail before mutating registries.
    const gen = (this.syncGeneration.get(hostAlias) ?? 0) + 1;
    this.syncGeneration.set(hostAlias, gen);

    const api = createRemoteDaemonApi(tunnelPort);
    const prefix = `ssh:${hostAlias}:`;

    const isStale = () => this.syncGeneration.get(hostAlias) !== gen;

    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      if (isStale()) return;
      syncing = true;
      try {
        const [remote, allProjects, allWorkspaces] = await Promise.all([
          api.fetchAll(),
          projectRegistry.list(),
          workspaceRegistry.list(),
        ]);

        if (isStale()) return;

        const existingMirrorIds = new Set(
          allProjects.filter((p) => p.projectId.startsWith(prefix)).map((p) => p.projectId),
        );

        await reconcileRemoteProjects({
          hostAlias,
          remoteProjects: remote.projects,
          existingMirrorIds,
          onUpsert: (record) => {
            if (isStale()) return;
            return projectRegistry.upsert(record);
          },
          onRemove: (id) => {
            if (isStale()) return;
            return projectRegistry.remove(id);
          },
        });

        if (isStale()) return;

        const existingWsMirrorIds = new Set(
          allWorkspaces.filter((w) => w.workspaceId.startsWith(prefix)).map((w) => w.workspaceId),
        );

        await reconcileRemoteWorkspaces({
          hostAlias,
          remoteWorkspaces: remote.workspaces,
          existingMirrorIds: existingWsMirrorIds,
          onUpsert: (record) => {
            if (isStale()) return;
            return workspaceRegistry.upsert(record);
          },
          onRemove: (id) => {
            if (isStale()) return;
            return workspaceRegistry.remove(id);
          },
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
    // Bump generation so any in-flight sync for this alias becomes stale
    const gen = (this.syncGeneration.get(hostAlias) ?? 0) + 1;
    this.syncGeneration.set(hostAlias, gen);
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
