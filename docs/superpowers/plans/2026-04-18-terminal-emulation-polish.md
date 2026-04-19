# Terminal Emulation Polish — Low-Hanging Fruit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve terminal visual/interaction quality with four client-side-only changes: frame-budgeted output writing, flicker filter for Ink/TUI redraws, removal of 250ms fit polling, and touch scroll momentum.

**Architecture:** All changes are confined to a single file — `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts`. No protocol changes, no server changes, no message schema changes. The flicker filter is implemented as a lightweight buffer layer inside the runtime's `write()` path. Touch scroll momentum adds a rAF decay loop after touchend. Frame budgeting splits large writes across animation frames.

**Tech Stack:** TypeScript, xterm.js (`@xterm/xterm`), `requestAnimationFrame`, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts` | Modify | All four changes live here |
| `packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts` | Modify | Tests for frame budget, flicker filter, fit interval removal |

---

### Task 1: Frame-Budgeted Output Writing

Large terminal output (e.g. `cat` a big file, agent dumps a long diff) currently blocks the UI because `processOutputQueue` passes the entire text to `terminal.write()` in one call. This task splits oversized writes into 64KB chunks dispatched one per animation frame.

**Files:**
- Modify: `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts:60-67,573-638`
- Test: `packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts`

- [ ] **Step 1: Write the failing test — large write is chunked**

Add to `terminal-emulator-runtime.test.ts`:

```typescript
it("splits large writes into frame-budgeted chunks", () => {
  const { runtime, writeCallbacks, writeTexts } = createRuntimeWithTerminal();
  const onCommitted = vi.fn();

  // 150KB string — exceeds the 64KB frame budget
  const largeText = "x".repeat(150 * 1024);
  runtime.write({ text: largeText, onCommitted });

  // First chunk should be dispatched immediately (64KB)
  expect(writeTexts.length).toBe(1);
  expect(writeTexts[0]!.length).toBe(64 * 1024);
  expect(onCommitted).not.toHaveBeenCalled();

  // Simulate xterm completing the first chunk write
  writeCallbacks[0]?.();

  // Second chunk dispatched after first completes (another 64KB)
  expect(writeTexts.length).toBe(2);
  expect(writeTexts[1]!.length).toBe(64 * 1024);

  // Complete second chunk
  writeCallbacks[1]?.();

  // Third chunk: remaining 22KB
  expect(writeTexts.length).toBe(3);
  expect(writeTexts[2]!.length).toBe(150 * 1024 - 128 * 1024);

  // Complete third chunk — onCommitted fires
  writeCallbacks[2]?.();
  expect(onCommitted).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: FAIL — the current implementation writes the full 150KB in one `terminal.write()` call.

- [ ] **Step 3: Write the failing test — small write is NOT chunked**

Add to `terminal-emulator-runtime.test.ts`:

```typescript
it("does not chunk writes smaller than the frame budget", () => {
  const { runtime, writeCallbacks, writeTexts } = createRuntimeWithTerminal();
  const onCommitted = vi.fn();

  const smallText = "hello world";
  runtime.write({ text: smallText, onCommitted });

  expect(writeTexts).toEqual(["hello world"]);

  writeCallbacks[0]?.();
  expect(onCommitted).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run test to verify it fails (or passes — this is the existing behavior guard)**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: PASS (existing behavior already handles small writes correctly). This test guards against regressions.

- [ ] **Step 5: Implement frame-budgeted writing**

In `terminal-emulator-runtime.ts`, add a constant at the top of the file (near the other constants around line 80-82):

```typescript
const OUTPUT_FRAME_BUDGET_BYTES = 64 * 1024;
```

Then modify the write branch inside `processOutputQueue` (lines 626-637). Replace:

```typescript
    const text = operation.text;
    this.inFlightOutputOperationTimeout = setTimeout(() => {
      finalizeOperation(operation);
    }, OUTPUT_OPERATION_TIMEOUT_MS);

    try {
      terminal.write(text, () => {
        finalizeOperation(operation);
      });
    } catch {
      finalizeOperation(operation);
    }
```

With:

```typescript
    const text = operation.text;
    this.inFlightOutputOperationTimeout = setTimeout(() => {
      finalizeOperation(operation);
    }, OUTPUT_OPERATION_TIMEOUT_MS);

    if (text.length <= OUTPUT_FRAME_BUDGET_BYTES) {
      try {
        terminal.write(text, () => {
          finalizeOperation(operation);
        });
      } catch {
        finalizeOperation(operation);
      }
      return;
    }

    let offset = 0;
    const writeNextChunk = () => {
      if (this.inFlightOutputOperation !== operation || !this.terminal) {
        return;
      }
      const chunk = text.slice(offset, offset + OUTPUT_FRAME_BUDGET_BYTES);
      offset += OUTPUT_FRAME_BUDGET_BYTES;
      const isLastChunk = offset >= text.length;
      try {
        terminal.write(chunk, () => {
          if (isLastChunk) {
            finalizeOperation(operation);
          } else {
            writeNextChunk();
          }
        });
      } catch {
        finalizeOperation(operation);
      }
    };
    writeNextChunk();
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS

- [ ] **Step 7: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors

- [ ] **Step 8: Commit**

```bash
cd /Users/jingwang/WORKSPACE/paseo
git add packages/app/src/terminal/runtime/terminal-emulator-runtime.ts packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts
git commit -m "feat(terminal): frame-budget large writes at 64KB per chunk

Splits oversized terminal.write() calls into 64KB chunks that yield
between each chunk via xterm's write callback. Prevents UI freezes
when the terminal receives large output (e.g. cat a big file)."
```

---

### Task 2: Flicker Filter for Ink/TUI Redraws

Claude Code's Ink-based TUI sends screen-clear sequences (`\x1b[2J`, `\x1b[H\x1b[J`) followed by the new frame. Without buffering, xterm.js renders the clear and the new content in separate animation frames, causing a visible flash of empty terminal. This task adds a lightweight buffer that holds screen-clear output for up to 50ms, coalescing it with the subsequent data into a single write.

The filter is applied inside the runtime's `write()` method, before data enters the output operations queue. It is **not** applied to snapshots or clears (those use separate code paths).

**Files:**
- Modify: `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts:111-126,481-493,549-571`
- Test: `packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts`

- [ ] **Step 1: Write the failing test — screen-clear followed by content is coalesced**

Add to `terminal-emulator-runtime.test.ts`:

```typescript
it("coalesces screen-clear + subsequent write into a single terminal.write call", () => {
  vi.useFakeTimers();
  const { runtime, writeCallbacks, writeTexts } = createRuntimeWithTerminal();

  // Simulate Ink redraw: clear screen then write new content
  runtime.write({ text: "\x1b[2J" });
  runtime.write({ text: "new frame content" });

  // The flicker filter should hold the clear and coalesce with the next write
  expect(writeTexts).toEqual(["\x1b[2Jnew frame content"]);

  writeCallbacks[0]?.();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: FAIL — currently both writes are queued as separate operations.

- [ ] **Step 3: Write the failing test — orphaned screen-clear flushes after timeout**

```typescript
it("flushes a screen-clear after 50ms if no follow-up data arrives", () => {
  vi.useFakeTimers();
  const { runtime, writeTexts } = createRuntimeWithTerminal();

  runtime.write({ text: "\x1b[2J" });

  // Nothing written yet — held by flicker filter
  expect(writeTexts).toEqual([]);

  // After 50ms, flush the clear on its own
  vi.advanceTimersByTime(50);
  expect(writeTexts).toEqual(["\x1b[2J"]);

  vi.useRealTimers();
});
```

- [ ] **Step 4: Write the failing test — normal writes bypass the filter**

```typescript
it("does not delay writes that contain no screen-clear sequences", () => {
  const { runtime, writeTexts } = createRuntimeWithTerminal();

  runtime.write({ text: "hello world" });

  expect(writeTexts).toEqual(["hello world"]);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: The coalesce test and the orphan-flush test fail; the bypass test may pass (existing behavior).

- [ ] **Step 6: Implement the flicker filter**

In `terminal-emulator-runtime.ts`, add constants near the other constants (around line 82):

```typescript
const FLICKER_FILTER_DELAY_MS = 50;
const SCREEN_CLEAR_PATTERN = /\x1b\[\d*J|\x1b\[H\x1b\[\d*J/;
```

Add private fields to the `TerminalEmulatorRuntime` class (after line 126):

```typescript
  private flickerBuffer: string | null = null;
  private flickerTimer: ReturnType<typeof setTimeout> | null = null;
```

Replace the `write()` method (lines 481-493) with:

```typescript
  write(input: { text: string; suppressInput?: boolean; onCommitted?: () => void }): void {
    if (input.text.length === 0) {
      input.onCommitted?.();
      return;
    }

    // Flicker filter: hold screen-clear output briefly to coalesce with subsequent data.
    if (this.flickerBuffer !== null) {
      // Follow-up data arrived while a clear was buffered — coalesce and flush.
      const coalesced = this.flickerBuffer + input.text;
      this.flickerBuffer = null;
      if (this.flickerTimer !== null) {
        clearTimeout(this.flickerTimer);
        this.flickerTimer = null;
      }
      this.enqueueWrite({ text: coalesced, suppressInput: input.suppressInput, onCommitted: input.onCommitted });
      return;
    }

    if (SCREEN_CLEAR_PATTERN.test(input.text)) {
      // Buffer the clear and wait for follow-up data.
      this.flickerBuffer = input.text;
      this.flickerTimer = setTimeout(() => {
        const buffered = this.flickerBuffer;
        this.flickerBuffer = null;
        this.flickerTimer = null;
        if (buffered !== null) {
          this.enqueueWrite({ text: buffered, suppressInput: input.suppressInput, onCommitted: input.onCommitted });
        }
      }, FLICKER_FILTER_DELAY_MS);
      return;
    }

    this.enqueueWrite({ text: input.text, suppressInput: input.suppressInput, onCommitted: input.onCommitted });
  }

  private enqueueWrite(input: { text: string; suppressInput?: boolean; onCommitted?: () => void }): void {
    this.outputOperations.push({
      type: "write",
      text: input.text,
      suppressInput: input.suppressInput ?? false,
      ...(input.onCommitted ? { onCommitted: input.onCommitted } : {}),
    });
    this.processOutputQueue();
  }
```

In the `unmount()` method (around line 549), add flicker buffer cleanup **before** the existing cleanup code:

```typescript
  unmount(): void {
    // Flush any pending flicker-buffered output.
    if (this.flickerTimer !== null) {
      clearTimeout(this.flickerTimer);
      this.flickerTimer = null;
    }
    if (this.flickerBuffer !== null) {
      // Drop the buffered clear — terminal is being torn down.
      this.flickerBuffer = null;
    }

    this.clearInFlightOutputTimeout();
    // ... rest of existing unmount code unchanged ...
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS

- [ ] **Step 8: Verify existing tests still pass**

The existing test "processes write and clear operations in strict order" calls `runtime.write({ text: "first" })` which does not contain a screen-clear, so it bypasses the filter. Confirm no regressions:

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS

- [ ] **Step 9: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors

- [ ] **Step 10: Commit**

```bash
cd /Users/jingwang/WORKSPACE/paseo
git add packages/app/src/terminal/runtime/terminal-emulator-runtime.ts packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts
git commit -m "feat(terminal): flicker filter buffers screen-clear sequences 50ms

Holds output containing screen-clear escape sequences (ESC[J variants)
for up to 50ms, coalescing them with the subsequent frame data into a
single terminal.write() call. Eliminates the visible empty-frame flash
when Ink-based TUIs (Claude Code, etc.) redraw."
```

---

### Task 3: Remove 250ms Fit Interval Polling

The runtime runs `setInterval(fitAndEmitResize, 250)` as a fallback for resize detection. This is redundant — `ResizeObserver`, `window.resize`, `visualViewport.resize`, `document.fonts.ready`, and `visibilitychange` already cover all real resize triggers. The polling wastes CPU and can cause unnecessary resize events.

**Files:**
- Modify: `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts:42-58,377-379,428-430,462-478`

- [ ] **Step 1: Remove the fit interval from mount()**

In `terminal-emulator-runtime.ts`, delete lines 377-379:

```typescript
    const fitInterval = window.setInterval(() => {
      fitAndEmitResize(false);
    }, 250);
```

- [ ] **Step 2: Remove the clearFitInterval disposable**

Remove from the `TerminalEmulatorRuntimeDisposables` type (around line 49):

```typescript
  clearFitInterval: () => void;
```

Remove from the disposables object (around lines 428-430):

```typescript
      clearFitInterval: () => {
        window.clearInterval(fitInterval);
      },
```

Remove from the cleanup function (around line 469):

```typescript
      disposables.clearFitInterval();
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS — no existing test depends on the interval.

- [ ] **Step 4: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /Users/jingwang/WORKSPACE/paseo
git add packages/app/src/terminal/runtime/terminal-emulator-runtime.ts
git commit -m "fix(terminal): remove 250ms fit interval polling

ResizeObserver, window.resize, visualViewport.resize, font loading,
and visibility events already cover all real resize triggers. The
interval wasted CPU and occasionally caused spurious resize events."
```

---

### Task 4: Touch Scroll Momentum

Touch scrolling currently stops abruptly on touchend. This task adds velocity tracking during touchmove and a requestAnimationFrame decay loop after touchend to provide inertial scrolling that matches native mobile feel.

**Files:**
- Modify: `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts:756-870`
- Test: `packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts`

- [ ] **Step 1: Write the failing test — momentum state is tracked**

This is hard to unit-test directly since it relies on touch events and rAF. Instead, we'll test the momentum helper as a pure function. Add a test:

```typescript
describe("touch scroll momentum", () => {
  it("decays velocity to zero over multiple frames", () => {
    // Simulate the momentum decay loop as a pure computation
    let velocity = 5.0; // px per ms
    const DECAY = 0.92;
    const STOP_THRESHOLD = 0.5;
    let frames = 0;

    while (Math.abs(velocity) > STOP_THRESHOLD && frames < 200) {
      velocity *= DECAY;
      frames += 1;
    }

    // Velocity should decay below threshold within a reasonable number of frames
    expect(Math.abs(velocity)).toBeLessThan(STOP_THRESHOLD);
    expect(frames).toBeGreaterThan(5);
    expect(frames).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (this is a behavioral specification)**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: PASS — this is a specification test for the decay constants we'll use.

- [ ] **Step 3: Implement touch scroll momentum**

In `terminal-emulator-runtime.ts`, add constants near the other constants (around line 80):

```typescript
const TOUCH_MOMENTUM_DECAY = 0.92;
const TOUCH_MOMENTUM_STOP_THRESHOLD_PX = 0.5;
const TOUCH_MOMENTUM_FRAME_MS = 16;
```

Replace the `setupTouchScrollHandlers` method (lines 756-870) with:

```typescript
  private setupTouchScrollHandlers(input: {
    root: HTMLDivElement;
    host: HTMLDivElement;
    terminal: Terminal;
  }): () => void {
    let touchScrollRemainderPx = 0;
    const measuredLineHeight =
      input.host.querySelector<HTMLElement>(".xterm-rows > div")?.getBoundingClientRect().height ??
      0;
    const touchScrollLineHeightPx =
      measuredLineHeight > 0 ? measuredLineHeight : DEFAULT_TOUCH_SCROLL_LINE_HEIGHT_PX;

    let velocityPxPerMs = 0;
    let lastTouchTimestamp = 0;
    let momentumRaf: number | null = null;

    const activeTouch = {
      identifier: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      mode: null as "vertical" | "horizontal" | null,
    };

    const cancelMomentum = () => {
      if (momentumRaf !== null) {
        cancelAnimationFrame(momentumRaf);
        momentumRaf = null;
      }
      velocityPxPerMs = 0;
    };

    const applyScrollDelta = (deltaPx: number) => {
      touchScrollRemainderPx += deltaPx;
      const lineDelta = Math.trunc(touchScrollRemainderPx / touchScrollLineHeightPx);
      if (lineDelta !== 0) {
        input.terminal.scrollLines(-lineDelta);
        touchScrollRemainderPx -= lineDelta * touchScrollLineHeightPx;
      }
    };

    const startMomentum = () => {
      if (Math.abs(velocityPxPerMs) < TOUCH_MOMENTUM_STOP_THRESHOLD_PX / TOUCH_MOMENTUM_FRAME_MS) {
        velocityPxPerMs = 0;
        return;
      }

      const step = () => {
        velocityPxPerMs *= TOUCH_MOMENTUM_DECAY;
        if (Math.abs(velocityPxPerMs) < TOUCH_MOMENTUM_STOP_THRESHOLD_PX / TOUCH_MOMENTUM_FRAME_MS) {
          momentumRaf = null;
          velocityPxPerMs = 0;
          return;
        }
        applyScrollDelta(velocityPxPerMs * TOUCH_MOMENTUM_FRAME_MS);
        momentumRaf = requestAnimationFrame(step);
      };
      momentumRaf = requestAnimationFrame(step);
    };

    const touchStartHandler = (event: TouchEvent) => {
      cancelMomentum();

      if (event.touches.length !== 1) {
        touchScrollRemainderPx = 0;
        activeTouch.identifier = -1;
        activeTouch.mode = null;
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        touchScrollRemainderPx = 0;
        activeTouch.identifier = -1;
        activeTouch.mode = null;
        return;
      }

      activeTouch.identifier = touch.identifier;
      activeTouch.startX = touch.clientX;
      activeTouch.startY = touch.clientY;
      activeTouch.lastX = touch.clientX;
      activeTouch.lastY = touch.clientY;
      activeTouch.mode = null;
      touchScrollRemainderPx = 0;
      lastTouchTimestamp = performance.now();
    };

    const touchMoveHandler = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === activeTouch.identifier,
      );
      if (!touch) {
        return;
      }

      const totalDeltaX = touch.clientX - activeTouch.startX;
      const totalDeltaY = touch.clientY - activeTouch.startY;
      if (activeTouch.mode === null) {
        const absX = Math.abs(totalDeltaX);
        const absY = Math.abs(totalDeltaY);
        if (absX > 8 || absY > 8) {
          activeTouch.mode = absY >= absX ? "vertical" : "horizontal";
        }
      }

      const deltaY = touch.clientY - activeTouch.lastY;
      activeTouch.lastX = touch.clientX;
      activeTouch.lastY = touch.clientY;

      if (activeTouch.mode !== "vertical") {
        return;
      }

      const now = performance.now();
      const elapsed = Math.max(1, now - lastTouchTimestamp);
      velocityPxPerMs = deltaY / elapsed;
      lastTouchTimestamp = now;

      applyScrollDelta(deltaY);

      event.preventDefault();
    };

    const touchEndHandler = (event: TouchEvent) => {
      const activeTouchEnded = Array.from(event.changedTouches).some(
        (touch) => touch.identifier === activeTouch.identifier,
      );
      if (activeTouchEnded || event.touches.length === 0) {
        activeTouch.identifier = -1;
        activeTouch.mode = null;
        startMomentum();
      }
    };

    const touchCancelHandler = () => {
      cancelMomentum();
      touchScrollRemainderPx = 0;
      activeTouch.identifier = -1;
      activeTouch.mode = null;
    };

    input.root.addEventListener("touchstart", touchStartHandler, { passive: true });
    input.root.addEventListener("touchmove", touchMoveHandler, { passive: false });
    input.root.addEventListener("touchend", touchEndHandler, { passive: true });
    input.root.addEventListener("touchcancel", touchCancelHandler, { passive: true });

    return () => {
      cancelMomentum();
      input.root.removeEventListener("touchstart", touchStartHandler);
      input.root.removeEventListener("touchmove", touchMoveHandler);
      input.root.removeEventListener("touchend", touchEndHandler);
      input.root.removeEventListener("touchcancel", touchCancelHandler);
    };
  }
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS

- [ ] **Step 5: Run typecheck**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd /Users/jingwang/WORKSPACE/paseo
git add packages/app/src/terminal/runtime/terminal-emulator-runtime.ts packages/app/src/terminal/runtime/terminal-emulator-runtime.test.ts
git commit -m "feat(terminal): add touch scroll momentum with velocity decay

Tracks swipe velocity during touchmove and applies inertial scrolling
after touchend using a rAF loop with 0.92 decay factor. Touch scrolling
now matches native mobile feel instead of stopping abruptly on lift."
```

---

### Task 5: Run Format and Final Verification

- [ ] **Step 1: Run formatter**

Run: `cd /Users/jingwang/WORKSPACE/paseo && npm run format`

- [ ] **Step 2: Run typecheck for the whole repo**

Run: `cd /Users/jingwang/WORKSPACE/paseo && npm run typecheck 2>&1 | head -40`

Expected: No errors

- [ ] **Step 3: Run only the changed test file**

Run: `cd packages/app && npx vitest run src/terminal/runtime/terminal-emulator-runtime.test.ts --bail=1 2>&1 | head -40`

Expected: ALL PASS

- [ ] **Step 4: Commit formatting if needed**

```bash
cd /Users/jingwang/WORKSPACE/paseo
git add -u
git diff --cached --stat
# Only commit if there are formatting changes
git commit -m "style: format terminal emulator runtime"
```
