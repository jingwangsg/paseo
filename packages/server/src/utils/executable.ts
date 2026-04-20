import os from "node:os";
import { delimiter, extname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
// @ts-expect-error — `which` has no type declarations in this project
import which from "which";
const PROBE_TIMEOUT_MS = 2000;

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

async function enumerateCandidates(name: string): Promise<string[]> {
  let candidates: string[];
  try {
    candidates = await which(name, { all: true });
  } catch (error) {
    // `which` throws ENOENT when the command is absent from PATH.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
}

function enumerateUserBinFallbackDirs(
  options: { homeDir?: string; platform?: NodeJS.Platform } = {},
): string[] {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    return [];
  }

  const homeDir = options.homeDir ?? os.homedir();
  if (!homeDir) {
    return [];
  }

  return [join(homeDir, ".local", "bin"), join(homeDir, "bin")];
}

export function enumerateUserBinFallbackCandidates(
  name: string,
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
  } = {},
): string[] {
  return enumerateUserBinFallbackDirs(options).map((dir) => join(dir, name));
}

export function prependUserBinFallbacksToPath(
  pathValue: string | undefined,
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
  } = {},
): string | undefined {
  const fallbackDirs = enumerateUserBinFallbackDirs(options);
  if (fallbackDirs.length === 0) {
    return pathValue;
  }

  const existingEntries = (pathValue ?? "").split(delimiter).filter((entry) => entry.length > 0);
  const seen = new Set(existingEntries);
  const prefixEntries = fallbackDirs.filter((entry) => !seen.has(entry));
  const combinedEntries = [...prefixEntries, ...existingEntries];

  return combinedEntries.length > 0 ? combinedEntries.join(delimiter) : undefined;
}

export function isWindowsCommandScript(executablePath: string): boolean {
  const extension = extname(executablePath).toLowerCase();
  return process.platform === "win32" && (extension === ".cmd" || extension === ".bat");
}

async function probeExecutable(executablePath: string): Promise<boolean> {
  return await new Promise((resolve) => {
    let settled = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    };

    let child: ChildProcess;
    try {
      child = spawn(executablePath, ["--version"], {
        stdio: "ignore",
        windowsHide: true,
        // Windows batch shims (.cmd/.bat) require cmd.exe; native binaries do not.
        shell: isWindowsCommandScript(executablePath),
      });
    } catch {
      settle(false);
      return;
    }

    timer = setTimeout(() => {
      if (started) {
        child.kill();
        settle(true);
        return;
      }
      settle(false);
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();

    child.once("spawn", () => {
      started = true;
    });
    child.once("error", () => {
      // ENOENT/EACCES/EPERM/UNKNOWN here means the OS could not start the candidate.
      settle(started);
    });
    child.once("exit", () => {
      settle(started);
    });
  });
}

/**
 * Check a literal executable path. PATH search is handled by findExecutable().
 */
export function executableExists(
  executablePath: string,
  exists: typeof existsSync = existsSync,
): string | null {
  if (exists(executablePath)) return executablePath;
  if (process.platform === "win32" && !extname(executablePath)) {
    for (const ext of [".exe", ".cmd"]) {
      const candidate = executablePath + ext;
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

export async function findExecutable(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  if (hasPathSeparator(trimmed)) {
    return (await probeExecutable(trimmed)) ? trimmed : null;
  }

  const candidates = [
    ...(await enumerateCandidates(trimmed)),
    ...enumerateUserBinFallbackCandidates(trimmed),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (await probeExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function isCommandAvailable(command: string): Promise<boolean> {
  return (await findExecutable(command)) !== null;
}

function escapeWindowsCmdValue(value: string): string {
  if (process.platform !== "win32") return value;

  const isQuoted = value.startsWith('"') && value.endsWith('"');
  const unquoted = isQuoted ? value.slice(1, -1) : value;
  const escaped = unquoted.replace(/%/g, "%%").replace(/([&|^<>()!])/g, "^$1");

  if (isQuoted || /[\s"]/u.test(unquoted)) {
    const quoted = escaped
      .replace(/(\\*)"/g, (_match, slashes: string) => `${slashes}${slashes}\\"`)
      .replace(/\\+$/u, (slashes) => `${slashes}${slashes}`);
    return `"${quoted}"`;
  }

  return escaped;
}

/**
 * When spawning with `shell: true` on Windows, the command is passed to
 * `cmd.exe /d /s /c "command args"`. The `/s` strips outer quotes, so a
 * command path with spaces (e.g. `C:\Program Files\...`) is split at the
 * space. Wrapping it in quotes produces the correct `"C:\Program Files\..." args`.
 */
export function quoteWindowsCommand(command: string): string {
  return escapeWindowsCmdValue(command);
}

/**
 * `spawn(..., { shell: true })` on Windows also passes argv through `cmd.exe`.
 * Any argument containing spaces must be quoted or it will be split before the
 * child process sees it.
 */
export function quoteWindowsArgument(argument: string): string {
  return escapeWindowsCmdValue(argument);
}
