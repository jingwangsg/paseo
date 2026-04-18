import { describe, expect, it, vi } from "vitest";
import { runModeCycleShortcut } from "./mode-cycle-shortcut";

describe("runModeCycleShortcut", () => {
  it("prefers the active workspace tab handler before falling back to running-agent mode cycling", () => {
    const dispatchWorkspaceModeCycle = vi.fn(() => true);
    const runRunningAgentModeCycle = vi.fn(() => ({
      didCycle: true,
      shouldConsume: true,
    }));

    const result = runModeCycleShortcut({
      dispatchWorkspaceModeCycle,
      runRunningAgentModeCycle,
    });

    expect(result).toEqual({ shouldConsume: true });
    expect(dispatchWorkspaceModeCycle).toHaveBeenCalledTimes(1);
    expect(runRunningAgentModeCycle).not.toHaveBeenCalled();
  });

  it("falls back to running-agent mode cycling when the active workspace tab does not handle the shortcut", () => {
    const dispatchWorkspaceModeCycle = vi.fn(() => false);
    const runRunningAgentModeCycle = vi.fn(() => ({
      didCycle: false,
      shouldConsume: true,
    }));

    const result = runModeCycleShortcut({
      dispatchWorkspaceModeCycle,
      runRunningAgentModeCycle,
    });

    expect(result).toEqual({ shouldConsume: true });
    expect(dispatchWorkspaceModeCycle).toHaveBeenCalledTimes(1);
    expect(runRunningAgentModeCycle).toHaveBeenCalledTimes(1);
  });
});
