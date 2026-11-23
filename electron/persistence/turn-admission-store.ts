import type Database from "better-sqlite3";
import { z } from "zod";
import { StreamTurnArgsSchema } from "../main/ipc/provider-conversation-schemas";
import { ProviderIdSchema } from "../main/ipc/provider-runtime-schemas";

const Id = z.string().min(1).max(200);
export const SavedTurnStartSchema = z.object({
  args: StreamTurnArgsSchema,
  priority: z.enum(["user", "automatic"]),
  state: z.enum(["queued", "running"]),
  /** When the start first asked for a slot; a queued start older than a day is never run. */
  queuedAt: z.string().datetime(),
  /** Boots that already tried to run this queued start; it gets one. */
  attempts: z.number().int().min(0).optional(),
  hostTask: z.boolean().optional(),
  unattended: z.boolean().optional(),
  freshSession: z.boolean().optional(),
  managedTask: z.boolean().optional(),
  agentRunStage: z.object({ agentRunId: Id, stageId: Id, attempt: z.number().int().min(1) }).strict().optional(),
}).strict();
export type SavedTurnStart = z.infer<typeof SavedTurnStartSchema>;

/** A renderer start the host put back into its task's composer queue, waiting for the renderer to pick it up. */
export const RestoredQueuedTurnSchema = z.object({
  workspaceId: Id,
  taskId: Id,
  item: z.object({
    id: Id,
    queuedAt: z.string().datetime(),
    content: z.string().max(500_000),
    attachedFilePaths: z.array(z.string()).max(0),
    attachments: z.array(z.never()).max(0),
    providerId: ProviderIdSchema,
    model: z.string().max(200).optional(),
    claudeAccountProfileId: z.string().max(200).optional(),
    codexAccountProfileId: z.string().max(200).optional(),
  }).strict(),
}).strict();
export type RestoredQueuedTurn = z.infer<typeof RestoredQueuedTurnSchema>;

type ShellPayload = {
  tasks?: Array<{ id: string; archivedAt?: string | null }>;
  promptDraftByTask?: Record<string, { queuedTurns?: Array<{ id: string }> } & Record<string, unknown>>;
};

/** Transient grants and credentials are excluded by the strict request schema. */
export class TurnAdmissionStore {
  constructor(private readonly db: Database.Database) {}
  private readKey(key: string): unknown[] {
    const row = this.db.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key) as { value_json: string } | undefined;
    if (!row) return [];
    try {
      const value = JSON.parse(row.value_json) as unknown;
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  private writeKey(key: string, value: unknown[]) {
    this.db.prepare("INSERT INTO app_state(key, value_json, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at")
      .run(key, JSON.stringify(value), new Date().toISOString());
  }
  hasUsageLimitResume(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM app_state WHERE key = ?").get(id));
  }
  claimUsageLimitResume(id: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO app_state(key, value_json, updated_at) VALUES(?, 'true', ?)")
      .run(id, new Date().toISOString()).changes === 1;
  }
  /** One unreadable row is dropped; it never keeps the host from starting. */
  read(): SavedTurnStart[] {
    return this.readKey("turn_admission").flatMap((row) => {
      const parsed = SavedTurnStartSchema.safeParse(row);
      if (!parsed.success) console.warn("[turn-admission] dropped an unreadable saved start");
      return parsed.success ? [parsed.data] : [];
    });
  }
  write(rows: SavedTurnStart[]) {
    this.writeKey("turn_admission", z.array(SavedTurnStartSchema).parse(rows));
  }
  readRestored(): RestoredQueuedTurn[] {
    return this.readKey("turn_admission_restored").flatMap((row) => {
      const parsed = RestoredQueuedTurnSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }
  writeRestored(rows: RestoredQueuedTurn[]) {
    this.writeKey("turn_admission_restored", z.array(RestoredQueuedTurnSchema).parse(rows));
  }
  /**
   * Put a start that never ran back into its task's composer queue on disk.
   * Drafts are renderer-owned, so only this task's `queuedTurns` changes,
   * under the write lock; every other shell field, editor-tab artifact
   * pointers included, is written back byte for byte. An item already there
   * (same id) stays as it is. False when the workspace or task is gone,
   * archived, deleted or still in the legacy inline-message format.
   */
  restoreToDraft({ workspaceId, taskId, item }: RestoredQueuedTurn): boolean {
    const tx = this.db.transaction((): boolean => {
      const blocked = this.db.prepare("SELECT 1 FROM workspace_archives WHERE workspace_id = ? UNION ALL SELECT 1 FROM workspace_deletions WHERE workspace_id = ? UNION ALL SELECT 1 FROM deleted_tasks WHERE workspace_id = ? AND task_id = ? LIMIT 1")
        .get(workspaceId, workspaceId, workspaceId, taskId);
      const row = this.db.prepare("SELECT snapshot_json FROM workspaces WHERE id = ?").get(workspaceId) as { snapshot_json: string } | undefined;
      if (blocked || !row) return false;
      const payload = JSON.parse(row.snapshot_json) as ShellPayload;
      const task = payload.tasks?.find((candidate) => candidate.id === taskId);
      if ("messagesByTask" in payload || !task || task.archivedAt) return false;
      const draft = payload.promptDraftByTask?.[taskId] ?? { text: "", attachedFilePaths: [], attachments: [] };
      if (draft.queuedTurns?.some((queued) => queued.id === item.id)) return true;
      const promptDraftByTask = { ...(payload.promptDraftByTask ?? {}), [taskId]: { ...draft, queuedTurns: [...(draft.queuedTurns ?? []), item] } };
      const now = new Date().toISOString();
      this.db.prepare("UPDATE workspaces SET updated_at = ?, snapshot_json = ? WHERE id = ?").run(now, JSON.stringify({ ...payload, promptDraftByTask }), workspaceId);
      // The lite projection carries drafts; the summary does not.
      const meta = this.db.prepare("SELECT shell_lite_json FROM workspace_meta WHERE id = ?").get(workspaceId) as { shell_lite_json: string | null } | undefined;
      if (meta?.shell_lite_json) {
        this.db.prepare("UPDATE workspace_meta SET updated_at = ?, shell_lite_json = ? WHERE id = ?")
          .run(now, JSON.stringify({ ...(JSON.parse(meta.shell_lite_json) as object), promptDraftByTask }), workspaceId);
      }
      return true;
    });
    // IMMEDIATE: main writes this file too, and a deferred read-then-write would fail with SQLITE_BUSY.
    return tx.immediate();
  }
}
