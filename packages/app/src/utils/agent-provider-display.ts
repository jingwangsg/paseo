import type { ProviderSnapshotEntry } from "@server/server/agent/agent-sdk-types";
import { AGENT_PROVIDER_DEFINITIONS } from "@server/server/agent/provider-manifest";

export interface AgentProviderBadgeData {
  provider: string;
  label: string;
}

export function humanizeAgentProvider(provider: string): string {
  return provider
    .trim()
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveAgentProviderLabel(
  provider: string,
  snapshotEntries?: ProviderSnapshotEntry[],
): string {
  const snapshotLabel = snapshotEntries
    ?.find((entry) => entry.provider === provider)
    ?.label?.trim();
  if (snapshotLabel) {
    return snapshotLabel;
  }

  const builtinLabel = AGENT_PROVIDER_DEFINITIONS.find(
    (entry) => entry.id === provider,
  )?.label?.trim();
  if (builtinLabel) {
    return builtinLabel;
  }

  return humanizeAgentProvider(provider);
}

export function buildAgentProviderBadge(input: {
  provider: string | null | undefined;
  snapshotEntries?: ProviderSnapshotEntry[];
}): AgentProviderBadgeData | null {
  const provider = input.provider?.trim();
  if (!provider) {
    return null;
  }

  return {
    provider,
    label: resolveAgentProviderLabel(provider, input.snapshotEntries),
  };
}
