import { describe, expect, test } from "vitest";
import { ExecutionHostSchema, defaultExecutionHost } from "./messages.js";

describe("ExecutionHostSchema", () => {
  test("parses local host", () => {
    expect(ExecutionHostSchema.parse({ kind: "local" })).toEqual({ kind: "local" });
  });

  test("rejects unknown kind", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "ssh", host: "x" })).toThrow();
  });

  test("rejects missing kind", () => {
    expect(() => ExecutionHostSchema.parse({})).toThrow();
  });

  test("defaultExecutionHost returns a fresh local host", () => {
    const a = defaultExecutionHost();
    const b = defaultExecutionHost();
    expect(a).toEqual({ kind: "local" });
    expect(a).not.toBe(b);
  });
});
