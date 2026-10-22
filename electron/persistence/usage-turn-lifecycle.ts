import type Database from "better-sqlite3";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import { createTurnReceipt } from "./turn-terminal-receipt";
import { startTurnDigest } from "./turn-digest-store";
import type { UsageStatisticsStore } from "./usage-statistics-store";

export interface UsageTrackedTurnArgs {
  id: string;
  workspaceId: string;
  taskId: string;
  providerId: ProviderId;
  createdAt?: string;
  accountProfileId?: string;
  modelId?: string;
}

/** Persist the conversation row and its prompt-free usage identity atomically. */
export function beginUsageTrackedTurn(db: Database.Database, usage: UsageStatisticsStore, args: UsageTrackedTurnArgs) {
  const createdAt = args.createdAt ?? new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at, receipt_json)
      VALUES (?, ?, ?, ?, ?, NULL, ?)`)
      .run(args.id, args.workspaceId, args.taskId, args.providerId, createdAt, JSON.stringify(createTurnReceipt()));
    startTurnDigest(db, {
      turnId: args.id,
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      providerId: args.providerId,
      accountProfileId: args.accountProfileId,
      createdAt,
    });
    usage.beginTurn({ ...args, createdAt });
  })();
}
