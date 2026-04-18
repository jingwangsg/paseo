import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { z } from "zod";
import { RemoteHostRecordSchema, type RemoteHostRecord } from "./types.js";

export class RemoteHostRegistry {
  private readonly filePath: string;
  private readonly logger: Logger;
  private loaded = false;
  private readonly cache = new Map<string, RemoteHostRecord>();
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string, logger: Logger) {
    this.filePath = filePath;
    this.logger = logger.child({ module: "remote-host-registry" });
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  async list(): Promise<RemoteHostRecord[]> {
    await this.load();
    return Array.from(this.cache.values());
  }

  async get(hostAlias: string): Promise<RemoteHostRecord | null> {
    await this.load();
    return this.cache.get(hostAlias) ?? null;
  }

  async upsert(record: RemoteHostRecord): Promise<void> {
    await this.load();
    const parsed = RemoteHostRecordSchema.parse(record);
    this.cache.set(parsed.hostAlias, parsed);
    await this.enqueuePersist();
  }

  async remove(hostAlias: string): Promise<void> {
    await this.load();
    if (!this.cache.delete(hostAlias)) {
      return;
    }
    await this.enqueuePersist();
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.cache.clear();
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = z.array(RemoteHostRecordSchema).parse(JSON.parse(raw));
      for (const record of parsed) {
        this.cache.set(record.hostAlias, record);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        this.logger.error({ err: error, filePath: this.filePath }, "Failed to load hosts registry");
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const records = Array.from(this.cache.values());
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(records, null, 2), "utf8");
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      this.logger.error(
        { err: error, filePath: this.filePath },
        "Failed to persist hosts registry",
      );
      throw error;
    }
  }

  private async enqueuePersist(): Promise<void> {
    const nextPersist = this.persistQueue.then(() => this.persist());
    this.persistQueue = nextPersist.catch(() => {});
    await nextPersist;
  }
}
