import { Command } from "commander";
import { runAddCommand } from "./add.js";
import { runRemoveCommand } from "./remove.js";
import { runLsCommand } from "./ls.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";

export function createHostCommand(): Command {
  const host = new Command("host").description("Manage remote SSH hosts");

  addJsonAndDaemonHostOptions(
    host.command("ls").description("List remote hosts and their status"),
  ).action(withOutput(runLsCommand));

  addJsonAndDaemonHostOptions(
    host
      .command("add")
      .description("Add a remote SSH host")
      .argument("<alias>", "Alias for the remote host")
      .requiredOption("--hostname <host>", "SSH hostname or IP address")
      .option("--user <user>", "SSH username")
      .option("--port <port>", "SSH port")
      .option("--identity-file <path>", "Path to SSH identity file"),
  ).action(withOutput(runAddCommand));

  addJsonAndDaemonHostOptions(
    host
      .command("remove")
      .description("Remove a remote host")
      .argument("<alias>", "Alias of the host to remove"),
  ).action(withOutput(runRemoveCommand));

  return host;
}
