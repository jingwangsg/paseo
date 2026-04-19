import { useCallback, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Terminal } from "lucide-react-native";
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

function validateHostAlias(alias: string): string | null {
  if (!alias) return "Host alias is required";
  if (alias.includes(":")) return "Alias must not contain colons";
  if (alias.includes("/")) return "Alias must not contain slashes";
  if (alias.includes(" ")) return "Alias must not contain spaces";
  return null;
}

export interface AddSshHostModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel?: () => void;
  serverId: string;
}

export function AddSshHostModal({ visible, onClose, onCancel, serverId }: AddSshHostModalProps) {
  const { theme } = useUnistyles();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);

  const aliasInputRef = useRef<TextInput>(null);
  const [aliasRaw, setAliasRaw] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClose = useCallback(() => {
    if (isSaving) return;
    setAliasRaw("");
    setErrorMessage("");
    onClose();
  }, [isSaving, onClose]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    setAliasRaw("");
    setErrorMessage("");
    (onCancel ?? onClose)();
  }, [isSaving, onCancel, onClose]);

  const handleAdd = useCallback(async () => {
    if (isSaving) return;

    const alias = aliasRaw.trim();
    const validationError = validateHostAlias(alias);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!client || !isConnected) {
      setErrorMessage("Not connected to daemon");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const result = await client.addRemoteHost({ hostAlias: alias });

      if (!result.success) {
        setErrorMessage(result.error ?? `Failed to add host: ${alias}`);
        return;
      }

      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Failed to add SSH host: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }, [aliasRaw, client, handleClose, isConnected, isSaving]);

  return (
    <AdaptiveModalSheet
      title="SSH host"
      visible={visible}
      onClose={handleClose}
      testID="add-ssh-host-modal"
    >
      <Text style={styles.helper}>Enter an alias from your ~/.ssh/config on the daemon host.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>SSH host alias</Text>
        <AdaptiveTextInput
          ref={aliasInputRef}
          value={aliasRaw}
          onChangeText={setAliasRaw}
          placeholder="e.g. my-dev-server"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          returnKeyType="done"
          onSubmitEditing={() => void handleAdd()}
        />
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button style={{ flex: 1 }} variant="secondary" onPress={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          style={{ flex: 1 }}
          variant="default"
          onPress={() => void handleAdd()}
          disabled={isSaving || !isConnected}
          leftIcon={<Terminal size={16} color={theme.colors.palette.white} />}
        >
          {isSaving ? "Adding..." : "Add host"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
