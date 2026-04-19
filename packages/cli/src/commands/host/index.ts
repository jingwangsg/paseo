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
      .description("Add a remote SSH host (uses ~/.ssh/config for connection details)")
      .argument("<alias>", "SSH config host alias"),
  ).action(withOutput(runAddCommand));

  addJsonAndDaemonHostOptions(
    host
      .command("remove")
      .description("Remove a remote host")
      .argument("<alias>", "Alias of the host to remove"),
  ).action(withOutput(runRemoveCommand));

  return host;
}
