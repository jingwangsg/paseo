import { z } from "zod";

export const RemoteHostRecordSchema = z.object({
  hostAlias: z.string(),
  hostname: z.string(),
  user: z.string().optional(),
  port: z.number().optional(),
  identityFile: z.string().optional(),
  addedAt: z.string(),
});

export type RemoteHostRecord = z.infer<typeof RemoteHostRecordSchema>;

export type RemoteHostConnectionStatus =
  | "registered"
  | "connecting"
  | "deploying"
  | "ready"
  | "unreachable"
  | "failed";

export interface RemoteHostState {
  record: RemoteHostRecord;
  status: RemoteHostConnectionStatus;
  tunnelPort: number | null;
  daemonVersion: string | null;
  error: string | null;
  generation: number; // Incremented on each addHost, used to detect stale triggerConnect
}
