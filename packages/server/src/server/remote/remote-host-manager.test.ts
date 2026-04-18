import { describe, expect, test, vi, beforeEach } from "vitest";
import { RemoteHostManager } from "./remote-host-manager.js";
import type { RemoteHostRegistry } from "./remote-host-registry.js";
import type { RemoteHostRecord } from "./types.js";
import pino from "pino";

const SILENT_LOGGER = pino({ level: "silent" });

function stubRegistry(hosts: RemoteHostRecord[] = []): RemoteHostRegistry {
  const map = new Map(hosts.map((h) => [h.hostAlias, h]));
  return {
    initialize: vi.fn(),
    list: vi.fn(async () => Array.from(map.values())),
    get: vi.fn(async (alias: string) => map.get(alias) ?? null),
    upsert: vi.fn(async (record: RemoteHostRecord) => {
      map.set(record.hostAlias, record);
    }),
    remove: vi.fn(async (alias: string) => {
      map.delete(alias);
    }),
  };
}

describe("RemoteHostManager", () => {
  test("addHost registers and sets status to registered", async () => {
    const registry = stubRegistry();
    const manager = new RemoteHostManager({
      registry,
      logger: SILENT_LOGGER,
      localVersion: "1.0.0",
    });

    await manager.addHost({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
    });

    const statuses = manager.listStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].hostAlias).toBe("devbox");
    expect(statuses[0].status).toBe("registered");
  });

  test("removeHost clears state and registry", async () => {
    const registry = stubRegistry([
      { hostAlias: "devbox", hostname: "192.168.1.100", addedAt: "2026-04-18T00:00:00.000Z" },
    ]);
    const manager = new RemoteHostManager({
      registry,
      logger: SILENT_LOGGER,
      localVersion: "1.0.0",
    });
    await manager.initialize();

    await manager.removeHost("devbox");

    expect(manager.listStatuses()).toHaveLength(0);
    expect(registry.remove).toHaveBeenCalledWith("devbox");
  });

  test("getHostState returns null for unknown host", () => {
    const registry = stubRegistry();
    const manager = new RemoteHostManager({
      registry,
      logger: SILENT_LOGGER,
      localVersion: "1.0.0",
    });

    expect(manager.getHostState("unknown")).toBeNull();
  });

  test("initialize loads hosts from registry as registered", async () => {
    const registry = stubRegistry([
      { hostAlias: "devbox", hostname: "192.168.1.100", addedAt: "2026-04-18T00:00:00.000Z" },
      {
        hostAlias: "gpu",
        hostname: "10.0.0.5",
        user: "admin",
        addedAt: "2026-04-18T00:00:00.000Z",
      },
    ]);
    const manager = new RemoteHostManager({
      registry,
      logger: SILENT_LOGGER,
      localVersion: "1.0.0",
    });
    await manager.initialize();

    const statuses = manager.listStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses.every((s) => s.status === "registered")).toBe(true);
  });
});
