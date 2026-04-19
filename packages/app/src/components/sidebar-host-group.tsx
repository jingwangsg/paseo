import React from "react";
import { View, Text, Pressable } from "react-native";
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
  error?: string | null;
  onRetry?: () => void;
  onAddProject?: () => void;
}

function isRetryable(status: RemoteHostStatus): boolean {
  return status === "failed" || status === "unreachable";
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

export function SidebarHostGroup({
  hostAlias,
  status,
  projectCount,
  error,
  onRetry,
  onAddProject,
}: SidebarHostGroupProps) {
  const { theme } = useUnistyles();
  const dotColor = getStatusDotColor(theme, status);
  const statusLabel = getStatusLabel(status);
  const displayName = hostAlias ?? "Local";
  const retryable = isRetryable(status);
  const showAddProject = hostAlias !== null && status === "ready" && !!onAddProject;

  const header = (
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
      {showAddProject ? (
        <Pressable
          onPress={onAddProject}
          testID={`sidebar-host-add-project-${hostAlias}`}
          nativeID={`sidebar-host-add-project-${hostAlias}`}
          style={styles.addButton}
          accessibilityLabel={`Add project to ${displayName}`}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!retryable) {
    return header;
  }

  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={`Retry ${displayName}`}
    >
      {header}
      <View style={styles.errorContainer}>
        {error ? (
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        ) : null}
        <Text style={styles.retryHint}>Tap to retry</Text>
      </View>
    </Pressable>
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
  errorContainer: {
    paddingHorizontal: theme.spacing[3],
    paddingLeft: theme.spacing[3] + 6 + theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    opacity: 0.6,
  },
  retryHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    opacity: 0.5,
    fontStyle: "italic",
  },
  addButton: {
    marginLeft: "auto",
    paddingHorizontal: theme.spacing[2],
  },
  addButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
