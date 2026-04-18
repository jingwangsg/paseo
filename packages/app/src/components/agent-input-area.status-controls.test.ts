import { describe, expect, it, vi } from "vitest";
import {
  resolveStatusControlMode,
  runDraftStatusControlModeCycle,
} from "./agent-input-area.status-controls";

describe("resolveStatusControlMode", () => {
  it("uses ready mode when no controlled status controls are provided", () => {
    expect(resolveStatusControlMode(undefined)).toBe("ready");
  });

  it("uses draft mode when controlled status controls are provided", () => {
    expect(
      resolveStatusControlMode({
        providerDefinitions: [],
        selectedProvider: "codex",
        onSelectProvider: () => undefined,
        modeOptions: [],
        selectedMode: "",
        onSelectMode: () => undefined,
        models: [],
        selectedModel: "",
        onSelectModel: () => undefined,
        isModelLoading: false,
        allProviderModels: new Map(),
        isAllModelsLoading: false,
        onSelectProviderAndModel: () => undefined,
        thinkingOptions: [],
        selectedThinkingOptionId: "",
        onSelectThinkingOption: () => undefined,
      }),
    ).toBe("draft");
  });
});

describe("runDraftStatusControlModeCycle", () => {
  it("cycles to the next draft mode when multiple options are available", () => {
    const onSelectMode = vi.fn();

    const handled = runDraftStatusControlModeCycle({
      providerDefinitions: [],
      selectedProvider: "codex",
      onSelectProvider: () => undefined,
      modeOptions: [
        { id: "plan", label: "Plan" },
        { id: "acceptEdits", label: "Accept Edits" },
      ],
      selectedMode: "plan",
      onSelectMode,
      models: [],
      selectedModel: "",
      onSelectModel: () => undefined,
      isModelLoading: false,
      allProviderModels: new Map(),
      isAllModelsLoading: false,
      onSelectProviderAndModel: () => undefined,
      thinkingOptions: [],
      selectedThinkingOptionId: "",
      onSelectThinkingOption: () => undefined,
    });

    expect(handled).toBe(true);
    expect(onSelectMode).toHaveBeenCalledWith("acceptEdits");
  });

  it("consumes the shortcut without changing background agent mode when draft mode is not switchable", () => {
    const onSelectMode = vi.fn();

    const handled = runDraftStatusControlModeCycle({
      providerDefinitions: [],
      selectedProvider: "codex",
      onSelectProvider: () => undefined,
      modeOptions: [{ id: "plan", label: "Plan" }],
      selectedMode: "plan",
      onSelectMode,
      models: [],
      selectedModel: "",
      onSelectModel: () => undefined,
      isModelLoading: false,
      allProviderModels: new Map(),
      isAllModelsLoading: false,
      onSelectProviderAndModel: () => undefined,
      thinkingOptions: [],
      selectedThinkingOptionId: "",
      onSelectThinkingOption: () => undefined,
    });

    expect(handled).toBe(true);
    expect(onSelectMode).not.toHaveBeenCalled();
  });
});
