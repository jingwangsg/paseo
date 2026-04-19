import { describe, expect, test } from "vitest";
import { ExecutionHostSchema, defaultExecutionHost } from "./messages.js";

describe("ExecutionHostSchema", () => {
  test("parses local host", () => {
    expect(ExecutionHostSchema.parse({ kind: "local" })).toEqual({ kind: "local" });
  });

  test("rejects unknown kind", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "docker", image: "x" })).toThrow();
  });

  test("parses ssh host", () => {
    const result = ExecutionHostSchema.parse({
      kind: "ssh",
      hostAlias: "devbox",
    });
    expect(result).toEqual({
      kind: "ssh",
      hostAlias: "devbox",
    });
  });

  test("rejects ssh host missing hostAlias", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "ssh" })).toThrow();
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
