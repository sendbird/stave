import { createHash } from "node:crypto";
import {
  TARS_DEFAULT_VIEW_SETTINGS, TarsClearInputSchema, TarsClearRecordSchema, TarsViewSettingsSchema, normalizeTarsClearRecord, normalizeTarsClearScopes, tarsClearableIds,
  tarsTrayCleared,
  type TarsClearInput, type TarsClearRecord, type TarsTrayCleared, type TarsViewSettings,
} from "../../src/lib/tars/clearing";
import { TARS_AWAY_INITIAL_STATE, TarsAwayStateSchema, mergeTarsAwayState, type TarsAwayState } from "../../src/lib/tars/away-state";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import { TarsChangeSignal, type TarsChangeListener } from "./tars-changes";

interface ViewDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number | bigint };
  };
  transaction<T>(operation: () => T): { (): T; immediate(): T };
}
interface StoredRow { body_json: string; request_hash: string }
type TrayRow = Pick<TarsResponsibility, "id" | "state" | "updatedAt" | "publication">;

function tableExists(db: ViewDatabase, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

/**
 * Ended work that waits on the user's confirmation of a draft pull request:
 * a publish proposal still proposed, or a confirmation still running. Read
 * from the conversation tables on the same connection; none when a store was
 * opened without them.
 */
export function readTarsOpenPublish(db: ViewDatabase): Set<string> {
  const ids = new Set<string>();
  if (tableExists(db, "tars_action_receipts")) for (const row of db.prepare(`SELECT json_extract(body_json, '$.action.responsibilityId') AS id FROM tars_action_receipts
    WHERE json_extract(body_json, '$.action.kind') = 'publish' AND json_extract(body_json, '$.status') = 'proposed'`).all() as Array<{ id: unknown }>) {
    if (typeof row.id === "string") ids.add(row.id);
  }
  if (tableExists(db, "tars_publish_requests")) for (const row of db.prepare(`SELECT json_extract(body_json, '$.responsibilityId') AS id FROM tars_publish_requests
    WHERE json_extract(body_json, '$.status') = 'pending'`).all() as Array<{ id: unknown }>) {
    if (typeof row.id === "string") ids.add(row.id);
  }
  return ids;
}

/**
 * The one saved view row: the settings the user chose and what is remembered
 * about their absence (`away`). Each part is read by itself, so an unreadable
 * part keeps its default without taking the other with it.
 */
function readRow(db: ViewDatabase): Record<string, unknown> {
  if (!tableExists(db, "tars_view_settings")) return {};
  const row = db.prepare("SELECT body_json FROM tars_view_settings WHERE id = 'personal'").get() as Pick<StoredRow, "body_json"> | undefined;
  if (!row) return {};
  try {
    const body: unknown = JSON.parse(row.body_json);
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch { return {}; }
}

/** The view settings saved on this connection; the defaults when none were saved or the table is missing. */
function readSettings(db: ViewDatabase): TarsViewSettings {
  // Unreadable settings keep the defaults rather than hiding or showing work on a guess.
  const parsed = TarsViewSettingsSchema.safeParse({ retentionDays: readRow(db).retentionDays });
  return parsed.success ? parsed.data : TARS_DEFAULT_VIEW_SETTINGS;
}

/** What is saved about the user's absence; nothing seen and no summary when none was saved or it is unreadable. */
function readAway(db: ViewDatabase): TarsAwayState {
  const parsed = TarsAwayStateSchema.safeParse(readRow(db).away);
  return parsed.success ? parsed.data : TARS_AWAY_INITIAL_STATE;
}

function readArchived(db: ViewDatabase): { done: Set<string>; outputs: Set<string> } {
  const archived = { done: new Set<string>(), outputs: new Set<string>() };
  if (!tableExists(db, "tars_archived")) return archived;
  for (const row of db.prepare("SELECT scope, responsibility_id FROM tars_archived").all() as Array<{ scope: string; responsibility_id: string }>) {
    if (row.scope === "done" || row.scope === "outputs") archived[row.scope].add(row.responsibility_id);
  }
  return archived;
}

/** What the tray leaves out now, for the snapshot (`TarsSnapshot.cleared`). */
export function readTarsTrayCleared(db: ViewDatabase, responsibilities: readonly TrayRow[], now: string): TarsTrayCleared {
  return tarsTrayCleared({ responsibilities, archived: readArchived(db), retentionDays: readSettings(db).retentionDays, openPublish: readTarsOpenPublish(db), now });
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Clears and the view settings. Nothing here deletes a message, a decision or
 * a responsibility: a conversation clear is a saved time the view starts
 * after, and a tray clear archives responsibility ids per scope. Undo marks
 * the record undone and drops its archive rows, in one transaction.
 */
export class TarsViewStore {
  private readonly db: ViewDatabase;
  private readonly changes: TarsChangeSignal;

  /** `changes`: the owning store's signal, so its listeners hear clears too. */
  constructor(database: unknown, changes = new TarsChangeSignal()) {
    this.db = database as ViewDatabase;
    this.changes = changes;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tars_view_settings (
        id TEXT PRIMARY KEY CHECK (id = 'personal'), body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tars_clears (
        request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        status TEXT NOT NULL CHECK (status IN ('applied', 'undone')), conversation INTEGER NOT NULL CHECK (conversation IN (0, 1)),
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_clears_conversation ON tars_clears(conversation, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_tars_clears_created ON tars_clears(created_at, request_id);
      CREATE TABLE IF NOT EXISTS tars_archived (
        scope TEXT NOT NULL CHECK (scope IN ('done', 'outputs')), responsibility_id TEXT NOT NULL,
        clear_request_id TEXT NOT NULL, archived_at TEXT NOT NULL, PRIMARY KEY (scope, responsibility_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tars_archived_clear ON tars_archived(clear_request_id);
    `);
  }

  /** IMMEDIATE, as the other Tars stores: main and the host-service share this file and every unit reads before it writes. */
  private write<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  /** Clears and settings change both the conversation view and the snapshot's tray. */
  onChange(listener: TarsChangeListener): () => void {
    return this.changes.subscribe(listener);
  }

  getSettings(): TarsViewSettings {
    return readSettings(this.db);
  }

  /** Writes the row's parts together: saving one never drops the other. */
  private saveRow(parts: { settings?: TarsViewSettings; away?: TarsAwayState }) {
    const row = readRow(this.db);
    const body = { ...(row.retentionDays === undefined ? {} : { retentionDays: row.retentionDays }), ...(row.away === undefined ? {} : { away: row.away }),
      ...parts.settings, ...(parts.away ? { away: parts.away } : {}) };
    this.db.prepare(`INSERT INTO tars_view_settings (id, body_json) VALUES ('personal', ?)
      ON CONFLICT(id) DO UPDATE SET body_json = excluded.body_json`).run(JSON.stringify(body));
  }

  configure(raw: unknown): TarsViewSettings {
    const settings = TarsViewSettingsSchema.parse(raw);
    return this.write(() => {
      this.saveRow({ settings });
      this.changes.emit("conversation", "snapshot");
      return settings;
    });
  }

  /** When the user last saw the end of the conversation, and the "while you were away" summary on screen, if any. */
  getAway(): TarsAwayState {
    return readAway(this.db);
  }

  /**
   * Saves what the window knows about the user's absence, merged with what is
   * saved (`mergeTarsAwayState`): the seen time never moves backward and a
   * dismissed summary stays dismissed. The same state again writes nothing,
   * and nothing is announced: no other surface reads it.
   */
  saveAway(raw: unknown): TarsAwayState {
    const incoming = TarsAwayStateSchema.parse(raw);
    return this.write(() => {
      const saved = readAway(this.db);
      const next = mergeTarsAwayState(saved, incoming);
      if (next !== saved) this.saveRow({ away: next });
      return next;
    });
  }

  private read(row: unknown): TarsClearRecord | null {
    return row ? normalizeTarsClearRecord(TarsClearRecordSchema.parse(JSON.parse((row as StoredRow).body_json))) : null;
  }

  getClear(requestId: string): TarsClearRecord | null {
    return this.read(this.db.prepare("SELECT body_json FROM tars_clears WHERE request_id = ?").get(requestId));
  }

  /** The newest applied conversation clear: the view and Tars's history start after its time. */
  activeConversationClear(): TarsClearRecord | null {
    return this.read(this.db.prepare(`SELECT body_json FROM tars_clears WHERE conversation = 1 AND status = 'applied'
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get());
  }

  /** Clears from `since` on (all when null), oldest first, at most `limit` of the newest. */
  listClears(since: string | null, limit = 100): TarsClearRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The clear limit must be between 1 and 1000.");
    return this.db.prepare(`SELECT body_json FROM tars_clears WHERE (? IS NULL OR created_at >= ?) ORDER BY created_at DESC, rowid DESC LIMIT ?`)
      .all(since, since, limit).map((row) => this.read(row)!).reverse();
  }

  /** The newest applied clear of each tray lane that hid something, whatever its time, oldest first: what each lane's Undo restores. */
  listTrayClears(): TarsClearRecord[] {
    const newest = (scope: "done" | "outputs") => this.read(this.db.prepare(`SELECT body_json FROM tars_clears
      WHERE status = 'applied' AND json_array_length(body_json, '$.${scope}') > 0 ORDER BY created_at DESC, rowid DESC LIMIT 1`).get());
    const records = new Map([newest("done"), newest("outputs")].flatMap((record) => record ? [[record.requestId, record] as const] : []));
    return [...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Applies one clear. Its request id is the retry identity: the same id and
   * scopes return the saved record, other scopes are refused. `hiddenMessages`
   * counts what the conversation scope hides and `inProgress` names the
   * messages it keeps because they are under way; `settleProposal` settles the
   * Tars proposal it confirms in the same transaction.
   */
  clear(rawInput: TarsClearInput, context: {
    responsibilities: readonly TrayRow[];
    now: string;
    hiddenMessages?: () => number;
    inProgress?: () => string[];
    proposal?: { messageId: string; actionIndex: number; settle: () => void };
  }): TarsClearRecord {
    const input = TarsClearInputSchema.parse(rawInput);
    const scopes = normalizeTarsClearScopes(input.scopes);
    const proposal = context.proposal ? { messageId: context.proposal.messageId, actionIndex: context.proposal.actionIndex } : null;
    const requestHash = hash({ scopes, proposal });
    const { now } = context;
    return this.write(() => {
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_clears WHERE request_id = ?").get(input.requestId) as StoredRow | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("This request ID already names a different clear.");
        return this.read(existing)!;
      }
      const tray = { responsibilities: context.responsibilities, archived: readArchived(this.db), retentionDays: readSettings(this.db).retentionDays,
        openPublish: readTarsOpenPublish(this.db), now };
      const ids = (scope: "done" | "outputs") => scopes.includes(scope) ? tarsClearableIds(scope, tray) : undefined;
      const done = ids("done");
      const outputs = ids("outputs");
      const record = TarsClearRecordSchema.parse({ requestId: input.requestId, source: input.source, scopes, proposal, status: "applied",
        ...(scopes.includes("conversation") ? { hiddenMessages: Math.max(0, context.hiddenMessages?.() ?? 0), inProgress: context.inProgress?.() ?? [] } : {}),
        ...(done ? { done } : {}), ...(outputs ? { outputs } : {}), revision: 1, createdAt: now, updatedAt: now });
      const archive = this.db.prepare(`INSERT INTO tars_archived (scope, responsibility_id, clear_request_id, archived_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(scope, responsibility_id) DO UPDATE SET clear_request_id = excluded.clear_request_id, archived_at = excluded.archived_at`);
      for (const id of done ?? []) archive.run("done", id, record.requestId, now);
      for (const id of outputs ?? []) archive.run("outputs", id, record.requestId, now);
      this.db.prepare(`INSERT INTO tars_clears (request_id, request_hash, revision, status, conversation, created_at, body_json)
        VALUES (?, ?, ?, 'applied', ?, ?, ?)`).run(record.requestId, requestHash, record.revision, scopes.includes("conversation") ? 1 : 0, now, JSON.stringify(record));
      context.proposal?.settle();
      this.changes.emit("conversation", "snapshot");
      return record;
    });
  }

  /** Restores what one clear hid. An undone clear is returned as it is, so a retry changes nothing. */
  undo(requestId: string, now: string): TarsClearRecord {
    return this.write(() => {
      const current = this.getClear(requestId);
      if (!current) throw new Error("The clear was not found.");
      if (current.status === "undone") return current;
      const next = TarsClearRecordSchema.parse({ ...current, status: "undone", revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_clears SET revision = ?, status = 'undone', body_json = ? WHERE request_id = ? AND revision = ?")
        .run(next.revision, JSON.stringify(next), requestId, current.revision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The clear changed. Refresh before trying again.");
      // Only rows this clear still owns: a later clear of the same work keeps its own.
      this.db.prepare("DELETE FROM tars_archived WHERE clear_request_id = ?").run(requestId);
      this.changes.emit("conversation", "snapshot");
      return next;
    });
  }
}
