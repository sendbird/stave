/**
 * Durable storage for agent runs, their stage attempts and their events.
 *
 * Used by: the agent run runtime (host service), through `sqlite-store.ts`.
 *
 * Supervisor tables, like the wake-up tables and unlike the run ledger: an
 * agent run supervises a task the user already owns, so it has no claims, leases
 * or receipts. It reads the ledger and PR checks elsewhere and writes only
 * these rows.
 *
 * Every write from a pure transition (`AgentRunChange`) lands in one savepoint,
 * so an agent run row, its stage records and its events never disagree.
 */
import { randomUUID } from "node:crypto";
import { projectResourceBudget, readRunResourceConfig, type ResourceLink, type AgentResourceSnapshot } from "../../src/lib/agent-runs/resources";
import {
  AGENT_RUN_LIMITS,
  AgentRunEventSchema,
  AgentRunSchema,
  AgentRunStageRecordSchema,
  type AgentRun,
  type AgentRunAggregate,
  type AgentRunChange,
  type AgentRunEvent,
  type AgentRunEventDraft,
  type AgentRunEventKind,
  type AgentRunStageRecord,
} from "../../src/lib/agent-runs/domain";
// temporary-migration: agent-run-tables
import { migrateLegacyAgentRunTables } from "./agent-run-legacy-names";
// end temporary-migration: agent-run-tables
// temporary-migration: agent-run-notification-kinds
import { migrateLegacyAgentRunNotifications } from "./agent-run-legacy-names";
// end temporary-migration: agent-run-notification-kinds
import { SECOND_AGENT_RUN_REFUSAL } from "../../src/lib/supervision/automatic-turn-owner";

interface AgentRunStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface AgentRunDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => AgentRunStatement;
}

interface AgentRunRow {
  id: string;
  repository_path: string;
  workspace_id: string;
  lead_task_id: string;
  project_id: string | null;
  workflow_json: string;
  assignment: string;
  consent_json: string;
  fingerprint_json: string;
  state: string;
  pause_reason: string | null;
  stop_reason: string | null;
  reason_detail: string | null;
  current_stage_index: number;
  turn_count: number;
  max_turns: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  origin: string | null;
}

interface AgentRunStageRow {
  agent_run_id: string;
  stage_id: string;
  attempt: number;
  status: string;
  nudged: number;
  block_reason: string | null;
  detail: string | null;
  feedback: string | null;
  started_at: string | null;
  ended_at: string | null;
  start_head_sha: string | null;
  report_json: string | null;
  report_revision: number;
  facts_json: string | null;
}

interface AgentRunEventRow {
  id: string;
  agent_run_id: string;
  sequence: number;
  kind: string;
  idempotency_key: string | null;
  detail_json: string;
  created_at: string;
}

export type AgentRunCreateResult =
  | { ok: true }
  | { ok: false; reason: "active-agent-run-exists"; message: string };

const ACTIVE_STATES_SQL = "('running', 'paused')";

function parseJson(value: string | null) {
  return value === null ? null : JSON.parse(value);
}

function parseAgentRunRow(row: AgentRunRow): AgentRun {
  return AgentRunSchema.parse({
    id: row.id,
    repositoryPath: row.repository_path,
    workspaceId: row.workspace_id,
    leadTaskId: row.lead_task_id,
    projectId: row.project_id,
    workflow: JSON.parse(row.workflow_json),
    assignment: row.assignment,
    consent: JSON.parse(row.consent_json),
    fingerprint: JSON.parse(row.fingerprint_json),
    state: row.state,
    pauseReason: row.pause_reason,
    stopReason: row.stop_reason,
    reasonDetail: row.reason_detail,
    currentStageIndex: row.current_stage_index,
    turnCount: row.turn_count,
    maxTurns: row.max_turns,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.origin ? { origin: row.origin } : {}),
  });
}

function parseStageRow(row: AgentRunStageRow): AgentRunStageRecord {
  return AgentRunStageRecordSchema.parse({
    agentRunId: row.agent_run_id,
    stageId: row.stage_id,
    attempt: row.attempt,
    status: row.status,
    nudged: row.nudged === 1,
    blockReason: row.block_reason,
    detail: row.detail,
    feedback: row.feedback,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startHeadSha: row.start_head_sha,
    report: parseJson(row.report_json),
    reportRevision: row.report_revision,
    facts: parseJson(row.facts_json),
  });
}

function parseEventRow(row: AgentRunEventRow): AgentRunEvent {
  return AgentRunEventSchema.parse({
    id: row.id,
    agentRunId: row.agent_run_id,
    sequence: row.sequence,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    detail: JSON.parse(row.detail_json),
    createdAt: row.created_at,
  });
}

