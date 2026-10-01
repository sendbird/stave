/**
 * Durable storage for missions, their stage attempts and their events.
 *
 * Used by: the mission runtime (host service), through `sqlite-store.ts`.
 *
 * Supervisor tables, like the wake-up tables and unlike the run ledger: a
 * mission supervises a task the user already owns, so it has no claims, leases
 * or receipts. It reads the ledger and PR checks elsewhere and writes only
 * these rows.
 *
 * Every write from a pure transition (`MissionChange`) lands in one savepoint,
 * so a mission row, its stage records and its events never disagree.
 */
import { randomUUID } from "node:crypto";
import {
  MISSION_LIMITS,
  MissionEventSchema,
  MissionSchema,
  MissionStageRecordSchema,
  type Mission,
  type MissionAggregate,
  type MissionChange,
  type MissionEvent,
  type MissionEventDraft,
  type MissionEventKind,
  type MissionStageRecord,
} from "../../src/lib/missions/domain";
import { ProposedMissionSchema, type ProposalListFilter, type ProposedMission } from "../../src/lib/missions/proposed";
import { SECOND_MISSION_REFUSAL } from "../../src/lib/supervision/automatic-turn-owner";

interface MissionStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface MissionDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => MissionStatement;
}

interface MissionRow {
  id: string;
  repository_path: string;
  workspace_id: string;
  lead_task_id: string;
  project_id: string | null;
  playbook_json: string;
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

interface MissionStageRow {
  mission_id: string;
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

interface MissionEventRow {
  id: string;
  mission_id: string;
  sequence: number;
  kind: string;
  idempotency_key: string | null;
  detail_json: string;
  created_at: string;
}

export type MissionCreateResult =
  | { ok: true }
  | { ok: false; reason: "active-mission-exists"; message: string };

const ACTIVE_STATES_SQL = "('running', 'paused')";

function parseJson(value: string | null) {
  return value === null ? null : JSON.parse(value);
}

function parseMissionRow(row: MissionRow): Mission {
  return MissionSchema.parse({
    id: row.id,
    repositoryPath: row.repository_path,
    workspaceId: row.workspace_id,
    leadTaskId: row.lead_task_id,
    projectId: row.project_id,
    playbook: JSON.parse(row.playbook_json),
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

function parseStageRow(row: MissionStageRow): MissionStageRecord {
  return MissionStageRecordSchema.parse({
    missionId: row.mission_id,
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

function parseEventRow(row: MissionEventRow): MissionEvent {
  return MissionEventSchema.parse({
    id: row.id,
    missionId: row.mission_id,
    sequence: row.sequence,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    detail: JSON.parse(row.detail_json),
    createdAt: row.created_at,
  });
}

/** Parses rows one by one so a single unreadable mission cannot hide the rest. */
function parseEach<Row, Value>(rows: Row[], parse: (row: Row) => Value, label: string): Value[] {
  const values: Value[] = [];
  for (const row of rows) {
    try {
      values.push(parse(row));
    } catch (error) {
      console.warn(`[missions] skipped an unreadable ${label} row`, error);
    }
  }
  return values;
}

export class MissionStore {
  private readonly db: MissionDatabase;

  constructor(database: unknown) {
    this.db = database as MissionDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        repository_path TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        lead_task_id TEXT NOT NULL,
        project_id TEXT,
        playbook_json TEXT NOT NULL,
        assignment TEXT NOT NULL,
        consent_json TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL,
        state TEXT NOT NULL,
        pause_reason TEXT,
        stop_reason TEXT,
        reason_detail TEXT,
        current_stage_index INTEGER NOT NULL,
        turn_count INTEGER NOT NULL DEFAULT 0,
        max_turns INTEGER NOT NULL DEFAULT ${MISSION_LIMITS.defaultMaxTurns},
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        origin TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_active_lead
        ON missions (lead_task_id) WHERE state IN ${ACTIVE_STATES_SQL};
      CREATE INDEX IF NOT EXISTS idx_missions_workspace
        ON missions (workspace_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS mission_stages (
        mission_id TEXT NOT NULL,
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
        PRIMARY KEY (mission_id, stage_id, attempt)
      );
      CREATE TABLE IF NOT EXISTS mission_events (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (mission_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS mission_proposals (
        id TEXT PRIMARY KEY,
        source_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mission_proposals_state
        ON mission_proposals (state, created_at DESC);
      CREATE TABLE IF NOT EXISTS mission_trigger_seen (
        trigger_key TEXT PRIMARY KEY,
        seen_at TEXT NOT NULL
      );
    `);
    // Additive: databases from before agent runs gain the nullable column.
    const columns = this.db.prepare("PRAGMA table_info(missions)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "origin")) {
      this.db.exec("ALTER TABLE missions ADD COLUMN origin TEXT");
    }
  }

  /** Adds a proposal unless its source key was proposed before; false when it was. */
  insertProposal(proposal: ProposedMission): boolean {
    const parsed = ProposedMissionSchema.parse(proposal);
    const result = this.db
      .prepare("INSERT OR IGNORE INTO mission_proposals (id, source_key, state, body_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(parsed.id, parsed.sourceKey, parsed.state, JSON.stringify(parsed), parsed.createdAt);
    return Boolean(result.changes);
  }

  updateProposal(proposal: ProposedMission): void {
    const parsed = ProposedMissionSchema.parse(proposal);
    this.db
      .prepare("UPDATE mission_proposals SET state = ?, body_json = ? WHERE id = ?")
      .run(parsed.state, JSON.stringify(parsed), parsed.id);
  }

  getProposal(id: string): ProposedMission | null {
    const row = this.db.prepare("SELECT body_json FROM mission_proposals WHERE id = ?").get(id) as { body_json: string } | undefined;
    return row ? (parseEach([row], (entry) => ProposedMissionSchema.parse(JSON.parse(entry.body_json)), "proposal")[0] ?? null) : null;
  }

  /** Newest first; "decided" (started or dismissed) lists by when it was decided. */
  listProposals(args: { state?: ProposalListFilter; limit?: number } = {}): ProposedMission[] {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const rows = (
      args.state === "decided"
        ? this.db
            .prepare(
              "SELECT body_json FROM mission_proposals WHERE state != 'pending' ORDER BY json_extract(body_json, '$.updatedAt') DESC LIMIT ?",
            )
            .all(limit)
        : args.state
          ? this.db.prepare("SELECT body_json FROM mission_proposals WHERE state = ? ORDER BY created_at DESC LIMIT ?").all(args.state, limit)
          : this.db.prepare("SELECT body_json FROM mission_proposals ORDER BY created_at DESC LIMIT ?").all(limit)
    ) as Array<{ body_json: string }>;
    return parseEach(rows, (row) => ProposedMissionSchema.parse(JSON.parse(row.body_json)), "proposal");
  }

  /**
   * Forgets old history: proposals decided before `decidedBefore`, and seen
   * schedule slots and pull request commits before `seenBefore`. Neither
   * recurs, so forgetting them never proposes anything twice. Issue and
   * triage keys stay: an issue or request can still be open months later.
   */
  pruneProposalHistory(args: { decidedBefore: Date; seenBefore: Date }): { proposals: number; triggers: number } {
    const proposals = this.db
      .prepare("DELETE FROM mission_proposals WHERE state != 'pending' AND json_extract(body_json, '$.updatedAt') < ?")
      .run(args.decidedBefore.toISOString());
    const triggers = this.db
      .prepare("DELETE FROM mission_trigger_seen WHERE (trigger_key LIKE 'schedule:%' OR trigger_key LIKE 'pr:%') AND seen_at < ?")
      .run(args.seenBefore.toISOString());
    return { proposals: Number(proposals.changes ?? 0), triggers: Number(triggers.changes ?? 0) };
  }

  /** Marks trigger occurrences seen and returns the ones that are new. */
  markTriggersSeen(keys: readonly string[], now: Date): string[] {
    if (keys.length === 0) return [];
    return this.inSavepoint("mission_trigger_seen", () => {
      const insert = this.db.prepare("INSERT OR IGNORE INTO mission_trigger_seen (trigger_key, seen_at) VALUES (?, ?)");
      return [...new Set(keys)].filter((key) => Boolean(insert.run(key, now.toISOString()).changes));
    });
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

  private writeMission(mission: Mission, insert: boolean) {
    const values = [
      mission.repositoryPath,
      mission.workspaceId,
      mission.leadTaskId,
      mission.projectId,
      JSON.stringify(mission.playbook),
      mission.assignment,
      JSON.stringify(mission.consent),
      JSON.stringify(mission.fingerprint),
      mission.state,
      mission.pauseReason,
      mission.stopReason,
      mission.reasonDetail,
      mission.currentStageIndex,
      mission.turnCount,
      mission.maxTurns,
      mission.expiresAt,
      mission.createdAt,
      mission.updatedAt,
      mission.origin ?? null,
    ];
    if (insert) {
      this.db
        .prepare(
          `INSERT INTO missions (
             repository_path, workspace_id, lead_task_id, project_id,
             playbook_json, assignment, consent_json, fingerprint_json, state,
             pause_reason, stop_reason, reason_detail, current_stage_index,
             turn_count, max_turns, expires_at, created_at, updated_at, origin, id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...values, mission.id);
      return;
    }
    const result = this.db
      .prepare(
        `UPDATE missions SET
           repository_path = ?, workspace_id = ?, lead_task_id = ?,
           project_id = ?, playbook_json = ?, assignment = ?, consent_json = ?,
           fingerprint_json = ?, state = ?, pause_reason = ?, stop_reason = ?,
           reason_detail = ?, current_stage_index = ?, turn_count = ?,
           max_turns = ?, expires_at = ?, created_at = ?, updated_at = ?,
           origin = ?
         WHERE id = ?`,
      )
      .run(...values, mission.id);
    if (Number(result.changes ?? 0) === 0) {
      throw new Error(`Mission not found: ${mission.id}`);
    }
  }

  private writeStage(record: MissionStageRecord) {
    this.db
      .prepare(
        `INSERT INTO mission_stages (
           mission_id, stage_id, attempt, status, nudged, block_reason, detail,
           feedback, started_at, ended_at, start_head_sha, report_json,
           report_revision, facts_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (mission_id, stage_id, attempt) DO UPDATE SET
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
        record.missionId,
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
  private writeEvent(missionId: string, draft: MissionEventDraft, now: Date): boolean {
    const event = MissionEventSchema.parse({
      id: randomUUID(),
      missionId,
      sequence: 1,
      kind: draft.kind,
      idempotencyKey: draft.idempotencyKey,
      detail: draft.detail,
      createdAt: now.toISOString(),
    });
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO mission_events (
           id, mission_id, sequence, kind, idempotency_key, detail_json, created_at
         ) VALUES (
           ?, ?,
           (SELECT COALESCE(MAX(sequence), 0) + 1 FROM mission_events WHERE mission_id = ?),
           ?, ?, ?, ?
         )`,
      )
      .run(
        event.id,
        missionId,
        missionId,
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
  private pruneEvents(missionId: string) {
    const { count } = this.db
      .prepare("SELECT COUNT(*) AS count FROM mission_events WHERE mission_id = ?")
      .get(missionId) as { count: number };
    const excess = count - MISSION_LIMITS.maxRetainedEvents;
    if (excess <= 0) return;
    this.db
      .prepare(
        `DELETE FROM mission_events WHERE id IN (
           SELECT id FROM mission_events
           WHERE mission_id = ? AND idempotency_key IS NULL
           ORDER BY sequence ASC LIMIT ?
         )`,
      )
      .run(missionId, excess);
  }

  private writeChange(change: MissionChange, now: Date, insert: boolean) {
    this.writeMission(MissionSchema.parse(change.mission), insert);
    for (const record of change.upserts) {
      if (record.missionId !== change.mission.id) {
        throw new Error(`Stage record belongs to mission ${record.missionId}, not ${change.mission.id}.`);
      }
      this.writeStage(MissionStageRecordSchema.parse(record));
    }
    for (const draft of change.events) {
      this.writeEvent(change.mission.id, draft, now);
    }
    if (change.events.length > 0) this.pruneEvents(change.mission.id);
  }

  /**
   * Starts a mission. Refused when the lead task already has a running or
   * paused mission: one active mission per lead task.
   */
  create(change: MissionChange, now: Date): MissionCreateResult {
    return this.inSavepoint("mission_create", () => {
      if (this.getActiveMissionForTask(change.mission.leadTaskId)) {
        return { ok: false, reason: "active-mission-exists", message: SECOND_MISSION_REFUSAL };
      }
      this.writeChange(change, now, true);
      return { ok: true };
    });
  }

  /** Applies a transition from the policy or a user command. */
  apply(change: MissionChange, now: Date) {
    this.inSavepoint("mission_apply", () => this.writeChange(change, now, false));
  }

  /**
   * Records one event outside a transition, such as `action-started` before a
   * Stave action runs. False when its idempotency key was already recorded.
   */
  recordEvent(missionId: string, draft: MissionEventDraft, now: Date): boolean {
    return this.inSavepoint("mission_event", () => {
      const inserted = this.writeEvent(missionId, draft, now);
      if (inserted) this.pruneEvents(missionId);
      return inserted;
    });
  }

  hasEvent(idempotencyKey: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM mission_events WHERE idempotency_key = ?")
        .get(idempotencyKey),
    );
  }

  getMission(id: string): Mission | null {
    const row = this.db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as
      | MissionRow
      | null
      | undefined;
    return row ? parseMissionRow(row) : null;
  }

  getAggregate(id: string): MissionAggregate | null {
    const mission = this.getMission(id);
    if (!mission) return null;
    const rows = this.db
      .prepare(
        "SELECT * FROM mission_stages WHERE mission_id = ? ORDER BY stage_id, attempt",
      )
      .all(id) as MissionStageRow[];
    return { mission, stages: rows.map(parseStageRow) };
  }

  getActiveMissionForTask(leadTaskId: string): Mission | null {
    const row = this.db
      .prepare(
        `SELECT * FROM missions WHERE lead_task_id = ? AND state IN ${ACTIVE_STATES_SQL}`,
      )
      .get(leadTaskId) as MissionRow | null | undefined;
    return row ? parseMissionRow(row) : null;
  }

  listActiveMissions(): Mission[] {
    const rows = this.db
      .prepare(`SELECT * FROM missions WHERE state IN ${ACTIVE_STATES_SQL} ORDER BY created_at`)
      .all() as MissionRow[];
    return parseEach(rows, parseMissionRow, "mission");
  }

  listMissionsForWorkspace(workspaceId: string, limit = 50): Mission[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM missions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, Math.max(1, Math.min(limit, 200))) as MissionRow[];
    return parseEach(rows, parseMissionRow, "mission");
  }

  /** The newest missions across every workspace, for surfaces that span them. */
  /** The missions a project started, newest first. */
  listMissionsForProject(projectId: string, limit = 100): Mission[] {
    const rows = this.db
      .prepare("SELECT * FROM missions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(projectId, Math.max(1, Math.min(limit, 200))) as MissionRow[];
    return parseEach(rows, parseMissionRow, "mission");
  }

  listRecentMissions(limit = 50): Mission[] {
    const rows = this.db
      .prepare("SELECT * FROM missions ORDER BY created_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(limit, 200))) as MissionRow[];
    return parseEach(rows, parseMissionRow, "mission");
  }

  /**
   * One mission's events of the given kinds, in sequence order. Keyed kinds
   * are never pruned, so this is complete for them.
   */
  listEventsByKind(missionId: string, kinds: readonly MissionEventKind[]): MissionEvent[] {
    if (kinds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM mission_events
         WHERE mission_id = ? AND kind IN (${kinds.map(() => "?").join(", ")})
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(missionId, ...kinds, MISSION_LIMITS.maxRetainedEvents) as MissionEventRow[];
    return parseEach(rows, parseEventRow, "mission event");
  }

  /** The newest events of one mission, oldest first. */
  listRecentEvents(missionId: string, limit = 200): MissionEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM mission_events WHERE mission_id = ?
           ORDER BY sequence DESC LIMIT ?
         ) ORDER BY sequence ASC`,
      )
      .all(missionId, Math.max(1, Math.min(limit, MISSION_LIMITS.maxRetainedEvents))) as MissionEventRow[];
    return parseEach(rows, parseEventRow, "mission event");
  }

  /** Events in sequence order, optionally after a sequence the caller has seen. */
  listEvents(missionId: string, args: { afterSequence?: number; limit?: number } = {}): MissionEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mission_events
         WHERE mission_id = ? AND sequence > ?
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(
        missionId,
        args.afterSequence ?? 0,
        Math.max(1, Math.min(args.limit ?? 500, MISSION_LIMITS.maxRetainedEvents)),
      ) as MissionEventRow[];
    return parseEach(rows, parseEventRow, "mission event");
  }
}
