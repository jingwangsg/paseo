import { View, Text, Pressable } from "react-native";
import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import type { Theme } from "@/styles/theme";

interface MarkdownCollapsibleProps {
  summary: string;
  children: ReactNode;
  theme: Theme;
  defaultOpen?: boolean;
}

export function MarkdownCollapsible({
  summary,
  children,
  theme,
  defaultOpen = false,
}: MarkdownCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = isOpen ? ChevronDown : ChevronRight;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.md,
        marginVertical: theme.spacing[3],
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
          backgroundColor: theme.colors.surface2,
        }}
      >
        <Icon size={16} color={theme.colors.foregroundMuted} />
        <Text
          style={{
            marginLeft: theme.spacing[2],
            color: theme.colors.foreground,
            fontWeight: theme.fontWeight.semibold,
            fontSize: theme.fontSize.sm,
          }}
        >
          {summary}
        </Text>
      </Pressable>

      {isOpen && (
        <View
          style={{
            paddingHorizontal: theme.spacing[3],
            paddingVertical: theme.spacing[3],
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
