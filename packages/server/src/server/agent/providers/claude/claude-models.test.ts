import { describe, expect, test } from "vitest";

import { getClaudeModels } from "./claude-models.js";

describe("getClaudeModels", () => {
  test("every model with thinkingOptions has defaultThinkingOptionId set to 'max'", () => {
    const models = getClaudeModels();
    const modelsWithThinking = models.filter(
      (m) => m.thinkingOptions && m.thinkingOptions.length > 0,
    );

    // Sanity: there should be at least one model with thinking options
    expect(modelsWithThinking.length).toBeGreaterThan(0);

    for (const model of modelsWithThinking) {
      expect(model.defaultThinkingOptionId, `${model.id} missing defaultThinkingOptionId`).toBe(
        "max",
      );
    }
  });

  test("models without thinkingOptions do not have defaultThinkingOptionId", () => {
    const models = getClaudeModels();
    const modelsWithoutThinking = models.filter(
      (m) => !m.thinkingOptions || m.thinkingOptions.length === 0,
    );

    // Sanity: there should be at least one model without thinking options
    expect(modelsWithoutThinking.length).toBeGreaterThan(0);

    for (const model of modelsWithoutThinking) {
      expect(
        model.defaultThinkingOptionId,
        `${model.id} should not have defaultThinkingOptionId`,
      ).toBeUndefined();
    }
  });

  test("defaultThinkingOptionId refers to a valid option in thinkingOptions", () => {
    const models = getClaudeModels();
    const modelsWithThinking = models.filter((m) => m.defaultThinkingOptionId);

    for (const model of modelsWithThinking) {
      const optionIds = model.thinkingOptions!.map((o) => o.id);
      expect(
        optionIds,
        `${model.id}: defaultThinkingOptionId '${model.defaultThinkingOptionId}' not in thinkingOptions`,
      ).toContain(model.defaultThinkingOptionId);
    }
  });
});
