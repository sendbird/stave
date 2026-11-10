import { createHash } from "node:crypto";
import { z } from "zod";
import {
  TarsScheduleRecordSchema, TarsScheduleRuleSchema, TarsScheduleRunSchema, TarsScheduleSummarySchema,
  type TarsScheduleChange, type TarsScheduleReason, type TarsScheduleRecord, type TarsScheduleRun, type TarsScheduleSource, type TarsScheduleSummary,
} from "../../src/lib/tars/schedules";
import { TarsChangeSignal, type TarsChangeListener } from "./tars-changes";

interface ScheduleDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number | bigint };
  };
  transaction<T>(operation: () => T): { (): T; immediate(): T };
}
interface StoredRow { body_json: string }

/**
 * A schedule Tars created: the Schedules service's schedule with the same id,
 * and what Tars last saved there. `contentHash` is the hash of that content
 * (`tarsScheduleContentKey`); a schedule whose content no longer matches was
 * edited elsewhere. `removed` keeps the row, so its runs keep their title and
 * a retried removal finds its outcome.
 */
export const TarsOwnedScheduleSchema = z.object({
  id: z.string().trim().min(1).max(256),
  /** The confirmation that created it. */
  requestId: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(120),
  workspaceId: z.string().trim().min(1).max(256),
  repositoryPath: z.string().min(1),
  rule: TarsScheduleRuleSchema,
  /** The computer's zone when Tars last saved it, by IANA name. */
  timezone: z.string().trim().min(1).max(64),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["active", "removed"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export type TarsOwnedSchedule = z.infer<typeof TarsOwnedScheduleSchema>;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export type TarsScheduleOutcome =
  | { status: "applied"; summary: TarsScheduleSummary }
  | { status: "rejected"; reason: TarsScheduleReason; error: string };

/**
 * What Tars keeps about schedules, beside the Schedules service that stores
 * and runs them: which schedules it created, each confirmation or switch with
 * its outcome, and the runs those schedules started. On the Tars store's own
 * connection, so a record and the proposal it confirms settle together.
 */
export class TarsScheduleStore {
  private readonly db: ScheduleDatabase;
  private readonly changes: TarsChangeSignal;

  /** `changes`: the owning store's signal, so its listeners hear schedule writes too. */
  constructor(database: unknown, changes = new TarsChangeSignal()) {
    this.db = database as ScheduleDatabase;
    this.changes = changes;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tars_schedules (
        id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tars_schedule_requests (
        request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_schedule_requests_created ON tars_schedule_requests(created_at, request_id);
      CREATE TABLE IF NOT EXISTS tars_schedule_runs (
        run_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, started_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_schedule_runs_started ON tars_schedule_runs(started_at, run_id);
    `);
  }

  /** IMMEDIATE, as the other Tars stores: main and the host-service share this file and every unit reads before it writes. */
  private write<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  onChange(listener: TarsChangeListener): () => void {
    return this.changes.subscribe(listener);
  }

  private requireLimit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The schedule limit must be between 1 and 1000.");
  }

  private readOwned(row: unknown): TarsOwnedSchedule | null {
    return row ? TarsOwnedScheduleSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  /** A schedule Tars created, removed ones included; null for any other id. */
  getOwned(id: string): TarsOwnedSchedule | null {
    return this.readOwned(this.db.prepare("SELECT body_json FROM tars_schedules WHERE id = ?").get(id));
  }

  /** The schedules Tars created that still exist, oldest first. */
  listOwned(): TarsOwnedSchedule[] {
    return this.db.prepare("SELECT body_json FROM tars_schedules WHERE state = 'active' ORDER BY created_at, rowid").all()
      .map((row) => this.readOwned(row)!);
  }

  /** The id and title of every schedule Tars ever created, for naming the runs they started. */
  ownedTitles(): Map<string, string> {
    const rows = this.db.prepare("SELECT id, json_extract(body_json, '$.title') AS title FROM tars_schedules").all() as Array<{ id: string; title: unknown }>;
    return new Map(rows.map((row) => [row.id, typeof row.title === "string" ? row.title : row.id]));
  }

  private saveOwned(schedule: TarsOwnedSchedule) {
    const parsed = TarsOwnedScheduleSchema.parse(schedule);
    this.db.prepare(`INSERT INTO tars_schedules (id, request_id, state, created_at, body_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state = excluded.state, body_json = excluded.body_json`)
      .run(parsed.id, parsed.requestId, parsed.state, parsed.createdAt, JSON.stringify(parsed));
  }

  /** Marks a schedule Tars created as removed (by Tars, or found removed elsewhere). A removed one stays removed. */
  markRemoved(id: string, now: string): TarsOwnedSchedule | null {
    return this.write(() => {
      const current = this.getOwned(id);
      if (!current || current.state === "removed") return current;
      const next = { ...current, state: "removed" as const, updatedAt: now };
      this.saveOwned(next);
      this.changes.emit("conversation");
      return next;
    });
  }

  private readRecord(row: unknown): TarsScheduleRecord | null {
    return row ? TarsScheduleRecordSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  getRecord(requestId: string): TarsScheduleRecord | null {
    return this.readRecord(this.db.prepare("SELECT body_json FROM tars_schedule_requests WHERE request_id = ?").get(requestId));
  }

  /** The most recent confirmations and switches, oldest first, for the conversation timeline. */
  listRecords(limit = 100): TarsScheduleRecord[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_schedule_requests ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readRecord(row)!).reverse();
  }

  /** Confirmations interrupted before they settled, oldest first. */
  listPendingRecords(limit = 100): TarsScheduleRecord[] {
    this.requireLimit(limit);
    return this.db.prepare(`SELECT body_json FROM tars_schedule_requests WHERE json_extract(body_json, '$.status') = 'pending'
      ORDER BY created_at, rowid LIMIT ?`).all(limit).map((row) => this.readRecord(row)!);
  }

  /**
   * Records one confirmation's intent before anything is created or changed.
   * Its request id is the retry identity: a repeated confirmation returns the
   * first record, whatever it says about `enable` or its source, so a retry
   * never applies a second time or with another choice. A switch's id naming
   * another switch is refused.
   */
  recordRequest(input: { requestId: string; source: TarsScheduleSource; operation: TarsScheduleChange; scheduleId: string;
    proposal: { messageId: string; actionIndex: number } | null; enable?: boolean }, now: string): { record: TarsScheduleRecord; existed: boolean } {
    const requestHash = hash({ operation: input.operation, scheduleId: input.scheduleId, proposal: input.proposal });
    return this.write(() => {
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_schedule_requests WHERE request_id = ?")
        .get(input.requestId) as (StoredRow & { request_hash: string }) | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("This request ID already names a different schedule change.");
        return { record: this.readRecord(existing)!, existed: true };
      }
      const record = TarsScheduleRecordSchema.parse({ requestId: input.requestId, source: input.source, requestHash, operation: input.operation,
        proposal: input.proposal, scheduleId: input.scheduleId, ...(input.operation === "create" ? { enable: input.enable === true } : {}),
        status: "pending", reason: null, error: null, summary: null, revision: 1, createdAt: now, updatedAt: now });
      this.db.prepare("INSERT INTO tars_schedule_requests (request_id, request_hash, revision, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
        .run(record.requestId, requestHash, record.revision, now, JSON.stringify(record));
      this.changes.emit("conversation");
      return { record, existed: false };
    });
  }

  /**
   * Settles a record once, in one transaction with what it changed here:
   * `owned` saves the schedule Tars created or changed, `removed` marks it
   * removed, and `settleProposal` settles the proposal it confirmed on the
   * same connection. A settled record is returned as it is, so a replayed
   * outcome changes nothing.
   */
  settle(requestId: string, outcome: TarsScheduleOutcome, now: string,
    effects: { owned?: TarsOwnedSchedule; removed?: boolean; settleProposal?: (record: TarsScheduleRecord) => void } = {}): TarsScheduleRecord {
    return this.write(() => {
      const current = this.getRecord(requestId);
      if (!current) throw new Error("The schedule record was not found.");
      if (current.status !== "pending") return current;
      const rejected = outcome.status === "rejected" ? outcome : null;
      const next = TarsScheduleRecordSchema.parse({ ...current, status: outcome.status, reason: rejected?.reason ?? null,
        error: rejected ? rejected.error.slice(0, 2_000).trim() || "The schedule change was not applied." : null,
        summary: outcome.status === "applied" ? TarsScheduleSummarySchema.parse(outcome.summary) : null,
        revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_schedule_requests SET revision = ?, body_json = ? WHERE request_id = ? AND revision = ?")
        .run(next.revision, JSON.stringify(next), requestId, current.revision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The schedule record changed. Refresh before trying again.");
      if (outcome.status === "applied") {
        if (effects.owned) this.saveOwned(effects.owned);
        if (effects.removed) this.markRemoved(current.scheduleId, now);
      }
      effects.settleProposal?.(next);
      this.changes.emit("conversation");
      return next;
    });
  }

  private readRun(row: unknown): TarsScheduleRun | null {
    return row ? TarsScheduleRunSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  /** The most recent runs Tars's schedules started, oldest first, for the conversation timeline. */
  listRuns(limit = 100): TarsScheduleRun[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_schedule_runs ORDER BY started_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readRun(row)!).reverse();
  }

  /**
   * Saves the runs as last observed. A run that reads the same is left alone,
   * so an unchanged tick writes nothing and announces nothing. Returns how
   * many it wrote.
   */
  saveRuns(runs: ReadonlyArray<Omit<TarsScheduleRun, "updatedAt">>, now: string): number {
    if (!runs.length) return 0;
    return this.write(() => {
      const known = new Map((this.db.prepare("SELECT run_id, body_json FROM tars_schedule_runs WHERE run_id IN (SELECT value FROM json_each(?))")
        .all(JSON.stringify(runs.map((run) => run.runId))) as Array<StoredRow & { run_id: string }>).map((row) => [row.run_id, this.readRun(row)!]));
      let written = 0;
      for (const run of runs) {
        const previous = known.get(run.runId);
        const { updatedAt: _previousUpdate, ...before } = previous ?? { updatedAt: null };
        if (previous && JSON.stringify(TarsScheduleRunSchema.omit({ updatedAt: true }).parse(run)) === JSON.stringify(before)) continue;
        const next = TarsScheduleRunSchema.parse({ ...run, updatedAt: now });
        this.db.prepare(`INSERT INTO tars_schedule_runs (run_id, schedule_id, started_at, body_json) VALUES (?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET body_json = excluded.body_json`).run(next.runId, next.scheduleId, next.startedAt, JSON.stringify(next));
        written += 1;
      }
      if (written) this.changes.emit("conversation");
      return written;
    });
  }
}
