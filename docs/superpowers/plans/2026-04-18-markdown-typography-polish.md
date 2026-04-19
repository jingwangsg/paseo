# Markdown Typography & Visual Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the markdown rendering from "functional" to "polished" — better typographic rhythm, visual hierarchy, nesting cues, and missing GFM features (task lists, collapsible sections).

**Architecture:** All changes are in `packages/app`. Pure style tweaks live in `markdown-styles.ts`. Rendering behavior changes go in custom render rules in `message.tsx` (and mirrored in `plan-card.tsx` where applicable). New MarkdownIt plugins extend the parser in the existing `useMemo` blocks. No new top-level packages — just `markdown-it-task-lists` as a dev dependency.

**Tech Stack:** React Native, `react-native-markdown-display`, `markdown-it`, `react-native-unistyles`

**Note:** Smart typography (`typographer: true`) is already enabled in the MarkdownIt config. No action needed there.

---

## File Map

| File | Role |
|---|---|
| `packages/app/src/styles/markdown-styles.ts` | All markdown style definitions |
| `packages/app/src/styles/markdown-styles.test.ts` | Style assertion tests |
| `packages/app/src/utils/markdown-list.ts` | List marker logic (bullet char + ordered numbering) |
| `packages/app/src/utils/markdown-list.test.ts` | List marker tests |
| `packages/app/src/components/message.tsx` | Custom render rules for assistant messages |
| `packages/app/src/components/plan-card.tsx` | Custom render rules for plan cards (mirror relevant changes) |
| `packages/app/src/components/markdown-collapsible.tsx` | **New** — `<details>/<summary>` collapsible component |
| `packages/app/package.json` | Add `markdown-it-task-lists` dependency |

---

### Task 1: Bold Weight Fix

The `strong` style uses `fontWeight: medium` (500), which is barely distinguishable from normal text (400). It should be `semibold` (600) at minimum.

**Files:**
- Modify: `packages/app/src/styles/markdown-styles.ts:127-129`
- Modify: `packages/app/src/styles/markdown-styles.test.ts`

- [ ] **Step 1: Write the failing test**

In `markdown-styles.test.ts`, add:

```typescript
it("strong text uses semibold weight for visual distinction", () => {
  const styles = createMarkdownStyles(darkTheme);
  expect(styles.strong.fontWeight).toBe(darkTheme.fontWeight.semibold);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: FAIL — `strong.fontWeight` is `medium` (500), not `semibold` (600).

- [ ] **Step 3: Fix the style**

In `markdown-styles.ts`, change:

```typescript
// Before
strong: {
  ...webSelectableTextStyle,
  fontWeight: theme.fontWeight.medium,
},

