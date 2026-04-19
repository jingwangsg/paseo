# Mode Cycling, Status Line Labels, Provider Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Shift+Tab keyboard shortcut to cycle permission modes (for Claude Code and Codex), show mode label text in the status line alongside the icon, and remove all non-core agent providers (Copilot, OpenCode, Pi).

**Architecture:** Three independent changes: (1) a new keyboard action + binding for mode cycling that reads agent state from the session store and calls `setAgentMode`, (2) a UI tweak to the status bar mode badge to show label text, (3) a sweeping removal of Copilot/OpenCode/Pi from provider definitions, registry, icons, and client code.

**Tech Stack:** TypeScript, React Native, Zustand, Expo

---

## File Structure

### Mode cycling (Shift+Tab)
- Modify: `packages/app/src/keyboard/actions.ts` — add `"agent.mode.cycle"` action ID
- Modify: `packages/app/src/keyboard/keyboard-shortcuts.ts` — add `Shift+Tab` binding
- Modify: `packages/app/src/hooks/use-keyboard-shortcuts.ts` — handle the new action (read session store, cycle mode)

### Status line mode label
- Modify: `packages/app/src/components/agent-status-bar.tsx` — change mode badge from icon-only to icon+label

### Provider cleanup (remove Copilot, OpenCode, Pi)
- Modify: `packages/server/src/server/agent/provider-manifest.ts` — remove copilot/opencode/pi definitions and modes
- Modify: `packages/server/src/server/agent/provider-registry.ts` — remove copilot/opencode/pi factories and imports
- Modify: `packages/app/src/components/provider-icons.ts` — remove copilot/opencode/pi icon mappings
- Delete: `packages/app/src/components/icons/copilot-icon.tsx`
- Delete: `packages/app/src/components/icons/opencode-icon.tsx`
- Delete: `packages/app/src/components/icons/pi-icon.tsx`
- Delete: `packages/server/src/server/agent/providers/copilot-acp-agent.ts`
- Delete: `packages/server/src/server/agent/providers/opencode-agent.ts`
- Delete: `packages/server/src/server/agent/providers/pi-acp-agent.ts`
- Delete: `packages/server/src/server/agent/providers/opencode/` (entire directory)
- Modify: `packages/server/src/server/agent/provider-registry.ts` — remove `shutdownProviders` OpenCode reference

---

## Task 1: Add Shift+Tab mode cycling keyboard shortcut

### Task 1.1: Add the action ID

**Files:**
- Modify: `packages/app/src/keyboard/actions.ts:18` (KeyboardActionId union)

- [ ] **Step 1: Add `"agent.mode.cycle"` to `KeyboardActionId` in `actions.ts`**

In `packages/app/src/keyboard/actions.ts`, add `"agent.mode.cycle"` to the `KeyboardActionId` union type, after `"theme.cycle"`:

```typescript
  | "theme.cycle"
  | "agent.mode.cycle"
  | "message-input.action";
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (existing errors may be present).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/keyboard/actions.ts
git commit -m "feat: add agent.mode.cycle keyboard action ID"
```

### Task 1.2: Add the Shift+Tab shortcut binding

**Files:**
- Modify: `packages/app/src/keyboard/keyboard-shortcuts.ts:767` (before theme cycling section)

- [ ] **Step 1: Add Shift+Tab binding to SHORTCUT_BINDINGS**

In `packages/app/src/keyboard/keyboard-shortcuts.ts`, add a new binding entry before the `// --- Theme cycling ---` comment (before line 767). This binding works on all platforms (both mac and non-mac, both desktop and web), requires a selected agent, and should not fire in the command center:

```typescript
  // --- Mode cycling ---
  {
    id: "agent-mode-cycle-shift-tab",
    action: "agent.mode.cycle",
    combo: "Shift+Tab",
    when: { hasSelectedAgent: true, commandCenter: false },
    help: {
      id: "cycle-mode",
      section: "agent-input",
      label: "Cycle permission mode",
      keys: ["shift", "Tab"],
    },
  },
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/keyboard/keyboard-shortcuts.ts
git commit -m "feat: add Shift+Tab binding for mode cycling"
```

