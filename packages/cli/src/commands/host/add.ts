import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type {
  CommandOptions,
  SingleResult,
  OutputSchema,
  CommandError,
} from "../../output/index.js";

/** Result type for host add command */
export interface HostAddResult {
  alias: string;
  status: "added";
}

/** Schema for host add output */
export const hostAddSchema: OutputSchema<HostAddResult> = {
  idField: "alias",
  columns: [
    { header: "ALIAS", field: "alias", width: 15 },
    { header: "STATUS", field: "status", width: 10 },
  ],
};

export interface HostAddOptions extends CommandOptions {
  host?: string;
}

export async function runAddCommand(
  alias: string,
  options: HostAddOptions,
  _command: Command,
): Promise<SingleResult<HostAddResult>> {
  const host = getDaemonHost({ host: options.host });

  if (!alias || alias.trim().length === 0) {
    const error: CommandError = {
      code: "MISSING_ALIAS",
      message: "Host alias is required",
      details: "Usage: paseo host add <alias>",
    };
    throw error;
  }

  let client;
  try {
    client = await connectToDaemon({ host: options.host });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${host}: ${message}`,
      details: "Start the daemon with: paseo daemon start",
    };
    throw error;
  }

  try {
    const result = await client.addRemoteHost({
      hostAlias: alias.trim(),
    });

    await client.close();

    if (!result.success) {
      const error: CommandError = {
        code: "HOST_ADD_FAILED",
        message: result.error ?? `Failed to add host: ${alias}`,
      };
      throw error;
    }

    return {
      type: "single",
      data: {
        alias: alias.trim(),
        status: "added",
      },
      schema: hostAddSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});

    if (err && typeof err === "object" && "code" in err) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "HOST_ADD_FAILED",
      message: `Failed to add host: ${message}`,
    };
    throw error;
  }
}