// After
strong: {
  ...webSelectableTextStyle,
  fontWeight: theme.fontWeight.semibold,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/styles/markdown-styles.ts packages/app/src/styles/markdown-styles.test.ts
git commit -m "fix(markdown): use semibold weight for bold text"
```

---

### Task 2: Inline Code Visual Contrast

Current inline code has `paddingVertical: 2` and `paddingHorizontal: spacing[1]` (4px). It blends into surrounding text. Increase padding and add a subtle border for better definition.

**Files:**
- Modify: `packages/app/src/styles/markdown-styles.ts:164-174`
- Modify: `packages/app/src/styles/markdown-styles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("inline code has visible padding and border for contrast", () => {
  const styles = createMarkdownStyles(darkTheme);
  expect(styles.code_inline).toMatchObject({
    paddingVertical: 3,
    paddingHorizontal: darkTheme.spacing[2],
    borderWidth: 1,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: FAIL — current `paddingVertical` is 2, `paddingHorizontal` is `spacing[1]` (4), no `borderWidth`.

- [ ] **Step 3: Update the style**

In `markdown-styles.ts`, change `code_inline`:

```typescript
code_inline: {
  ...webSelectableTextStyle,
  backgroundColor: theme.colors.surface2,
  color: theme.colors.foreground,
  paddingHorizontal: theme.spacing[2],
  paddingVertical: 3,
  borderRadius: theme.borderRadius.md,
  borderWidth: 1,
  borderColor: theme.colors.border,
  fontFamily: Fonts.mono,
  fontSize: theme.fontSize.sm,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/styles/markdown-styles.ts packages/app/src/styles/markdown-styles.test.ts
git commit -m "style(markdown): improve inline code contrast with more padding and border"
```

---

### Task 3: Elegant Horizontal Rule

The current `hr` is a flat 1px line. Replace with a centered dot pattern (` · · · `) for a more typographic feel, similar to Medium/Substack article dividers.

**Files:**
- Modify: `packages/app/src/styles/markdown-styles.ts:319-323`
- Modify: `packages/app/src/components/message.tsx` (add `hr` render rule)
- Modify: `packages/app/src/styles/markdown-styles.test.ts`

- [ ] **Step 1: Write the failing test for style**

```typescript
it("hr has centered text alignment and transparent background", () => {
  const styles = createMarkdownStyles(darkTheme);
  expect(styles.hr).toMatchObject({
    marginVertical: darkTheme.spacing[6],
    textAlign: "center",
  });
  expect(styles.hr.backgroundColor).toBeUndefined();
  expect(styles.hr.height).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: FAIL — current hr has `backgroundColor` and `height: 1`.

- [ ] **Step 3: Update the hr style**

In `markdown-styles.ts`, replace the `hr` entry:

```typescript
hr: {
  marginVertical: theme.spacing[6],
  alignItems: "center" as const,
  justifyContent: "center" as const,
},
```

- [ ] **Step 4: Add custom render rule for hr in message.tsx**

In the `markdownRules` useMemo block in `message.tsx`, add after the `paragraph` rule:

```typescript
hr: (node: any) => (
  <View
    key={node.key}
    style={{
      marginVertical: theme.spacing[6],
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text
      style={{
        color: theme.colors.foregroundMuted,
        fontSize: theme.fontSize.base,
        letterSpacing: 8,
      }}
    >
      ···
    </Text>
  </View>
),
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1 && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/styles/markdown-styles.ts packages/app/src/styles/markdown-styles.test.ts packages/app/src/components/message.tsx
git commit -m "style(markdown): replace flat hr line with centered dot divider"
```

---

### Task 4: Multi-Level Bullet Markers

Currently all unordered list nesting levels use the same `•` bullet. Change to `•` (level 0) → `◦` (level 1) → `▪` (level 2+) for visual depth cues.

**Files:**
- Modify: `packages/app/src/utils/markdown-list.ts`
- Modify: `packages/app/src/utils/markdown-list.test.ts`

- [ ] **Step 1: Write the failing tests**

In `markdown-list.test.ts`, add:

```typescript
it("returns filled bullet for top-level bullet list", () => {
  const node = { type: "list_item", index: 0 };
  const parent = [{ type: "bullet_list" }];
  const result = getMarkdownListMarker(node, parent);
  expect(result).toEqual({ isOrdered: false, marker: "•" });
});

it("returns hollow bullet for second-level nested bullet list", () => {
  const node = { type: "list_item", index: 0 };
  const parent = [{ type: "bullet_list" }, { type: "list_item" }, { type: "bullet_list" }];
  const result = getMarkdownListMarker(node, parent);
  expect(result).toEqual({ isOrdered: false, marker: "◦" });
});

it("returns square bullet for third-level nested bullet list", () => {
  const node = { type: "list_item", index: 0 };
  const parent = [
    { type: "bullet_list" },
    { type: "list_item" },
    { type: "bullet_list" },
    { type: "list_item" },
    { type: "bullet_list" },
  ];
  const result = getMarkdownListMarker(node, parent);
  expect(result).toEqual({ isOrdered: false, marker: "▪" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/app && npx vitest run src/utils/markdown-list.test.ts --bail=1`
Expected: FAIL — all nested levels return `"•"`.

- [ ] **Step 3: Update markdown-list.ts**

Replace the `LIST_BULLET` constant and update the function:

```typescript
const BULLET_MARKERS = ["•", "◦", "▪"] as const;

function getBulletNestingDepth(parent: unknown): number {
  const ancestors = toParentNodes(parent);
  let depth = 0;
  for (const ancestor of ancestors) {
    if (ancestor?.type === "bullet_list") {
      depth++;
    }
  }
  // depth >= 1 because the immediate parent is a bullet_list
  // We want index 0 for the first level, so subtract 1
  return Math.max(0, depth - 1);
}
```

Then in `getMarkdownListMarker`, replace the bullet return:

```typescript
if (!listParent || listParent.type !== "ordered_list") {
  const depth = getBulletNestingDepth(parent);
  const marker = BULLET_MARKERS[Math.min(depth, BULLET_MARKERS.length - 1)];
  return {
    isOrdered: false,
    marker,
  };
}
```

Full updated file:

```typescript
type MarkdownNode = {
  type?: string;
  index?: number;
  markup?: string;
  attributes?: {
    start?: number | string;
  };
  children?: MarkdownNode[];
};

const BULLET_MARKERS = ["•", "◦", "▪"] as const;
const DEFAULT_ORDERED_LIST_MARKUP = ".";

function toParentNodes(parent: unknown): MarkdownNode[] {
  if (Array.isArray(parent)) {
    return parent;
  }

  if (parent && typeof parent === "object") {
    return [parent as MarkdownNode];
  }

  return [];
}

function getNearestListParent(parent: unknown): MarkdownNode | undefined {
  return toParentNodes(parent).find(
    (ancestor) => ancestor?.type === "ordered_list" || ancestor?.type === "bullet_list",
  );
}

function getBulletNestingDepth(parent: unknown): number {
  const ancestors = toParentNodes(parent);
  let depth = 0;
  for (const ancestor of ancestors) {
    if (ancestor?.type === "bullet_list") {
      depth++;
    }
  }
  return Math.max(0, depth - 1);
}

function getOrderedListItemIndex(node: MarkdownNode, listParent: MarkdownNode): number {
  if (typeof node.index === "number" && Number.isFinite(node.index) && node.index >= 0) {
    return node.index;
  }

  if (Array.isArray(listParent.children)) {
    const fallbackIndex = listParent.children.indexOf(node);
    if (fallbackIndex >= 0) {
      return fallbackIndex;
    }
  }

  return 0;
}

function parseOrderedListStart(node: MarkdownNode): number {
  const rawStart = node.attributes?.start;
  if (typeof rawStart === "number" && Number.isFinite(rawStart)) {
    return rawStart;
  }

  if (typeof rawStart === "string") {
    const parsed = Number.parseInt(rawStart, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 1;
}

export function getMarkdownListMarker(
  node: MarkdownNode,
  parent: unknown,
): {
  isOrdered: boolean;
  marker: string;
} {
  const listParent = getNearestListParent(parent);
  if (!listParent || listParent.type !== "ordered_list") {
    const depth = getBulletNestingDepth(parent);
    const marker = BULLET_MARKERS[Math.min(depth, BULLET_MARKERS.length - 1)];
    return {
      isOrdered: false,
      marker,
    };
  }

  const orderedIndex = getOrderedListItemIndex(node, listParent);
  const orderedStart = parseOrderedListStart(listParent);
  const orderedMarkup =
    typeof node.markup === "string" && node.markup.length > 0
      ? node.markup
      : DEFAULT_ORDERED_LIST_MARKUP;

  return {
    isOrdered: true,
    marker: `${orderedStart + orderedIndex}${orderedMarkup}`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app && npx vitest run src/utils/markdown-list.test.ts --bail=1`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/utils/markdown-list.ts packages/app/src/utils/markdown-list.test.ts
git commit -m "feat(markdown): use distinct bullet markers per nesting level (•/◦/▪)"
```

---

### Task 5: Blockquote Nesting Depth Styling

Nested blockquotes currently look identical to top-level ones. Add a custom render rule that varies the left border color by nesting depth and removes background color on nested blockquotes to prevent stacking opaque backgrounds.

**Files:**
- Modify: `packages/app/src/components/message.tsx` (add `blockquote` render rule)
- Modify: `packages/app/src/styles/markdown-styles.ts` (adjust blockquote base style)

- [ ] **Step 1: Define the nesting color palette**

The blockquote render rule needs a small palette. Use existing theme colors. In `message.tsx`, add a helper before the component (near the other helpers at module level):

```typescript
const BLOCKQUOTE_BORDER_COLORS = [
  "primary",     // depth 0 — the existing accent
  "accent",      // depth 1
  "foregroundMuted", // depth 2+
] as const;

function getBlockquoteDepth(parent: any): number {
  if (!Array.isArray(parent)) return 0;
  let depth = 0;
  for (const ancestor of parent) {
    if (ancestor?.type === "blockquote") {
      depth++;
    }
  }
  return depth;
}
```

- [ ] **Step 2: Add blockquote render rule**

In the `markdownRules` useMemo block in `message.tsx`, add:

```typescript
blockquote: (node: any, children: ReactNode[], parent: any, styles: any) => {
  const depth = getBlockquoteDepth(parent);
  const colorKey = BLOCKQUOTE_BORDER_COLORS[
    Math.min(depth, BLOCKQUOTE_BORDER_COLORS.length - 1)
  ];
  const borderColor = theme.colors[colorKey];
  const isNested = depth > 0;

  return (
    <View
      key={node.key}
      style={[
        styles.blockquote,
        {
          borderLeftColor: borderColor,
          // Nested blockquotes: no bg to avoid stacking opacity
          ...(isNested && {
            backgroundColor: "transparent",
            marginVertical: theme.spacing[1],
            paddingVertical: theme.spacing[2],
          }),
        },
      ]}
    >
      {children}
    </View>
  );
},
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/message.tsx
git commit -m "feat(markdown): style nested blockquotes with depth-varied border colors"
```

---

### Task 6: Table Zebra Stripes + Horizontal Scroll

Tables lack alternating row colors and overflow handling. Add zebra striping via a custom `tr` render rule, and wrap tables in a horizontal `ScrollView`.

**Files:**
- Modify: `packages/app/src/components/message.tsx` (add `table`, `tr` render rules)
- Modify: `packages/app/src/styles/markdown-styles.ts` (minor style update)

- [ ] **Step 1: Add ScrollView import**

In `message.tsx`, add `ScrollView` to the `react-native` import:

```typescript
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  ScrollView,
  type LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from "react-native";
```

- [ ] **Step 2: Add table and tr render rules**

In the `markdownRules` useMemo block in `message.tsx`, add:

```typescript
table: (node: any, children: ReactNode[], _parent: any, styles: any) => (
  <ScrollView
    key={node.key}
    horizontal
    showsHorizontalScrollIndicator={true}
    style={styles.table}
  >
    <View style={{ minWidth: "100%" }}>{children}</View>
  </ScrollView>
),
tr: (node: any, children: ReactNode[], parent: any, styles: any) => {
  // Determine row index within tbody for zebra striping
  const isEvenRow = typeof node.index === "number" && node.index % 2 === 1;
  const isInThead = Array.isArray(parent)
    ? parent.some((ancestor: any) => ancestor?.type === "thead")
    : false;

  return (
    <View
      key={node.key}
      style={[
        styles.tr,
        !isInThead && isEvenRow && { backgroundColor: theme.colors.surface1 },
      ]}
    >
      {children}
    </View>
  );
},
```

- [ ] **Step 3: Update table style to support ScrollView**

In `markdown-styles.ts`, update the `table` style to add `overflow: "hidden"` for proper border radius clipping:

```typescript
table: {
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.borderRadius.md,
  marginVertical: theme.spacing[3],
  overflow: "hidden" as const,
},
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/message.tsx packages/app/src/styles/markdown-styles.ts
git commit -m "feat(markdown): add table zebra stripes and horizontal scroll"
```

---

### Task 7: Contextual Paragraph Spacing

Currently every block separator gets the same `marginBottom: spacing[3]`. Adjust spacing based on what follows what — headings need more breathing room above, consecutive paragraphs need less.

This is achieved by adjusting the existing styles (not render rules), since `react-native-markdown-display` applies style keys per node type.

**Files:**
- Modify: `packages/app/src/styles/markdown-styles.ts`
- Modify: `packages/app/src/styles/markdown-styles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("headings have proportional top margins for visual rhythm", () => {
  const styles = createMarkdownStyles(darkTheme);
  // h1/h2 have the most top space, h3/h4 moderate, h5/h6 least
  expect(styles.heading1.marginTop).toBeGreaterThan(styles.heading3.marginTop);
  expect(styles.heading3.marginTop).toBeGreaterThan(styles.heading5.marginTop);
  // blockquote and lists have less top margin than headings
  expect(styles.blockquote.marginVertical).toBeLessThan(styles.heading1.marginTop);
});

it("blockquote has italic text style", () => {
  const styles = createMarkdownStyles(darkTheme);
  expect(styles.blockquote.fontStyle).toBe("italic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: FAIL — the margin relationships may already hold, but `blockquote.fontStyle` is not set.

- [ ] **Step 3: Refine spacing values**

In `markdown-styles.ts`, adjust these styles:

```typescript
heading1: {
  ...webSelectableTextStyle,
  fontSize: theme.fontSize["3xl"],
  fontWeight: theme.fontWeight.bold,
  color: theme.colors.foreground,
  marginTop: theme.spacing[8],    // was spacing[6] → more breathing room
  marginBottom: theme.spacing[3],
  lineHeight: 32,
  borderBottomWidth: 1,
  borderBottomColor: theme.colors.border,
  paddingBottom: theme.spacing[2],
},

heading2: {
  ...webSelectableTextStyle,
  fontSize: theme.fontSize["2xl"],
  fontWeight: theme.fontWeight.bold,
  color: theme.colors.foreground,
  marginTop: theme.spacing[8],    // was spacing[6] → match h1 top space
  marginBottom: theme.spacing[3],
  lineHeight: 28,
  borderBottomWidth: 1,
  borderBottomColor: theme.colors.border,
  paddingBottom: theme.spacing[2],
},

// h3, h4 stay at spacing[4] — already correct

heading5: {
  ...webSelectableTextStyle,
  fontSize: theme.fontSize.base,
  fontWeight: theme.fontWeight.semibold,
  color: theme.colors.foreground,
  marginTop: theme.spacing[3],    // already spacing[3] — stays
  marginBottom: theme.spacing[1],
  lineHeight: 22,
},

blockquote: {
  backgroundColor: theme.colors.surface2,
  borderLeftWidth: 4,
  borderLeftColor: theme.colors.primary,
  paddingHorizontal: theme.spacing[4],
  paddingVertical: theme.spacing[3],
  marginVertical: theme.spacing[4],   // was spacing[3] → slightly more
  borderRadius: theme.borderRadius.md,
  fontStyle: "italic" as const,       // new — quotes look better in italic
},
```

- [ ] **Step 4: Run tests**

Run: `cd packages/app && npx vitest run src/styles/markdown-styles.test.ts --bail=1`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/styles/markdown-styles.ts packages/app/src/styles/markdown-styles.test.ts
git commit -m "style(markdown): improve vertical rhythm with proportional heading spacing"
```

---

### Task 8: GFM Task List Checkboxes

Render `- [x]` and `- [ ]` as visual checkboxes. Uses the `markdown-it-task-lists` plugin for parsing and a custom render rule for display.

**Files:**
- Modify: `packages/app/package.json` (add dependency)
- Modify: `packages/app/src/components/message.tsx` (parser plugin + render rule)

- [ ] **Step 1: Install the plugin**

```bash
cd packages/app && npm install markdown-it-task-lists
```

- [ ] **Step 2: Add types (if needed)**

Check if `@types/markdown-it-task-lists` exists. If not, add a declaration in the `message.tsx` file or a local `.d.ts`:

Create `packages/app/src/types/markdown-it-task-lists.d.ts`:

```typescript
declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  export default function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;
}
```

- [ ] **Step 3: Register the plugin on the parser**

In `message.tsx`, add the import:

```typescript
import taskLists from "markdown-it-task-lists";
```

Then in the `markdownParser` useMemo, chain the plugin:

```typescript
const markdownParser = useMemo(() => {
  const parser = MarkdownIt({ typographer: true, linkify: true });
  parser.use(taskLists, { enabled: true });
  const defaultValidateLink = parser.validateLink.bind(parser);
  parser.validateLink = (url: string) => {
    if (url.trim().toLowerCase().startsWith("file://")) {
      return true;
    }
    return defaultValidateLink(url);
  };
  return parser;
}, []);
```

- [ ] **Step 4: Add task list item styles to markdown-styles.ts**

```typescript
// Add after the list_item styles:
task_list_item: {
  marginBottom: theme.spacing[1],
  flexDirection: "row" as const,
  alignItems: "flex-start" as const,
  flexShrink: 1,
},

task_list_item_checkbox: {
  width: 18,
  height: 18,
  borderRadius: theme.borderRadius.base,
  borderWidth: 2,
  borderColor: theme.colors.foregroundMuted,
  marginRight: theme.spacing[2],
  marginTop: 2,
  alignItems: "center" as const,
  justifyContent: "center" as const,
},

task_list_item_checkbox_checked: {
  backgroundColor: theme.colors.primary,
  borderColor: theme.colors.primary,
},
```

- [ ] **Step 5: Handle task list rendering in the list_item rule**

The `markdown-it-task-lists` plugin adds `class="task-list-item"` and an `<input type="checkbox">` to the token. In `react-native-markdown-display`, this manifests as:
- The list item node gets `type: "list_item"` with children that may contain a checkbox token.
- We detect task list items by checking if the first child content starts with a checkbox pattern.

Update the `list_item` render rule in `message.tsx`. The plugin modifies the token stream so that task list items have an `attrGet("class")` of `"task-list-item"`. In the AST, the list item's first child paragraph contains the checkbox as the first inline child.

A practical approach: detect task items by checking `node.attributes?.class` or the rendered content for the checkbox unicode. The simplest reliable approach is to check if the node markup contains `[x]` or `[ ]` patterns:

Replace the existing `list_item` rule with:

```typescript
list_item: (node: any, children: ReactNode[], parent: any, styles: any) => {
  // Detect task list items (from markdown-it-task-lists plugin)
  const isTaskItem =
    node.attributes?.class === "task-list-item" ||
    (typeof node.sourceInfo === "string" &&
      /^\[[ x]\]/.test(node.sourceInfo));

  if (isTaskItem) {
    // Determine checked state from first child content
    const firstChildContent = getFirstTextContent(node);
    const isChecked = firstChildContent?.includes("[x]") ||
      node.attributes?.checked === true ||
      node.attributes?.checked === "true";

    return (
      <View key={node.key} style={styles.list_item}>
        <View
          style={[
            styles.task_list_item_checkbox,
            isChecked && styles.task_list_item_checkbox_checked,
          ]}
        >
          {isChecked && (
            <Check size={12} color={theme.colors.background} strokeWidth={3} />
          )}
        </View>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>{children}</View>
      </View>
    );
  }

  // Normal list item
  const { isOrdered, marker } = getMarkdownListMarker(node, parent);
  const iconStyle = isOrdered ? styles.ordered_list_icon : styles.bullet_list_icon;
  const contentStyle = isOrdered ? styles.ordered_list_content : styles.bullet_list_content;

  return (
    <View key={node.key} style={styles.list_item}>
      <Text style={iconStyle}>{marker}</Text>
      <View style={[contentStyle, { flex: 1, flexShrink: 1, minWidth: 0 }]}>{children}</View>
    </View>
  );
},
```

Add this helper function at module level (near the other helpers):

```typescript
function getFirstTextContent(node: any): string | null {
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = getFirstTextContent(child);
      if (result) return result;
    }
  }
  return null;
}
```

- [ ] **Step 6: Test manually with markdown containing task lists**

Verify in the app that this markdown renders correctly:
```
- [x] Completed task
- [ ] Pending task
- Regular list item
```

The checked item should show a filled checkbox with a check mark, the unchecked item should show an empty bordered box, and the regular item should show a normal bullet.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`

**Important note:** The `markdown-it-task-lists` plugin behavior with `react-native-markdown-display` may vary. The plugin modifies the token stream, but how `react-native-markdown-display` translates those tokens to AST nodes determines what's available in render rules. If `node.attributes.class` isn't populated, the fallback detection via content pattern matching should work. Test both paths and keep whichever works. If neither works cleanly, the alternative is to skip the plugin and detect `- [x]`/`- [ ]` patterns directly in the raw markdown before it reaches the parser, replacing them with custom tokens.

- [ ] **Step 8: Commit**

```bash
git add packages/app/package.json packages/app/src/components/message.tsx packages/app/src/styles/markdown-styles.ts packages/app/src/types/markdown-it-task-lists.d.ts
git commit -m "feat(markdown): render GFM task list checkboxes"
```

---

### Task 9: Collapsible `<details>/<summary>` Blocks

AI agents frequently use `<details>` blocks for long outputs. Currently they render as raw text. Enable HTML parsing for these specific tags and render them as collapsible sections.

**Files:**
- Create: `packages/app/src/components/markdown-collapsible.tsx`
- Modify: `packages/app/src/components/message.tsx` (add `html_block` render rule)

- [ ] **Step 1: Create the MarkdownCollapsible component**

Create `packages/app/src/components/markdown-collapsible.tsx`:

```typescript
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
```

- [ ] **Step 2: Parse `<details>` blocks from HTML**

The approach: enable `html: true` in MarkdownIt and add an `html_block` render rule that detects `<details>` tags. This is simpler and more reliable than a MarkdownIt plugin.

In `message.tsx`, update the parser:

```typescript
const markdownParser = useMemo(() => {
  const parser = MarkdownIt({ typographer: true, linkify: true, html: true });
  // ... rest of parser config
  return parser;
}, []);
```

- [ ] **Step 3: Add the html_block render rule**

Add the import:

```typescript
import { MarkdownCollapsible } from "./markdown-collapsible";
```

Add a helper to parse details HTML:

```typescript
function parseDetailsBlock(html: string): { summary: string; content: string } | null {
  const detailsMatch = html.match(
    /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/i,
  );
  if (!detailsMatch) return null;
  return {
    summary: detailsMatch[1].trim(),
    content: detailsMatch[2].trim(),
  };
}
```

Add the render rule in `markdownRules`:

```typescript
html_block: (node: any, _children: ReactNode[], _parent: any, styles: any) => {
  const content = node.content ?? "";
  const details = parseDetailsBlock(content);
  if (details) {
    return (
      <MarkdownCollapsible key={node.key} summary={details.summary} theme={theme}>
        <MemoizedMarkdownBlock
          text={details.content}
          styles={markdownStyles}
          rules={markdownRules}
          parser={markdownParser}
          onLinkPress={handleLinkPress}
        />
      </MarkdownCollapsible>
    );
  }

  // For other HTML blocks, render as plain text (safe default)
  return (
    <Text key={node.key} style={styles.text}>
      {content}
    </Text>
  );
},
```

- [ ] **Step 4: Test manually**

Verify this markdown renders as a collapsible:
```html
<details>
<summary>Click to expand</summary>

This is the hidden content with **markdown** support.

- Item 1
- Item 2
</details>
```

Should show a clickable header "Click to expand" with a chevron, and tapping it reveals the markdown content.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/markdown-collapsible.tsx packages/app/src/components/message.tsx
git commit -m "feat(markdown): render <details>/<summary> as collapsible sections"
```

---

### Task 10: Mirror Changes to plan-card.tsx

The `plan-card.tsx` component has its own `createPlanMarkdownRules()` function. Mirror the relevant visual improvements there: multi-level bullets (automatic via shared `getMarkdownListMarker`), and blockquote/hr rules if plan cards render those elements.

**Files:**
- Modify: `packages/app/src/components/plan-card.tsx`

- [ ] **Step 1: Review plan-card's current rules**

The plan-card already calls `getMarkdownListMarker()` in its `list_item` rule, so multi-level bullets work automatically after Task 4.

Check if plan-card renders blockquotes, tables, or hr. If not, skip those rules.

- [ ] **Step 2: Add task list checkbox support if plan cards contain task lists**

Plan cards display implementation plans which commonly use `- [ ]` / `- [x]` syntax. Add the task list detection logic to `createPlanMarkdownRules()` following the same pattern as Task 8.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/plan-card.tsx
git commit -m "feat(markdown): mirror visual improvements in plan-card render rules"
```

---

### Task 11: Update Compact Markdown Styles

The `createCompactMarkdownStyles()` function overrides some base styles for smaller UI. Ensure the new styles (task list checkbox, blockquote italic, hr, inline code border) also have compact variants.

**Files:**
- Modify: `packages/app/src/styles/markdown-styles.ts`

- [ ] **Step 1: Add compact overrides**

In `createCompactMarkdownStyles`, add:

```typescript
return {
  ...baseStyles,

  // ... existing overrides ...

  // Task list checkbox: slightly smaller
  task_list_item_checkbox: {
    ...baseStyles.task_list_item_checkbox,
    width: 15,
    height: 15,
  },

  // Inline code: match compact font size
  code_inline: {
    ...baseStyles.code_inline,
    fontSize: theme.fontSize.xs,
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/styles/markdown-styles.ts
git commit -m "style(markdown): add compact variants for new markdown styles"
```

---

### Task 12: Format and Final Verification

- [ ] **Step 1: Run formatter**

```bash
npm run format
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Run affected tests**

```bash
cd packages/app && npx vitest run src/styles/markdown-styles.test.ts src/utils/markdown-list.test.ts --bail=1
```

- [ ] **Step 4: Visual smoke test**

Open the app and verify with a message containing all improved elements:
- **Bold text** — visually distinct from normal
- `inline code` — clear background and border
- Nested lists with `•` / `◦` / `▪` markers
- Nested blockquotes with different border colors
- A table with zebra stripes that scrolls horizontally
- A horizontal rule showing `···` dots
- Task list with `- [x]` and `- [ ]`
- A `<details>` block that expands/collapses
- Headings with proper vertical rhythm

- [ ] **Step 5: Final commit if formatter changed anything**

```bash
git add -u
git commit -m "style: format after markdown typography polish"
```
