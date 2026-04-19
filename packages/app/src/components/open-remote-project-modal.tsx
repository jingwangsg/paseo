import { useCallback, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FolderPlus } from "lucide-react-native";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { AdaptiveModalSheet, AdaptiveTextInput } from "./adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));

export interface OpenRemoteProjectModalProps {
  visible: boolean;
  onClose: () => void;
  serverId: string;
  hostAlias: string;
}

export function OpenRemoteProjectModal({
  visible,
  onClose,
  serverId,
  hostAlias,
}: OpenRemoteProjectModalProps) {
  const { theme } = useUnistyles();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);

  const inputRef = useRef<TextInput>(null);
  const [cwdRaw, setCwdRaw] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClose = useCallback(() => {
    if (isOpening) return;
    setCwdRaw("");
    setErrorMessage("");
    onClose();
  }, [isOpening, onClose]);

  const handleOpen = useCallback(async () => {
    if (isOpening) return;

    const cwd = cwdRaw.trim();
    if (!cwd) {
      setErrorMessage("Directory path is required");
      return;
    }
    if (!cwd.startsWith("/")) {
      setErrorMessage("Path must be absolute (start with /)");
      return;
    }

    if (!client || !isConnected) {
      setErrorMessage("Not connected to daemon");
      return;
    }

    try {
      setIsOpening(true);
      setErrorMessage("");

      const result = await client.openRemoteProject({ hostAlias, cwd });

      if (!result.success) {
        setErrorMessage(result.error ?? `Failed to open project on ${hostAlias}`);
        return;
      }

      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Failed to open remote project: ${message}`);
    } finally {
      setIsOpening(false);
    }
  }, [cwdRaw, client, handleClose, hostAlias, isConnected, isOpening]);

  return (
    <AdaptiveModalSheet
      title={`Open project on ${hostAlias}`}
      visible={visible}
      onClose={handleClose}
      testID="open-remote-project-modal"
    >
      <Text style={styles.helper}>Enter an absolute directory path on {hostAlias}.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Directory path</Text>
        <AdaptiveTextInput
          ref={inputRef}
          value={cwdRaw}
          onChangeText={setCwdRaw}
          placeholder="e.g. /home/user/my-project"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isOpening}
          returnKeyType="done"
          onSubmitEditing={() => void handleOpen()}
        />
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button style={{ flex: 1 }} variant="secondary" onPress={handleClose} disabled={isOpening}>
          Cancel
        </Button>
        <Button
          style={{ flex: 1 }}
          variant="default"
          onPress={() => void handleOpen()}
          disabled={isOpening || !isConnected}
          leftIcon={<FolderPlus size={16} color={theme.colors.palette.white} />}
        >
          {isOpening ? "Opening..." : "Open project"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