### Task 1.3: Handle the mode cycle action in the keyboard shortcut hook

**Files:**
- Modify: `packages/app/src/hooks/use-keyboard-shortcuts.ts`

- [ ] **Step 1: Add the import for useSessionStore**

At the top of `packages/app/src/hooks/use-keyboard-shortcuts.ts`, add:

```typescript
import { useSessionStore } from "@/stores/session-store";
```

- [ ] **Step 2: Add the `cycleAgentMode` helper inside the `useEffect`**

Inside the `useEffect` in `useKeyboardShortcuts`, after the `dispatchMessageInputAction` function (after line 170), add a `cycleAgentMode` helper:

```typescript
    const cycleAgentMode = (): boolean => {
      if (!selectedAgentId || !activeServerId) {
        return false;
      }
      const state = useSessionStore.getState();
      const serverSession = state.sessions[activeServerId];
      if (!serverSession) {
        return false;
      }
      const agent = serverSession.agents?.get(selectedAgentId);
      if (!agent) {
        return false;
      }
      const client = serverSession.client;
      if (!client) {
        return false;
      }
      const modes = agent.availableModes;
      if (!modes || modes.length <= 1) {
        return false;
      }
      const currentIndex = modes.findIndex((m) => m.id === agent.currentModeId);
      const nextIndex = (currentIndex + 1) % modes.length;
      const nextMode = modes[nextIndex];
      if (!nextMode) {
        return false;
      }
      void client.setAgentMode(selectedAgentId, nextMode.id).catch((error) => {
        console.warn("[useKeyboardShortcuts] cycleAgentMode failed", error);
      });
      return true;
    };
```

- [ ] **Step 3: Add the case for `"agent.mode.cycle"` in `handleAction`**

In the `handleAction` switch statement (around line 176), add a case for the new action. Place it before the `"command-center.toggle"` case:

```typescript
        case "agent.mode.cycle":
          return cycleAgentMode();
```

