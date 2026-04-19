import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Link2, Terminal } from "lucide-react-native";
import { AdaptiveModalSheet } from "./adaptive-modal-sheet";

const styles = StyleSheet.create((theme) => ({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  optionSubtext: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  optionBody: {
    flex: 1,
  },
}));

export interface AddHostMethodModalProps {
  visible: boolean;
  onClose: () => void;
  onDirectConnection: () => void;
  onSshHost?: () => void;
}

export function AddHostMethodModal({
  visible,
  onClose,
  onDirectConnection,
  onSshHost,
}: AddHostMethodModalProps) {
  const { theme } = useUnistyles();

  const handleDirect = useCallback(() => {
    onDirectConnection();
  }, [onDirectConnection]);

  const handleSsh = useCallback(() => {
    onSshHost?.();
  }, [onSshHost]);

  return (
    <AdaptiveModalSheet
      title="Add connection"
      visible={visible}
      onClose={onClose}
      testID="add-host-method-modal"
    >
      <Pressable
        style={styles.option}
        onPress={handleDirect}
        accessibilityLabel="Direct connection"
      >
        <Link2 size={18} color={theme.colors.foreground} />
        <View style={styles.optionBody}>
          <Text style={styles.optionText}>Direct connection</Text>
          <Text style={styles.optionSubtext}>Local network or VPN.</Text>
        </View>
      </Pressable>

      {onSshHost ? (
        <Pressable style={styles.option} onPress={handleSsh} accessibilityLabel="SSH host">
          <Terminal size={18} color={theme.colors.foreground} />
          <View style={styles.optionBody}>
            <Text style={styles.optionText}>SSH host</Text>
            <Text style={styles.optionSubtext}>Connect via SSH tunnel.</Text>
          </View>
        </Pressable>
      ) : null}
    </AdaptiveModalSheet>
  );
}
