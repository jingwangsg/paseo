import type { DraftAgentStatusBarProps } from "./agent-status-bar";

export function resolveStatusControlMode(statusControls?: DraftAgentStatusBarProps) {
  return statusControls ? "draft" : "ready";
}

export function runDraftStatusControlModeCycle(statusControls?: DraftAgentStatusBarProps): boolean {
  if (!statusControls) {
    return false;
  }

  if (statusControls.disabled) {
    return true;
  }

  const { modeOptions, selectedMode, onSelectMode } = statusControls;
  if (modeOptions.length <= 1) {
    return true;
  }

  if (!selectedMode.trim()) {
    const firstMode = modeOptions[0];
    if (firstMode) {
      onSelectMode(firstMode.id);
    }
    return true;
  }

  const currentIndex = modeOptions.findIndex((mode) => mode.id === selectedMode);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % modeOptions.length;
  const nextMode = modeOptions[nextIndex];
  if (nextMode) {
    onSelectMode(nextMode.id);
  }
  return true;
}