- [ ] **Step 4: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/hooks/use-keyboard-shortcuts.ts
git commit -m "feat: handle Shift+Tab mode cycling via session store"
```

---

## Task 2: Show mode label text in status line

**Files:**
- Modify: `packages/app/src/components/agent-status-bar.tsx:480-500` (mode badge pressable, web branch)

The current mode badge (lines 480-500) uses `styles.modeIconBadge` and shows only the shield icon. We need to:
1. Change `styles.modeIconBadge` → `styles.modeBadge` so there's proper text padding
2. Add the `displayMode` label text after the icon
3. Add a ChevronDown indicator (consistent with other selectors)

- [ ] **Step 1: Update the mode badge in the web/desktop branch**

In `packages/app/src/components/agent-status-bar.tsx`, find the mode badge Pressable (around line 480). Replace the section from the `<Pressable` to its closing `</Pressable>` (lines 480-500):

**Old code (lines 480-500):**
```tsx
                  <Pressable
                    ref={modeAnchorRef}
                    collapsable={false}
                    disabled={disabled || !canSelectMode}
                    onPress={() => handleSelectorPress("mode")}
                    style={({ pressed, hovered }) => [
                      styles.modeIconBadge,
                      hovered && styles.modeBadgeHovered,
                      (pressed || openSelector === "mode") && styles.modeBadgePressed,
                      (disabled || !canSelectMode) && styles.disabledBadge,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select agent mode (${displayMode})`}
                    testID="agent-mode-selector"
                  >
                    {ModeIconComponent ? (
                      <ModeIconComponent size={theme.iconSize.md} color={modeIconColor} />
                    ) : (
                      <ShieldCheck size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
                    )}
                  </Pressable>
```

**New code:**
```tsx
                  <Pressable
                    ref={modeAnchorRef}
                    collapsable={false}
                    disabled={disabled || !canSelectMode}
                    onPress={() => handleSelectorPress("mode")}
                    style={({ pressed, hovered }) => [
                      styles.modeBadge,
                      hovered && styles.modeBadgeHovered,
                      (pressed || openSelector === "mode") && styles.modeBadgePressed,
                      (disabled || !canSelectMode) && styles.disabledBadge,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select agent mode (${displayMode})`}
                    testID="agent-mode-selector"
                  >
                    {ModeIconComponent ? (
                      <ModeIconComponent size={theme.iconSize.md} color={modeIconColor} />
                    ) : (
                      <ShieldCheck size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
                    )}
                    <Text style={styles.modeBadgeText}>{displayMode}</Text>
                    <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
                  </Pressable>
```

The key changes:
- `styles.modeIconBadge` → `styles.modeBadge` (adds horizontal padding for text)
- Added `<Text style={styles.modeBadgeText}>{displayMode}</Text>` after the icon
- Added `<ChevronDown>` indicator (matches provider/thinking selectors)

- [ ] **Step 2: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/agent-status-bar.tsx
git commit -m "feat: show mode label text in status line alongside icon"
```

---

## Task 3: Remove non-core providers (Copilot, OpenCode, Pi)

### Task 3.1: Remove provider definitions from manifest

**Files:**
- Modify: `packages/server/src/server/agent/provider-manifest.ts`

- [ ] **Step 1: Remove COPILOT_MODES, OPENCODE_MODES, and their entries from AGENT_PROVIDER_DEFINITIONS**

In `packages/server/src/server/agent/provider-manifest.ts`:

1. Delete `COPILOT_MODES` (lines 78-100)
2. Delete `OPENCODE_MODES` (lines 102-117)
3. Remove the copilot entry from `AGENT_PROVIDER_DEFINITIONS` (lines 144-150)
4. Remove the opencode entry (lines 151-161)
5. Remove the pi entry (lines 162-168)

The resulting `AGENT_PROVIDER_DEFINITIONS` should only have claude and codex entries.

- [ ] **Step 2: Run typecheck**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors about missing imports in provider-registry.ts (we'll fix next).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server/agent/provider-manifest.ts
git commit -m "feat: remove copilot/opencode/pi from provider manifest"
```

### Task 3.2: Remove provider factories from registry

**Files:**
- Modify: `packages/server/src/server/agent/provider-registry.ts`

- [ ] **Step 1: Remove imports for Copilot, OpenCode, Pi clients**

Remove these import lines from `packages/server/src/server/agent/provider-registry.ts`:

```typescript
import { CopilotACPAgentClient } from "./providers/copilot-acp-agent.js";
import { OpenCodeAgentClient, OpenCodeServerManager } from "./providers/opencode-agent.js";
import { PiACPAgentClient } from "./providers/pi-acp-agent.js";
```

- [ ] **Step 2: Remove copilot, opencode, pi entries from PROVIDER_CLIENT_FACTORIES**

In the `PROVIDER_CLIENT_FACTORIES` record (lines 64-82), remove the `copilot`, `opencode`, and `pi` entries. The result should be:

```typescript
const PROVIDER_CLIENT_FACTORIES: Record<string, ProviderClientFactory> = {
  claude: (logger, runtimeSettings) =>
    new ClaudeAgentClient({
      logger,
      runtimeSettings,
    }),
  codex: (logger, runtimeSettings) => new CodexAppServerAgentClient(logger, runtimeSettings),
};
```

- [ ] **Step 3: Remove or simplify `shutdownProviders`**

The `shutdownProviders` function (lines 473-478) references `OpenCodeServerManager`. Since OpenCode is removed, simplify it to a no-op or remove it entirely. If it's exported and used elsewhere, make it an empty async function:

```typescript
export async function shutdownProviders(
  _logger: Logger,
  _options?: BuildProviderRegistryOptions,
): Promise<void> {
  // No provider-specific shutdown needed
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (may still have errors from deleted provider files not being found, which is fine — they'll be deleted next).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server/agent/provider-registry.ts
git commit -m "feat: remove copilot/opencode/pi from provider registry"
```

### Task 3.3: Delete provider implementation files

**Files:**
- Delete: `packages/server/src/server/agent/providers/copilot-acp-agent.ts`
- Delete: `packages/server/src/server/agent/providers/opencode-agent.ts`
- Delete: `packages/server/src/server/agent/providers/pi-acp-agent.ts`
- Delete: `packages/server/src/server/agent/providers/opencode/` (entire directory)

- [ ] **Step 1: Delete the provider implementation files**

```bash
rm packages/server/src/server/agent/providers/copilot-acp-agent.ts
rm packages/server/src/server/agent/providers/opencode-agent.ts
rm packages/server/src/server/agent/providers/pi-acp-agent.ts
rm -rf packages/server/src/server/agent/providers/opencode/
```

- [ ] **Step 2: Check for remaining imports of these files**

Run: `grep -r "copilot-acp-agent\|opencode-agent\|pi-acp-agent" packages/server/src/ --include='*.ts' -l | grep -v '.test.' | grep -v '.e2e.'`

Fix any remaining non-test imports.

- [ ] **Step 3: Commit**

```bash
git add -u packages/server/src/server/agent/providers/
git commit -m "feat: delete copilot/opencode/pi provider implementations"
```

### Task 3.4: Remove provider icons from the app

**Files:**
- Modify: `packages/app/src/components/provider-icons.ts`
- Delete: `packages/app/src/components/icons/copilot-icon.tsx`
- Delete: `packages/app/src/components/icons/opencode-icon.tsx`
- Delete: `packages/app/src/components/icons/pi-icon.tsx`

- [ ] **Step 1: Update provider-icons.ts to only include claude and codex**

Replace the contents of `packages/app/src/components/provider-icons.ts` with:

```typescript
import { Bot } from "lucide-react-native";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CodexIcon } from "@/components/icons/codex-icon";

const PROVIDER_ICONS: Record<string, typeof Bot> = {
  claude: ClaudeIcon as unknown as typeof Bot,
  codex: CodexIcon as unknown as typeof Bot,
};

export function getProviderIcon(provider: string): typeof Bot {
  return PROVIDER_ICONS[provider] ?? Bot;
}
```

- [ ] **Step 2: Delete the icon component files**

```bash
rm packages/app/src/components/icons/copilot-icon.tsx
rm packages/app/src/components/icons/opencode-icon.tsx
rm packages/app/src/components/icons/pi-icon.tsx
```

- [ ] **Step 3: Check for remaining imports of deleted icons**

Run: `grep -r "copilot-icon\|opencode-icon\|pi-icon" packages/app/src/ --include='*.ts' --include='*.tsx' -l`

Fix any remaining imports.

- [ ] **Step 4: Run typecheck for both packages**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Run: `cd packages/server && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/provider-icons.ts
git add -u packages/app/src/components/icons/
git commit -m "feat: remove copilot/opencode/pi icons from app"
```

### Task 3.5: Clean up remaining references

**Files:**
- Possibly modify: various test files, config files, docs

- [ ] **Step 1: Search for remaining references to removed providers in non-test source files**

```bash
grep -r '"copilot"\|"opencode"\|"pi"' packages/app/src/ packages/server/src/ --include='*.ts' --include='*.tsx' -l | grep -v '.test.' | grep -v '.e2e.' | grep -v 'node_modules'
```

Review each match. Some may be in:
- `agent-response-loop.ts` — provider-specific behavior branching
- `persisted-config.ts` — provider config validation
- `model-resolver.test.ts` — test data
- Other files

For source files (not tests): remove copilot/opencode/pi branches or references. For test files: leave them alone unless they import deleted modules.

- [ ] **Step 2: Run full typecheck**

Run: `npm run typecheck 2>&1 | tail -30`
Expected: PASS or only pre-existing errors.

- [ ] **Step 3: Run format**

Run: `npm run format`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up remaining copilot/opencode/pi references"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 2: Run format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 3: Verify keyboard shortcuts help shows the new binding**

The `buildKeyboardShortcutHelpSections` function should include "Cycle permission mode" in the "Agent Input" section. This is automatic since we added the `help` field to the binding.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification pass"
```
