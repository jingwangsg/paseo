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
      hostname: "192.168.1.100",
    });
    expect(result).toEqual({
      kind: "ssh",
      hostAlias: "devbox",
      hostname: "192.168.1.100",
    });
  });

  test("parses ssh host with all optional fields", () => {
    const result = ExecutionHostSchema.parse({
      kind: "ssh",
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      user: "jing",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
    });
    expect(result).toEqual({
      kind: "ssh",
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      user: "jing",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
    });
  });

  test("rejects ssh host missing hostname", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "ssh", hostAlias: "devbox" })).toThrow();
  });

  test("rejects ssh host missing hostAlias", () => {
    expect(() => ExecutionHostSchema.parse({ kind: "ssh", hostname: "192.168.1.100" })).toThrow();
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
