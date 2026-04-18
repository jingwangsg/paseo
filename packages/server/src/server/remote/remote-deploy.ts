import type { Logger } from "pino";
import type { SshClient } from "./ssh-client.js";

export const REMOTE_DAEMON_PORT = 6767;
const REMOTE_BIN_PATH = "~/.paseo/bin/paseo-daemon";
const REMOTE_PID_PATH = "~/.paseo/paseo.pid";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 20;

export function mapUnameToTarget(uname: string): string {
  const mapping: Record<string, string> = {
    "Linux x86_64": "x64-linux",
    "Linux aarch64": "arm64-linux",
    "Darwin arm64": "arm64-darwin",
    "Darwin x86_64": "x64-darwin",
  };
  const target = mapping[uname];
  if (!target) {
    throw new Error(`Unsupported remote platform: ${uname}`);
  }
  return target;
}

export function remoteStartCommand(): string {
  return `${REMOTE_BIN_PATH} --daemon --no-host-scan --listen 127.0.0.1:${REMOTE_DAEMON_PORT}`;
}

export async function getRemoteVersion(ssh: SshClient): Promise<string | null> {
  try {
    const output = await ssh.execChecked(`${REMOTE_BIN_PATH} --version`);
    return output.trim();
  } catch {
    return null;
  }
}

export async function isRemoteDaemonRunning(ssh: SshClient): Promise<boolean> {
  try {
    const result = await ssh.exec(
      `pid=$(cat ${REMOTE_PID_PATH} 2>/dev/null) && [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null`,
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function killRemoteDaemon(ssh: SshClient, logger: Logger): Promise<void> {
  const script = [
    `pid=$(cat ${REMOTE_PID_PATH} 2>/dev/null)`,
    `if [ -n "$pid" ]; then`,
    `  kill "$pid" 2>/dev/null`,
    `  for i in 1 2 3; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done`,
    `fi`,
    `rm -f ${REMOTE_PID_PATH}`,
  ].join("; ");

  await ssh.exec(script);
  logger.info("Killed existing remote daemon");
}

export async function uploadBinary(ssh: SshClient, binary: Buffer, logger: Logger): Promise<void> {
  await ssh.execChecked("mkdir -p ~/.paseo/bin");
  await ssh.upload(binary, REMOTE_BIN_PATH);
  await ssh.execChecked(`chmod +x ${REMOTE_BIN_PATH}`);
  logger.info({ size: binary.length }, "Uploaded remote daemon binary");
}

export async function startRemoteDaemon(ssh: SshClient, logger: Logger): Promise<void> {
  const cmd = remoteStartCommand();
  await ssh.exec(`nohup ${cmd} > /dev/null 2>&1 &`);
  logger.info("Remote daemon start command issued");
}

export async function waitForRemoteDaemon(ssh: SshClient, logger: Logger): Promise<boolean> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const running = await isRemoteDaemonRunning(ssh);
    if (running) {
      const portCheck = await ssh.exec(
        `nc -z 127.0.0.1 ${REMOTE_DAEMON_PORT} 2>/dev/null || python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1',${REMOTE_DAEMON_PORT})); s.close()" 2>/dev/null || (echo > /dev/tcp/127.0.0.1/${REMOTE_DAEMON_PORT}) 2>/dev/null`,
      );
      if (portCheck.exitCode === 0) {
        logger.info("Remote daemon is ready");
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  logger.warn("Remote daemon did not become ready within timeout");
  return false;
}

export interface DeployResult {
  success: boolean;
  version: string | null;
  error?: string;
}

export async function ensureRemoteDaemon(options: {
  ssh: SshClient;
  localVersion: string;
  getBinary: (target: string) => Promise<Buffer>;
  logger: Logger;
}): Promise<DeployResult> {
  const { ssh, localVersion, getBinary, logger } = options;

  const uname = await ssh.detectRemoteArch();
  const target = mapUnameToTarget(uname);
  logger.info({ uname, target }, "Detected remote platform");

  const remoteVersion = await getRemoteVersion(ssh);
  logger.info({ remoteVersion, localVersion }, "Version comparison");

  if (remoteVersion === localVersion) {
    const running = await isRemoteDaemonRunning(ssh);
    if (running) {
      logger.info("Remote daemon already running with matching version");
      return { success: true, version: remoteVersion };
    }
    logger.info("Remote daemon not running, starting...");
    await startRemoteDaemon(ssh, logger);
    const ready = await waitForRemoteDaemon(ssh, logger);
    return { success: ready, version: remoteVersion };
  }

  const binary = await getBinary(target);

  if (remoteVersion) {
    await killRemoteDaemon(ssh, logger);
  }

  await uploadBinary(ssh, binary, logger);
  await startRemoteDaemon(ssh, logger);
  const ready = await waitForRemoteDaemon(ssh, logger);

  if (!ready) {
    return { success: false, version: null, error: "Remote daemon failed to start" };
  }

  const newVersion = await getRemoteVersion(ssh);
  return { success: true, version: newVersion };
}
