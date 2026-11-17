import type Database from "better-sqlite3";
import { z } from "zod";
import { StreamTurnArgsSchema } from "../main/ipc/provider-conversation-schemas";

const Id = z.string().min(1).max(200);
export const SavedTurnStartSchema = z.object({
  args: StreamTurnArgsSchema,
  priority: z.enum(["user", "automatic"]),
  state: z.enum(["queued", "running"]),
  hostTask: z.boolean().optional(),
  unattended: z.boolean().optional(),
  freshSession: z.boolean().optional(),
  managedTask: z.boolean().optional(),
  agentRunStage: z.object({ agentRunId: Id, stageId: Id, attempt: z.number().int().min(1) }).strict().optional(),
}).strict();
const StateSchema = z.array(SavedTurnStartSchema);
export type SavedTurnStart = z.infer<typeof SavedTurnStartSchema>;
/** Transient grants and credentials are excluded by the strict request schema. */
export class TurnAdmissionStore {
  constructor(private readonly db: Database.Database) {}
  read(): SavedTurnStart[] {
    const row = this.db.prepare("SELECT value_json FROM app_state WHERE key = 'turn_admission'").get() as { value_json: string } | undefined;
    return row ? StateSchema.parse(JSON.parse(row.value_json)) : [];
  }
  write(rows: SavedTurnStart[]) {
    this.db.prepare("INSERT INTO app_state(key, value_json, updated_at) VALUES('turn_admission', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at")
      .run(JSON.stringify(StateSchema.parse(rows)), new Date().toISOString());
  }
}
