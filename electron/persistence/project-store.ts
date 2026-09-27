/**
 * Durable storage for projects: the project rows, the missions their
 * coordinators proposed, what they learned, and their events.
 *
 * Used by: the project runtime (host service), through `sqlite-store.ts`.
 *
 * Supervisor tables like the mission tables. The missions a project started
 * keep their own rows (with `project_id`); a proposal links a start key to the
 * worktree, task and mission it became, so a repeated start never runs twice.
 */
import { randomUUID } from "node:crypto";
import {
  MissionProposalSchema,
  PROJECT_LIMITS,
  ProjectEventSchema,
  ProjectMemorySchema,
  ProjectSchema,
  type MissionProposal,
  type Project,
  type ProjectEvent,
  type ProjectEventDraft,
  type ProjectMemory,
} from "../../src/lib/projects/domain";

interface ProjectStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface ProjectDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => ProjectStatement;
}

interface JsonRow {
  id: string;
  body_json: string;
}

const MAX_EVENTS_PER_PROJECT = 2_000;

function parseRows<T>(rows: unknown[], parse: (value: unknown) => T, label: string): T[] {
  const values: T[] = [];
  for (const row of rows as JsonRow[]) {
    try {
      values.push(parse(JSON.parse(row.body_json)));
    } catch (error) {
      console.warn(`[projects] skipped an unreadable ${label} row`, error);
    }
  }
  return values;
}

export class ProjectStore {
  private readonly db: ProjectDatabase;

