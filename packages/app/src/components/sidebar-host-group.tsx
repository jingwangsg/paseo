import React from "react";
import { View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type RemoteHostStatus =
  | "registered"
  | "connecting"
  | "deploying"
  | "ready"
  | "unreachable"
  | "failed";

interface SidebarHostGroupProps {
  hostAlias: string | null;
  status: RemoteHostStatus;
  projectCount: number;
}

function getStatusDotColor(
  theme: ReturnType<typeof useUnistyles>["theme"],
  status: RemoteHostStatus,
): string {
  switch (status) {
    case "ready":
      return theme.colors.palette.green[500];
    case "connecting":
    case "deploying":
      return theme.colors.palette.amber[500];
    case "registered":
      return theme.colors.foregroundMuted;
    case "unreachable":
    case "failed":
      return theme.colors.palette.red[500];
  }
}

function getStatusLabel(status: RemoteHostStatus): string | null {
  switch (status) {
    case "ready":
      return null;
    case "connecting":
      return "Connecting";
    case "deploying":
      return "Deploying";
    case "registered":
      return "Registered";
    case "unreachable":
      return "Unreachable";
    case "failed":
      return "Failed";
  }
}

export function SidebarHostGroup({ hostAlias, status, projectCount }: SidebarHostGroupProps) {
  const { theme } = useUnistyles();
  const dotColor = getStatusDotColor(theme, status);
  const statusLabel = getStatusLabel(status);
  const displayName = hostAlias ?? "Local";

  return (
    <View style={styles.container} testID="sidebar-host-group">
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <Text style={styles.label} numberOfLines={1}>
        {displayName}
      </Text>
      {statusLabel ? (
        <Text style={styles.statusText} numberOfLines={1}>
          {statusLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
    minWidth: 0,
  },
  statusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    opacity: 0.7,
    flexShrink: 0,
  },
}));