/** Parses rows one by one so a single unreadable agent run cannot hide the rest. */
function parseEach<Row, Value>(rows: Row[], parse: (row: Row) => Value, label: string): Value[] {
  const values: Value[] = [];
  for (const row of rows) {
    try {
      values.push(parse(row));
    } catch (error) {
      console.warn(`[agent-runs] skipped an unreadable ${label} row`, error);
    }
  }
  return values;
}

export class AgentRunStore {
  private readonly db: AgentRunDatabase;

  constructor(database: unknown) {
    this.db = database as AgentRunDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    // temporary-migration: agent-run-tables
    migrateLegacyAgentRunTables(this.db);
    // end temporary-migration: agent-run-tables
    // temporary-migration: agent-run-notification-kinds
    migrateLegacyAgentRunNotifications(this.db);
    // end temporary-migration: agent-run-notification-kinds
    // The retired mission_proposals and mission_trigger_seen tables are no
    // longer created; an existing database keeps them, unread and untouched.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        repository_path TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        lead_task_id TEXT NOT NULL,
        project_id TEXT,
        workflow_json TEXT NOT NULL,
        assignment TEXT NOT NULL,
        consent_json TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL,
        state TEXT NOT NULL,
        pause_reason TEXT,
        stop_reason TEXT,
        reason_detail TEXT,
        current_stage_index INTEGER NOT NULL,
        turn_count INTEGER NOT NULL DEFAULT 0,
        max_turns INTEGER NOT NULL DEFAULT ${AGENT_RUN_LIMITS.defaultMaxTurns},
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        origin TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_active_lead
        ON agent_runs (lead_task_id) WHERE state IN ${ACTIVE_STATES_SQL};
      CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace
        ON agent_runs (workspace_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS agent_run_stages (
        agent_run_id TEXT NOT NULL,
        stage_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        nudged INTEGER NOT NULL DEFAULT 0,
        block_reason TEXT,
        detail TEXT,
        feedback TEXT,
        started_at TEXT,
        ended_at TEXT,
        start_head_sha TEXT,
        report_json TEXT,
        report_revision INTEGER NOT NULL DEFAULT 0,
        facts_json TEXT,
        PRIMARY KEY (agent_run_id, stage_id, attempt)
      );
      CREATE TABLE IF NOT EXISTS agent_run_events (
        id TEXT PRIMARY KEY,
        agent_run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (agent_run_id, sequence)
      );
    `);
    // Additive: databases from before agent runs gain the nullable column.
    const columns = this.db.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "origin")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN origin TEXT");
    }
  }

  private inSavepoint<T>(name: string, work: () => T): T {
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const result = work();
      this.db.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw error;
    }
  }

  private writeAgentRun(agentRun: AgentRun, insert: boolean) {
    const values = [
      agentRun.repositoryPath,
      agentRun.workspaceId,
      agentRun.leadTaskId,
      agentRun.projectId,
      JSON.stringify(agentRun.workflow),
      agentRun.assignment,
      JSON.stringify(agentRun.consent),
      JSON.stringify(agentRun.fingerprint),
      agentRun.state,
      agentRun.pauseReason,
      agentRun.stopReason,
      agentRun.reasonDetail,
      agentRun.currentStageIndex,
      agentRun.turnCount,
      agentRun.maxTurns,
      agentRun.expiresAt,
      agentRun.createdAt,
      agentRun.updatedAt,
      agentRun.origin ?? null,
    ];
    if (insert) {
      this.db
        .prepare(
          `INSERT INTO agent_runs (
             repository_path, workspace_id, lead_task_id, project_id,
             workflow_json, assignment, consent_json, fingerprint_json, state,
             pause_reason, stop_reason, reason_detail, current_stage_index,
             turn_count, max_turns, expires_at, created_at, updated_at, origin, id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...values, agentRun.id);
      return;
    }
    const result = this.db
      .prepare(
        `UPDATE agent_runs SET
           repository_path = ?, workspace_id = ?, lead_task_id = ?,
           project_id = ?, workflow_json = ?, assignment = ?, consent_json = ?,
           fingerprint_json = ?, state = ?, pause_reason = ?, stop_reason = ?,
           reason_detail = ?, current_stage_index = ?, turn_count = ?,
           max_turns = ?, expires_at = ?, created_at = ?, updated_at = ?,
           origin = ?
         WHERE id = ?`,
      )
      .run(...values, agentRun.id);
    if (Number(result.changes ?? 0) === 0) {
      throw new Error(`Run not found: ${agentRun.id}`);
    }
  }

