import type { Command } from "commander";
import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandOptions, ListResult, OutputSchema, CommandError } from "../../output/index.js";

/** Host list item for display */
export interface HostListItem {
  alias: string;
  status: string;
  tunnel: string;
  version: string;
}

/** Schema for host ls output */
export const hostLsSchema: OutputSchema<HostListItem> = {
  idField: "alias",
  columns: [
    { header: "ALIAS", field: "alias", width: 15 },
    {
      header: "STATUS",
      field: "status",
      width: 14,
      color: (value) => {
        if (value === "ready") return "green";
        if (value === "connecting" || value === "deploying") return "yellow";
        if (value === "unreachable" || value === "failed") return "red";
        return undefined;
      },
    },
    { header: "TUNNEL", field: "tunnel", width: 10 },
    { header: "VERSION", field: "version", width: 12 },
  ],
};

export type HostLsResult = ListResult<HostListItem>;

export interface HostLsOptions extends CommandOptions {
  host?: string;
}

export async function runLsCommand(
  options: HostLsOptions,
  _command: Command,
): Promise<HostLsResult> {
  const host = getDaemonHost({ host: options.host });

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
    const response = await client.fetchRemoteHosts();

    await client.close();

    const items: HostListItem[] = response.hosts.map((h) => ({
      alias: h.hostAlias,
      status: h.status,
      tunnel: h.tunnelPort ? String(h.tunnelPort) : "-",
      version: h.daemonVersion ?? "-",
    }));

    return {
      type: "list",
      data: items,
      schema: hostLsSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});

    if (err && typeof err === "object" && "code" in err) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "HOST_LIST_FAILED",
      message: `Failed to list remote hosts: ${message}`,
    };
    throw error;
  }
}
