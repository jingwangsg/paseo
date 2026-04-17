import React from "react";
import { View } from "react-native";
import type { ExecutionHost } from "@server/shared/messages";

export function SidebarExecutionHostBadge({ host }: { host: ExecutionHost }) {
  if (host.kind === "local") {
    return <View testID="sidebar-execution-host-badge" />;
  }

  // SSH rendering will land in a later iteration.
  return <View testID="sidebar-execution-host-badge" />;
}