  private writeStage(record: AgentRunStageRecord) {
    this.db
      .prepare(
        `INSERT INTO agent_run_stages (
           agent_run_id, stage_id, attempt, status, nudged, block_reason, detail,
           feedback, started_at, ended_at, start_head_sha, report_json,
           report_revision, facts_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (agent_run_id, stage_id, attempt) DO UPDATE SET
           status = excluded.status,
           nudged = excluded.nudged,
           block_reason = excluded.block_reason,
           detail = excluded.detail,
           feedback = excluded.feedback,
           started_at = excluded.started_at,
           ended_at = excluded.ended_at,
           start_head_sha = excluded.start_head_sha,
           report_json = excluded.report_json,
           report_revision = excluded.report_revision,
           facts_json = excluded.facts_json`,
      )
      .run(
        record.agentRunId,
        record.stageId,
        record.attempt,
        record.status,
        record.nudged ? 1 : 0,
        record.blockReason,
        record.detail,
        record.feedback,
        record.startedAt,
        record.endedAt,
        record.startHeadSha,
        record.report ? JSON.stringify(record.report) : null,
        record.reportRevision,
        record.facts ? JSON.stringify(record.facts) : null,
      );
  }

  /** Inserts an event; a repeated idempotency key is a no-op that returns false. */
  private writeEvent(agentRunId: string, draft: AgentRunEventDraft, now: Date): boolean {
    const event = AgentRunEventSchema.parse({
      id: randomUUID(),
      agentRunId,
      sequence: 1,
      kind: draft.kind,
      idempotencyKey: draft.idempotencyKey,
      detail: draft.detail,
      createdAt: now.toISOString(),
    });
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_run_events (
           id, agent_run_id, sequence, kind, idempotency_key, detail_json, created_at
         ) VALUES (
           ?, ?,
           (SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_run_events WHERE agent_run_id = ?),
           ?, ?, ?, ?
         )`,
      )
      .run(
        event.id,
        agentRunId,
        agentRunId,
        event.kind,
        event.idempotencyKey,
        JSON.stringify(event.detail),
        event.createdAt,
      );
    return Number(result.changes ?? 0) > 0;
  }

  /**
   * Keeps the newest events within the retention bound. Keyed events are the
   * idempotency guard for turns and Stave actions, so they are never pruned.
   */
  private pruneEvents(agentRunId: string) {
    const { count } = this.db
      .prepare("SELECT COUNT(*) AS count FROM agent_run_events WHERE agent_run_id = ?")
      .get(agentRunId) as { count: number };
    const excess = count - AGENT_RUN_LIMITS.maxRetainedEvents;
    if (excess <= 0) return;
    this.db
      .prepare(
        `DELETE FROM agent_run_events WHERE id IN (
           SELECT id FROM agent_run_events
           WHERE agent_run_id = ? AND idempotency_key IS NULL
           ORDER BY sequence ASC LIMIT ?
         )`,
      )
      .run(agentRunId, excess);
  }

  private writeChange(change: AgentRunChange, now: Date, insert: boolean) {
    this.writeAgentRun(AgentRunSchema.parse(change.agentRun), insert);
    for (const record of change.upserts) {
      if (record.agentRunId !== change.agentRun.id) {
        throw new Error(`Stage record belongs to run ${record.agentRunId}, not ${change.agentRun.id}.`);
      }
      this.writeStage(AgentRunStageRecordSchema.parse(record));
    }
    for (const draft of change.events) {
      this.writeEvent(change.agentRun.id, draft, now);
    }
    if (change.events.length > 0) this.pruneEvents(change.agentRun.id);
  }

  /**
   * Starts an agent run. Refused when the lead task already has a running or
   * paused agent run: one active agent run per lead task.
   */
  create(change: AgentRunChange, now: Date): AgentRunCreateResult {
    return this.inSavepoint("agent_run_create", () => {
      if (this.getActiveAgentRunForTask(change.agentRun.leadTaskId)) {
        return { ok: false, reason: "active-agent-run-exists", message: SECOND_AGENT_RUN_REFUSAL };
      }
      this.writeChange(change, now, true);
      return { ok: true };
    });
  }

  /** Applies a transition from the policy or a user command. */
  apply(change: AgentRunChange, now: Date) {
    this.inSavepoint("agent_run_apply", () => this.writeChange(change, now, false));
  }

  /**
   * Records one event outside a transition, such as `action-started` before a
   * Stave action runs. False when its idempotency key was already recorded.
   */
  recordEvent(agentRunId: string, draft: AgentRunEventDraft, now: Date): boolean {
    return this.inSavepoint("agent_run_event", () => {
      const inserted = this.writeEvent(agentRunId, draft, now);
      if (inserted) this.pruneEvents(agentRunId);
      return inserted;
    });
  }

  hasEvent(idempotencyKey: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM agent_run_events WHERE idempotency_key = ?")
        .get(idempotencyKey),
    );
  }

  getAgentRun(id: string): AgentRun | null {
    const row = this.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as
      | AgentRunRow
      | null
      | undefined;
    return row ? parseAgentRunRow(row) : null;
  }

  getAggregate(id: string): AgentRunAggregate | null {
    const agentRun = this.getAgentRun(id);
    if (!agentRun) return null;
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_run_stages WHERE agent_run_id = ? ORDER BY stage_id, attempt",
      )
      .all(id) as AgentRunStageRow[];
    return { agentRun, stages: rows.map(parseStageRow) };
  }

  getActiveAgentRunForTask(leadTaskId: string): AgentRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE lead_task_id = ? AND state IN ${ACTIVE_STATES_SQL}`,
      )
      .get(leadTaskId) as AgentRunRow | null | undefined;
    return row ? parseAgentRunRow(row) : null;
  }

  listActiveAgentRuns(): AgentRun[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_runs WHERE state IN ${ACTIVE_STATES_SQL} ORDER BY created_at`)
      .all() as AgentRunRow[];
    return parseEach(rows, parseAgentRunRow, "agent run");
  }

  listAgentRunsForWorkspace(workspaceId: string, limit = 50): AgentRun[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, Math.max(1, Math.min(limit, 200))) as AgentRunRow[];
    return parseEach(rows, parseAgentRunRow, "agent run");
  }

  /** The newest agent runs across every workspace, for surfaces that span them. */
  listRecentAgentRuns(limit = 50): AgentRun[] {
    const rows = this.db
      .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(limit, 200))) as AgentRunRow[];
    return parseEach(rows, parseAgentRunRow, "agent run");
  }

  /**
   * One agent run's events of the given kinds, in sequence order. Keyed kinds
   * are never pruned, so this is complete for them.
   */
  listEventsByKind(agentRunId: string, kinds: readonly AgentRunEventKind[]): AgentRunEvent[] {
    if (kinds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_run_events
         WHERE agent_run_id = ? AND kind IN (${kinds.map(() => "?").join(", ")})
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(agentRunId, ...kinds, AGENT_RUN_LIMITS.maxRetainedEvents) as AgentRunEventRow[];
    return parseEach(rows, parseEventRow, "run event");
  }

  /** The newest events of one agent run, oldest first. */
  listRecentEvents(agentRunId: string, limit = 200): AgentRunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM agent_run_events WHERE agent_run_id = ?
           ORDER BY sequence DESC LIMIT ?
         ) ORDER BY sequence ASC`,
      )
      .all(agentRunId, Math.max(1, Math.min(limit, AGENT_RUN_LIMITS.maxRetainedEvents))) as AgentRunEventRow[];
    return parseEach(rows, parseEventRow, "run event");
  }

  resourceConfig(agentRunId: string) {
    return readRunResourceConfig(this.listEventsByKind(agentRunId, ["agent-run-started"]));
  }

  readResources(agentRunId: string): AgentResourceSnapshot | null {
    const config = this.resourceConfig(agentRunId);
    if (!config) return null;
    const rootRunId = config.link?.rootRunId ?? agentRunId;
    const root = this.resourceConfig(rootRunId);
    if (!root || root.link) throw new Error("The resource root is missing or invalid.");
    const snapshot = projectResourceBudget(rootRunId, root.policy, this.listEventsByKind(rootRunId, ["resource-budget"]));
    if (config.link && !snapshot.reservations.some((row) => row.reservationId === config.link!.reservationId &&
        row.executionId === config.link!.executionId && row.childRunId === agentRunId))
      throw new Error("The child resource reservation does not match its Run.");
    return config.link ? { ...snapshot, memberPolicy: config.policy } : snapshot;
  }

  /** Parent dispatch and child reservation share the same SQLite writer/savepoint. */
  reserveChildResources(args: { parentTaskId: string; childRunId: string; executionId: string; requestedTurns: number; expectedRootRunId?: string; providerId?: "claude-code" | "codex"; model?: string; now: Date }) {
    return this.inSavepoint("resource_reserve", () => {
      if (!Number.isInteger(args.requestedTurns) || args.requestedTurns < 1 || args.requestedTurns > 30) throw new Error("Invalid child turn capacity.");
      const parent = this.getActiveAgentRunForTask(args.parentTaskId);
      if (args.expectedRootRunId && parent?.id !== args.expectedRootRunId) throw new Error("The parent resource Run ended or changed before helper admission.");
      if (!parent || !this.resourceConfig(parent.id)) return null;
      if (!args.expectedRootRunId) throw new Error("A helper must carry the exact resource Run accepted by its coordinator.");
      const config = this.resourceConfig(parent.id)!;
      if (args.providerId && args.providerId !== config.policy.providerId) throw new Error("The helper must keep the parent resource provider.");
      if (args.model && !config.policy.allowedModels.includes(args.model)) throw new Error("The helper model is outside the frozen parent catalog.");
      if (config.link) throw new Error("A delegated Run cannot create recursive resource reservations.");
      if (parent.state !== "running") throw new Error("Resume the parent Run before starting a helper.");
      const snapshot = this.readResources(parent.id)!;
      const reservationId = `${args.childRunId}:resources`;
      const existing = snapshot.reservations.find((row) => row.reservationId === reservationId);
      if (existing) {
        if (existing.executionId !== args.executionId || existing.released) throw new Error("The helper reservation is no longer admitted.");
        return { policy: config.policy, link: { rootRunId: parent.id, reservationId, executionId: args.executionId }, capacity: existing.capacity };
      }
      if (snapshot.activeHelpers >= config.policy.concurrentHelpers || snapshot.helpersLaunched >= config.policy.totalHelpers)
        throw new Error("The shared helper limit was reached (2 concurrent / 4 total). Continue directly or start a new Run explicitly.");
      const capacity = Math.min(args.requestedTurns, snapshot.remaining - config.policy.parentReserve);
      if (capacity < 1) throw new Error("Shared turn capacity is reserved for parent integration. Continue directly or start a new Run explicitly.");
      this.writeEvent(parent.id, { kind: "resource-budget", idempotencyKey: `reserve:${reservationId}`,
        detail: { operation: "reserve", reservationId, executionId: args.executionId, childRunId: args.childRunId, capacity } }, args.now);
      return { policy: config.policy, link: { rootRunId: parent.id, reservationId, executionId: args.executionId } as ResourceLink, capacity };
    });
  }

  /** One admitted attempt consumes one unit, including unknown delivery or start failure. */
  consumeResourceTurn(agentRunId: string, turnKey: string, now: Date): boolean {
    return this.inSavepoint("resource_consume", () => {
      const config = this.resourceConfig(agentRunId);
      if (!config) return true;
      const key = `resource-turn:${turnKey}`;
      if (this.hasEvent(key)) return true;
      const snapshot = this.readResources(agentRunId)!;
      const root = this.getAgentRun(snapshot.rootRunId);
      if (!root || root.state !== "running") return false;
      const reservation = config.link && snapshot.reservations.find((row) => row.reservationId === config.link!.reservationId);
      if (config.link ? !reservation || reservation.released || reservation.consumed >= reservation.capacity :
        snapshot.remaining < 1 || (snapshot.activeHelpers > 0 && snapshot.remaining <= snapshot.policy.parentReserve)) return false;
      this.writeEvent(snapshot.rootRunId, { kind: "resource-budget", idempotencyKey: key,
        detail: { operation: "consume", ownerRunId: agentRunId, reservationId: config.link?.reservationId ?? null } }, now);
      return true;
    });
  }

  /** Terminal settlement releases only unused capacity; consumed attempts are never refunded. */
  releaseResourceReservation(link: ResourceLink, now: Date) {
    this.inSavepoint("resource_release", () => {
      const snapshot = this.readResources(link.rootRunId);
      const reservation = snapshot?.reservations.find((row) => row.reservationId === link.reservationId);
      if (!reservation || reservation.executionId !== link.executionId) throw new Error("A stale execution cannot release another reservation.");
      this.writeEvent(link.rootRunId, { kind: "resource-budget", idempotencyKey: `release:${link.reservationId}`,
        detail: { operation: "release", reservationId: link.reservationId, executionId: link.executionId } }, now);
    });
  }

  /** Events in sequence order, optionally after a sequence the caller has seen. */
  listEvents(agentRunId: string, args: { afterSequence?: number; limit?: number } = {}): AgentRunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_run_events
         WHERE agent_run_id = ? AND sequence > ?
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(
        agentRunId,
        args.afterSequence ?? 0,
        Math.max(1, Math.min(args.limit ?? 500, AGENT_RUN_LIMITS.maxRetainedEvents)),
      ) as AgentRunEventRow[];
    return parseEach(rows, parseEventRow, "run event");
  }
}