  constructor(database: unknown) {
    this.db = database as ProjectDatabase;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        coordinator_task_id TEXT NOT NULL,
        body_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_coordinator
        ON projects (coordinator_task_id) WHERE state IN ('active', 'paused');
      CREATE TABLE IF NOT EXISTS project_proposals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        start_key TEXT NOT NULL,
        state TEXT NOT NULL,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (project_id, start_key)
      );
      CREATE TABLE IF NOT EXISTS project_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        body_json TEXT NOT NULL,
        UNIQUE (project_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS project_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_trigger_seen (
        project_id TEXT NOT NULL,
        trigger_key TEXT NOT NULL,
        seen_at TEXT NOT NULL,
        PRIMARY KEY (project_id, trigger_key)
      );
    `);
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

  /** Creates a project. Refused when the coordinator task already leads an open one. */
  create(project: Project, event?: ProjectEventDraft): { ok: true } | { ok: false; message: string } {
    const parsed = ProjectSchema.parse(project);
    return this.inSavepoint("project_create", () => {
      if (this.getOpenProjectForCoordinator(parsed.coordinator.taskId)) {
        return { ok: false as const, message: "This task already coordinates a project." };
      }
      this.db
        .prepare("INSERT INTO projects (id, state, coordinator_task_id, body_json, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(parsed.id, parsed.state, parsed.coordinator.taskId, JSON.stringify(parsed), parsed.updatedAt);
      if (event) this.writeEvent(parsed.id, event, new Date(parsed.updatedAt));
      return { ok: true as const };
    });
  }

  update(project: Project, event?: ProjectEventDraft) {
    const parsed = ProjectSchema.parse(project);
    this.inSavepoint("project_update", () => {
      this.db
        .prepare("UPDATE projects SET state = ?, body_json = ?, updated_at = ? WHERE id = ?")
        .run(parsed.state, JSON.stringify(parsed), parsed.updatedAt, parsed.id);
      if (event) this.writeEvent(parsed.id, event, new Date(parsed.updatedAt));
    });
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare("SELECT id, body_json FROM projects WHERE id = ?").get(id);
    return row ? (parseRows([row], ProjectSchema.parse, "project")[0] ?? null) : null;
  }

  getOpenProjectForCoordinator(taskId: string): Project | null {
    const row = this.db
      .prepare("SELECT id, body_json FROM projects WHERE coordinator_task_id = ? AND state IN ('active', 'paused')")
      .get(taskId);
    return row ? (parseRows([row], ProjectSchema.parse, "project")[0] ?? null) : null;
  }

  listProjects(args: { openOnly?: boolean } = {}): Project[] {
    const rows = this.db
      .prepare(
        args.openOnly
          ? "SELECT id, body_json FROM projects WHERE state IN ('active', 'paused') ORDER BY updated_at DESC"
          : "SELECT id, body_json FROM projects ORDER BY updated_at DESC LIMIT 100",
      )
      .all();
    return parseRows(rows, ProjectSchema.parse, "project");
  }

  /**
   * Records a proposal once per start key. Returns the existing one when the
   * coordinator repeats a key, so a retried call never proposes twice.
   */
  upsertProposal(proposal: MissionProposal): { proposal: MissionProposal; created: boolean } {
    const parsed = MissionProposalSchema.parse(proposal);
    return this.inSavepoint("project_proposal", () => {
      const existing = this.getProposalByStartKey(parsed.projectId, parsed.startKey);
      if (existing && existing.id !== parsed.id) return { proposal: existing, created: false };
      if (existing) {
        this.db
          .prepare("UPDATE project_proposals SET state = ?, body_json = ? WHERE id = ?")
          .run(parsed.state, JSON.stringify(parsed), parsed.id);
        return { proposal: parsed, created: false };
      }
      this.db
        .prepare(
          "INSERT INTO project_proposals (id, project_id, start_key, state, body_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(parsed.id, parsed.projectId, parsed.startKey, parsed.state, JSON.stringify(parsed), parsed.createdAt);
      return { proposal: parsed, created: true };
    });
  }

  getProposal(id: string): MissionProposal | null {
    const row = this.db.prepare("SELECT id, body_json FROM project_proposals WHERE id = ?").get(id);
    return row ? (parseRows([row], MissionProposalSchema.parse, "proposal")[0] ?? null) : null;
  }

  getProposalByStartKey(projectId: string, startKey: string): MissionProposal | null {
    const row = this.db
      .prepare("SELECT id, body_json FROM project_proposals WHERE project_id = ? AND start_key = ?")
      .get(projectId, startKey);
    return row ? (parseRows([row], MissionProposalSchema.parse, "proposal")[0] ?? null) : null;
  }

  listProposals(projectId: string): MissionProposal[] {
    const rows = this.db
      .prepare("SELECT id, body_json FROM project_proposals WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId);
    return parseRows(rows, MissionProposalSchema.parse, "proposal");
  }

  /** False when the idempotency key was already recorded. */
  recordEvent(projectId: string, draft: ProjectEventDraft, now: Date): boolean {
    return this.inSavepoint("project_event", () => this.writeEvent(projectId, draft, now));
  }

  /**
   * Marks what a project's triggers have seen — an issue, a pull request
   * state, a schedule slot — and returns the keys that are new. Kept apart
   * from the event log, which is pruned, so nothing seen fires twice.
   */
  markTriggersSeen(projectId: string, keys: readonly string[], now: Date): string[] {
    if (keys.length === 0) return [];
    return this.inSavepoint("project_trigger_seen", () => {
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO project_trigger_seen (project_id, trigger_key, seen_at) VALUES (?, ?, ?)",
      );
      const fresh: string[] = [];
      for (const key of new Set(keys)) {
        const result = insert.run(projectId, key, now.toISOString()) as { changes?: number };
        if (result.changes) fresh.push(key);
      }
      return fresh;
    });
  }

  hasEvent(idempotencyKey: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM project_events WHERE idempotency_key = ?").get(idempotencyKey));
  }

  listEvents(projectId: string, limit = 500): ProjectEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, body_json FROM (
           SELECT id, body_json, sequence FROM project_events WHERE project_id = ?
           ORDER BY sequence DESC LIMIT ?
         ) ORDER BY sequence ASC`,
      )
      .all(projectId, Math.max(1, Math.min(limit, MAX_EVENTS_PER_PROJECT)));
    return parseRows(rows, ProjectEventSchema.parse, "event");
  }

  addMemory(memory: ProjectMemory): boolean {
    const parsed = ProjectMemorySchema.parse(memory);
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM project_memories WHERE project_id = ?").get(parsed.projectId) as {
      count: number;
    };
    if (count.count >= PROJECT_LIMITS.maxMemories) return false;
    const duplicate = this.listMemories(parsed.projectId).some(
      (existing) => existing.content.toLowerCase() === parsed.content.toLowerCase(),
    );
    if (duplicate) return false;
    this.db
      .prepare("INSERT INTO project_memories (id, project_id, status, body_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(parsed.id, parsed.projectId, parsed.status, JSON.stringify(parsed), parsed.createdAt);
    return true;
  }

  setMemoryStatus(id: string, status: ProjectMemory["status"] | "removed"): ProjectMemory | null {
    const row = this.db.prepare("SELECT id, body_json FROM project_memories WHERE id = ?").get(id);
    const memory = row ? parseRows([row], ProjectMemorySchema.parse, "memory")[0] : undefined;
    if (!memory) return null;
    if (status === "removed") {
      this.db.prepare("DELETE FROM project_memories WHERE id = ?").run(id);
      return memory;
    }
    const next = { ...memory, status };
    this.db.prepare("UPDATE project_memories SET status = ?, body_json = ? WHERE id = ?").run(status, JSON.stringify(next), id);
    return next;
  }

  listMemories(projectId: string, args: { acceptedOnly?: boolean } = {}): ProjectMemory[] {
    const rows = this.db
      .prepare(
        args.acceptedOnly
          ? "SELECT id, body_json FROM project_memories WHERE project_id = ? AND status = 'accepted' ORDER BY created_at ASC"
          : "SELECT id, body_json FROM project_memories WHERE project_id = ? ORDER BY created_at ASC",
      )
      .all(projectId);
    return parseRows(rows, ProjectMemorySchema.parse, "memory");
  }

  private writeEvent(projectId: string, draft: ProjectEventDraft, now: Date): boolean {
    const key = draft.idempotencyKey ?? null;
    if (key && this.hasEvent(key)) return false;
    const next = this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM project_events WHERE project_id = ?")
      .get(projectId) as { next: number };
    const event = ProjectEventSchema.parse({
      id: randomUUID(),
      projectId,
      sequence: next.next,
      kind: draft.kind,
      idempotencyKey: key,
      detail: draft.detail,
      createdAt: now.toISOString(),
    });
    this.db
      .prepare(
        "INSERT INTO project_events (id, project_id, sequence, kind, idempotency_key, body_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(event.id, projectId, event.sequence, event.kind, key, JSON.stringify(event));
    this.db
      .prepare(
        `DELETE FROM project_events WHERE project_id = ? AND sequence <= (
           SELECT MAX(sequence) - ? FROM project_events WHERE project_id = ?
         ) AND kind != 'coordinator-woken'`,
      )
      .run(projectId, MAX_EVENTS_PER_PROJECT, projectId);
    return true;
  }
}
