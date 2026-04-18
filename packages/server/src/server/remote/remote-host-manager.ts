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
    this.getBinary =
      config.getBinary ??
      (() => {
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

    setImmediate(() => {
      this.triggerConnect(input.hostAlias).catch((err) => {
        this.logger.error({ err, hostAlias: input.hostAlias }, "Connect after add failed");
      });
    });
  }

  async removeHost(alias: string): Promise<void> {
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

      const reachable = await ssh.testConnection();
      if (!reachable) {
        this.setStatus(alias, "unreachable", "SSH connection failed");
        return;
      }

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
        continue;
      }

      if (state.status === "failed") {
        continue;
      }

      if (state.status === "ready") {
        const tunnel = this.tunnels.get(alias);
        if (!tunnel?.alive) {
          this.logger.warn({ hostAlias: alias }, "Tunnel dead, marking unreachable");
          this.tunnels.delete(alias);
          this.setStatus(alias, "unreachable", "Tunnel lost");
        }
        continue;
      }

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
