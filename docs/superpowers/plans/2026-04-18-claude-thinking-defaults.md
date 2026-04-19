# Claude Thinking Mode Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set the default thinking effort to "max" for all Claude models, and confirm thinking level counts are correct per model family.

**Architecture:** Single file change in `claude-models.ts` to add `defaultThinkingOptionId: "max"` to each Claude model definition that has thinking options. The resolution chain (`agent-status-bar.utils.ts:69`, `use-agent-form-state.ts:160`) already reads `defaultThinkingOptionId` — it just falls back to the first array item ("low") when unset.

**Tech Stack:** TypeScript

**Thinking levels per model (verified against Claude Code docs):**
- **Opus 4.7 / 4.7[1m]:** low, medium, high, xhigh, max (5 levels) — `xhigh` is 4.7-only
- **Opus 4.6 / 4.6[1m], Sonnet 4.6:** low, medium, high, max (4 levels)
- **Haiku 4.5:** no thinking options

---

### Task 1: Add defaultThinkingOptionId to Claude model definitions

**Files:**
- Modify: `packages/server/src/server/agent/providers/claude/claude-models.ts:18-61`

- [ ] **Step 1: Write the failing test**

Create a test that asserts all Claude models with thinking options have `defaultThinkingOptionId: "max"`:

```typescript
// packages/server/src/server/agent/providers/claude/claude-models.test.ts
import { describe, expect, it } from "vitest";
import { getClaudeModels } from "./claude-models.js";

describe("getClaudeModels", () => {
  it("returns models with correct thinking options count", () => {
    const models = getClaudeModels();

    const opus47 = models.find((m) => m.id === "claude-opus-4-7");
    expect(opus47?.thinkingOptions).toHaveLength(5);

    const opus47_1m = models.find((m) => m.id === "claude-opus-4-7[1m]");
    expect(opus47_1m?.thinkingOptions).toHaveLength(5);

    const opus46 = models.find((m) => m.id === "claude-opus-4-6");
    expect(opus46?.thinkingOptions).toHaveLength(4);

    const sonnet46 = models.find((m) => m.id === "claude-sonnet-4-6");
    expect(sonnet46?.thinkingOptions).toHaveLength(4);

    const haiku = models.find((m) => m.id === "claude-haiku-4-5");
    expect(haiku?.thinkingOptions).toBeUndefined();
  });

  it("defaults thinking to max for all models with thinking options", () => {
    const models = getClaudeModels();
    const modelsWithThinking = models.filter((m) => m.thinkingOptions);

    expect(modelsWithThinking.length).toBeGreaterThan(0);
    for (const model of modelsWithThinking) {
      expect(model.defaultThinkingOptionId, `${model.id} should default to max`).toBe("max");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/server/agent/providers/claude/claude-models.test.ts --bail=1`

Expected: FAIL — `defaultThinkingOptionId` is undefined on all models.

- [ ] **Step 3: Add defaultThinkingOptionId to each model**

In `packages/server/src/server/agent/providers/claude/claude-models.ts`, add `defaultThinkingOptionId: "max"` to every model that has `thinkingOptions`:

```typescript
const CLAUDE_MODELS: AgentModelDefinition[] = [
  {
    provider: "claude",
    id: "claude-opus-4-7[1m]",
    label: "Opus 4.7 1M",
    description: "Opus 4.7 with 1M context window",
    thinkingOptions: [...CLAUDE_OPUS_4_7_THINKING_OPTIONS],
    defaultThinkingOptionId: "max",
  },
  {
    provider: "claude",
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    description: "Opus 4.7 · Latest release",
    thinkingOptions: [...CLAUDE_OPUS_4_7_THINKING_OPTIONS],
    defaultThinkingOptionId: "max",
  },
  {
    provider: "claude",
    id: "claude-opus-4-6[1m]",
    label: "Opus 4.6 1M",
    description: "Opus 4.6 with 1M context window",
    thinkingOptions: [...CLAUDE_THINKING_OPTIONS],
    defaultThinkingOptionId: "max",
  },
  {
    provider: "claude",
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    description: "Opus 4.6 · Most capable for complex work",
    isDefault: true,
    thinkingOptions: [...CLAUDE_THINKING_OPTIONS],
    defaultThinkingOptionId: "max",
  },
  {
    provider: "claude",
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Sonnet 4.6 · Best for everyday tasks",
    thinkingOptions: [...CLAUDE_THINKING_OPTIONS],
    defaultThinkingOptionId: "max",
  },
  {
    provider: "claude",
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    description: "Haiku 4.5 · Fastest for quick answers",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/server/agent/providers/claude/claude-models.test.ts --bail=1`

Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 6: Run format**

Run: `npm run format`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/server/agent/providers/claude/claude-models.ts packages/server/src/server/agent/providers/claude/claude-models.test.ts
git commit -m "feat(claude): default thinking effort to max for all Claude models"
```
