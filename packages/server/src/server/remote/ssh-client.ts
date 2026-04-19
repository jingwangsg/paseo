import { spawn } from "node:child_process";

export interface SshClientConfig {
  /** SSH config host alias or hostname */
  hostname: string;
  connectTimeoutSec?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Expand ~ to "$HOME" with proper quoting for use in shell commands. */
export function expandRemotePath(remotePath: string): string {
  if (remotePath.startsWith("~/")) {
    return `"$HOME"/'${remotePath.slice(2).replace(/'/g, "'\\''")}'`;
  }
  return `'${remotePath.replace(/'/g, "'\\''")}'`;
}

export class SshClient {
  private readonly config: SshClientConfig;

  constructor(config: SshClientConfig) {
    this.config = config;
  }

  buildSshArgs(): string[] {
    const args: string[] = [
      "-o",
      "BatchMode=yes",
      "-o",
      `ConnectTimeout=${this.config.connectTimeoutSec ?? 10}`,
      "-o",
      "StrictHostKeyChecking=accept-new",
      this.config.hostname,
    ];
    return args;
  }

  async exec(command: string): Promise<ExecResult> {
    const args = [...this.buildSshArgs(), command];
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
    });
  }

  async execChecked(command: string): Promise<string> {
    const result = await this.exec(command);
    if (result.exitCode !== 0) {
      throw new Error(
        `SSH command failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    return result.stdout;
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.exec("true");
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async upload(data: Buffer, remotePath: string): Promise<void> {
    const args = [...this.buildSshArgs(), `cat > ${expandRemotePath(remotePath)}`];
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(`Upload failed (exit ${exitCode}): ${stderr.trim()}`));
        } else {
          resolve();
        }
      });
      child.stdin.end(data);
    });
  }

  async detectRemoteArch(): Promise<string> {
    const output = await this.execChecked("uname -sm");
    return output.trim();
  }
}
