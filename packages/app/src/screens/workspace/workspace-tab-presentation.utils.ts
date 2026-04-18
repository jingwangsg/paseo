import type { PanelDescriptor } from "@/panels/panel-registry";
import type { WorkspaceTabPresentation } from "./workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "./workspace-tabs-types";

export function createWorkspaceTabPresentation(input: {
  tab: WorkspaceTabDescriptor;
  descriptor: PanelDescriptor;
}): WorkspaceTabPresentation {
  const { tab, descriptor } = input;

  return {
    key: tab.key,
    kind: tab.kind,
    label: descriptor.label,
    subtitle: descriptor.subtitle,
    titleState: descriptor.titleState,
    icon: descriptor.icon,
    statusBucket: descriptor.statusBucket,
    providerBadge: tab.kind === "agent" ? (descriptor.providerBadge ?? null) : null,
  };
}
