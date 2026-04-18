import type { Logger } from "pino";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";

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

    this.stopSyncForHost(hostAlias);

    const api = createRemoteDaemonApi(tunnelPort);
    const prefix = `ssh:${hostAlias}:`;

    const sync = async () => {
      try {
        const [remoteProjects, allProjects] = await Promise.all([
          api.fetchProjects(),
          projectRegistry.list(),
        ]);

        const existingMirrorIds = new Set(
          allProjects.filter((p) => p.projectId.startsWith(prefix)).map((p) => p.projectId),
        );

        reconcileRemoteProjects({
          hostAlias,
          hostname,
          remoteProjects,
          existingMirrorIds,
          onUpsert: (record) => projectRegistry.upsert(record),
          onRemove: (id) => projectRegistry.remove(id),
        });

        const [remoteWorkspaces, allWorkspaces] = await Promise.all([
          api.fetchWorkspaces(),
          workspaceRegistry.list(),
        ]);

        const existingWsMirrorIds = new Set(
          allWorkspaces.filter((w) => w.workspaceId.startsWith(prefix)).map((w) => w.workspaceId),
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

    sync();

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
