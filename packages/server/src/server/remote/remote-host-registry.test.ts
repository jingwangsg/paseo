import { describe, expect, test, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import pino from "pino";
import { RemoteHostRegistry } from "./remote-host-registry.js";

const SILENT_LOGGER = pino({ level: "silent" });

describe("RemoteHostRegistry", () => {
  let dir: string;
  let registry: RemoteHostRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-hosts-"));
    registry = new RemoteHostRegistry(path.join(dir, "hosts.json"), SILENT_LOGGER);
    await registry.initialize();
  });

  test("starts empty", async () => {
    const hosts = await registry.list();
    expect(hosts).toEqual([]);
  });

  test("add and get a host", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      user: "jing",
      addedAt: "2026-04-18T00:00:00.000Z",
    });
    const host = await registry.get("devbox");
    expect(host?.hostAlias).toBe("devbox");
    expect(host?.hostname).toBe("192.168.1.100");
    expect(host?.user).toBe("jing");
  });

  test("remove a host", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      addedAt: "2026-04-18T00:00:00.000Z",
    });
    await registry.remove("devbox");
    const host = await registry.get("devbox");
    expect(host).toBeNull();
  });

  test("persists across reloads", async () => {
    await registry.upsert({
      hostAlias: "devbox",
      hostname: "192.168.1.100",
      addedAt: "2026-04-18T00:00:00.000Z",
    });

    const registry2 = new RemoteHostRegistry(path.join(dir, "hosts.json"), SILENT_LOGGER);
    await registry2.initialize();
    const host = await registry2.get("devbox");
    expect(host?.hostAlias).toBe("devbox");
  });
});
