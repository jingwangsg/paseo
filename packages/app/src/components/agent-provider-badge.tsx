import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildAgentProviderBadge } from "@/utils/agent-provider-display";

interface AgentProviderBadgeProps {
  provider: string | null | undefined;
  serverId?: string | null;
  label?: string | null;
  size?: "regular" | "compact";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AgentProviderBadge({
  provider,
  serverId = null,
  label = null,
  size = "regular",
  style,
  testID,
}: AgentProviderBadgeProps) {
  const { theme } = useUnistyles();
  const { entries } = useProvidersSnapshot(serverId);
  const badge = label?.trim()
    ? {
        provider: provider?.trim() ?? "",
        label: label.trim(),
      }
    : buildAgentProviderBadge({ provider, snapshotEntries: entries });

  if (!badge) {
    return null;
  }

  const ProviderIcon = getProviderIcon(badge.provider);
  const isCompact = size === "compact";

  return (
    <View testID={testID} style={[styles.badge, isCompact && styles.badgeCompact, style]}>
      <ProviderIcon size={isCompact ? 10 : 12} color={theme.colors.foregroundMuted} />
      <Text numberOfLines={1} style={[styles.badgeText, isCompact && styles.badgeTextCompact]}>
        {badge.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: "100%",
  },
  badgeCompact: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 2,
  },
  badgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
    flexShrink: 1,
  },
  badgeTextCompact: {
    lineHeight: 12,
  },
}));
