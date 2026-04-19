import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import type { Logger } from "pino";

export interface TunnelConfig {
  /** SSH config host alias or hostname */
  hostname: string;
  localPort: number;
  remotePort: number;
}

export function buildTunnelArgs(config: TunnelConfig): string[] {
  const args: string[] = [
    "-N",
    "-L",
    `127.0.0.1:${config.localPort}:127.0.0.1:${config.remotePort}`,
    "-S",
    "none",
    "-o",
    "ControlMaster=no",
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ServerAliveInterval=10",
    "-o",
    "ServerAliveCountMax=3",
  ];
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
    throw new Error(
      `SSH tunnel to ${config.hostname} failed: port ${localPort} not reachable after 10s`,
    );
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
