import {
  TARS_EVENT_RETENTION_MS, TARS_FOLLOW_UP_WINDOW_CAP, TARS_FOLLOW_UP_WINDOW_MS, TARS_JUDGMENT_EVENTS, TarsEventSchema, isTarsEventCurrent, tarsEventKey,
  tarsNextWaitCheck, isTarsStageAskingUser, isTarsLimitReached,
  type TarsEvent, type TarsEventInput, type TarsEventStatus, type TarsFollowUpState,
} from "../../src/lib/tars/events";
import { TarsResponsibilitySchema, type TarsResponsibility } from "../../src/lib/tars/types";
import type { TarsChangeSignal } from "./tars-changes";
import { parseTarsDecisionId, tarsMessageTargets, TarsMessageTargetSchema } from "../../src/lib/tars/decisions";

interface InboxDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number | bigint };
  };
  transaction<T>(operation: () => T): { (): T; immediate(): T };
}

/** Messages Tars started by itself; both count against the window cap and the separate follow-up cap. */
const AUTOMATIC_ORIGINS = "('followUp', 'reask')";

/** When the follow-up window opens again (null: open now) and how many automatic turns ran since the user last spoke. */
export interface TarsFollowUpGate { nextWindowAt: string | null; usedTurns: number }

/**
 * The durable event inbox on the connection both Tars stores use. Its key is
 * the event's identity, so a duplicate delivery returns the saved row, and an
 * event whose responsibility already moved past it is kept as superseded.
 * Each event is processed once, inside an IMMEDIATE transaction.
 */
export class TarsEventInbox {
  private readonly db: InboxDatabase;
  private hasMessages = false;

  constructor(database: unknown, private readonly changes?: TarsChangeSignal) {
    this.db = database as InboxDatabase;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tars_events (
        event_key TEXT PRIMARY KEY, responsibility_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_events_status ON tars_events(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_tars_events_responsibility ON tars_events(responsibility_id);
      CREATE TABLE IF NOT EXISTS tars_follow_up_starts (message_id TEXT PRIMARY KEY, started_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_tars_follow_up_starts_at ON tars_follow_up_starts(started_at);
    `);
  }

  /** IMMEDIATE for the same reason as the stores: main and the host each read before they write. Nested, a savepoint. */
  write<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  private read(row: unknown): TarsEvent | null {
    return row ? TarsEventSchema.parse(JSON.parse((row as { body_json: string }).body_json)) : null;
  }

  get(key: string): TarsEvent | null {
    return this.read(this.db.prepare("SELECT body_json FROM tars_events WHERE event_key = ?").get(key));
  }

  private responsibility(id: string): TarsResponsibility | null {
    const row = this.db.prepare("SELECT body_json FROM tars_responsibilities WHERE id = ?").get(id) as { body_json: string } | undefined;
    return row ? TarsResponsibilitySchema.parse(JSON.parse(row.body_json)) : null;
  }

  /**
   * Records one observed change. The same key returns the saved row unchanged.
   * A late event from an older attempt or revision is kept as `superseded`, so
   * it can never start a follow-up or finish newer work. Changes the host
   * settles itself are recorded as `settled`.
   */
  record(input: TarsEventInput, now: string): TarsEvent {
    const key = tarsEventKey(input);
    // A repeated observation is common (every tick); answer it without taking the write lock.
    const known = this.get(key);
    if (known) return known;
    return this.write(() => {
      const existing = this.get(key);
      if (existing) return existing;
      const current = this.responsibility(input.responsibilityId);
      const stale = !current || (input.attempt !== null && current.agentRunId !== null && current.agentRunId !== input.attempt) ||
        (input.kind !== "decisionInvalidated" && current.revision !== input.observedRevision && !isTarsEventCurrent(input, current));
      // The quiet wait of an asking stage is only a fallback: none once its ask reached (or is about to reach) Tars.
      const covered = input.kind === "waitExpired" && current !== null && (isTarsStageAskingUser(current) || isTarsLimitReached(current)) && this.askCovered(input.responsibilityId);
      const status: TarsEventStatus = stale ? "superseded" : TARS_JUDGMENT_EVENTS.has(input.kind) && !covered ? "pending" : "settled";
      const event = TarsEventSchema.parse({ ...input, key, status, messageId: null, createdAt: now, processedAt: status === "pending" ? null : now });
      this.db.prepare("INSERT INTO tars_events (event_key, responsibility_id, kind, status, created_at, body_json) VALUES (?, ?, ?, ?, ?, ?)")
        .run(key, event.responsibilityId, event.kind, event.status, now, JSON.stringify(event));
      this.changes?.emit("snapshot", "conversation");
      return event;
    });
  }

  /**
   * Whether the latest ask of this work is covered by its immediate
   * follow-up: one that started its planner turn. A later ask is a new event,
   * so the latest one is the current ask. Pending, queued, cancelled,
   * coalesced or exhausted, the quiet wait still applies, so an asking stage
   * is never left with neither rule.
   */
  askCovered(responsibilityId: string): boolean {
    const latest = this.read(this.db.prepare(`SELECT body_json FROM tars_events WHERE responsibility_id = ? AND kind IN ('stageAsksUser', 'limitReached')
      ORDER BY rowid DESC LIMIT 1`).get(responsibilityId));
    // Only a follow-up that actually started counts; a merely queued one may still be cancelled.
    return latest?.status === "followedUp" && Boolean(latest.startedAt);
  }

  /**
   * An ask that never reached the model was not covered after all: a quiet
   * wait recorded as covered for the current revision may follow it up.
   */
  private reopenCoveredWaits(event: TarsEvent) {
    if (event.kind !== "stageAsksUser" && event.kind !== "limitReached") return;
    this.db.prepare(`SELECT body_json FROM tars_events
      WHERE responsibility_id = ? AND kind = 'waitExpired' AND status = 'settled'`).all(event.responsibilityId)
      .map((row) => this.read(row)!).filter((wait) => wait.observedRevision === this.responsibility(wait.responsibilityId)?.revision)
      .forEach((wait) => {
        const reopened = TarsEventSchema.parse({ ...wait, status: "pending", processedAt: null });
        this.db.prepare("UPDATE tars_events SET status = 'pending', body_json = ? WHERE event_key = ? AND status = 'settled'")
          .run(JSON.stringify(reopened), wait.key);
      });
  }

  /**
   * Undoes a start for a follow-up that ended before its model call (a
   * cancel, a recheck, a stop or an error): the window start is forgotten and
   * the event no longer says it reached Tars, in one transaction.
   */
  releaseStart(messageId: string, eventKey: string | null): void {
    this.write(() => {
      this.forgetStart(messageId);
      const current = eventKey ? this.get(eventKey) : null;
      if (!current?.startedAt || current.messageId !== messageId) return;
      const next = TarsEventSchema.parse({ ...current, startedAt: null });
      this.db.prepare("UPDATE tars_events SET body_json = ? WHERE event_key = ?").run(JSON.stringify(next), current.key);
      this.reopenCoveredWaits(next);
      this.changes?.emit("snapshot", "conversation");
    });
  }

  /** Records on the event itself that its follow-up started, in the caller's transaction with the start. */
  markStarted(key: string, now: string): void {
    this.write(() => {
      const current = this.get(key);
      if (!current || current.status !== "followedUp" || current.startedAt) return;
      const next = TarsEventSchema.parse({ ...current, startedAt: now });
      this.db.prepare("UPDATE tars_events SET body_json = ? WHERE event_key = ?").run(JSON.stringify(next), key);
    });
  }

  /** Oldest first, so coalescing keeps each responsibility's order. `offset` skips events a pass left pending. */
  listPending(limit = 64, offset = 0): TarsEvent[] {
    return this.db.prepare("SELECT body_json FROM tars_events WHERE status = 'pending' ORDER BY created_at, rowid LIMIT ? OFFSET ?")
      .all(limit, offset).map((row) => this.read(row)!);
  }

  /**
   * Whether the work changed again after this event in a way that needs
   * judgment (a newer event that was not stale when recorded), so this
   * event's episode is no longer the latest.
   */
  hasNewerChange(key: string): boolean {
    const event = this.get(key);
    if (!event) return false;
    const kinds = [...TARS_JUDGMENT_EVENTS].filter((kind) => kind !== "decisionInvalidated");
    // Bookkeeping rows (`settled`: recorded but never judged) and stale ones are not changes.
    return Boolean(this.db.prepare(`SELECT 1 FROM tars_events WHERE responsibility_id = ? AND status NOT IN ('superseded', 'settled')
      AND kind IN (${kinds.map(() => "?").join(", ")})
      AND rowid > (SELECT rowid FROM tars_events WHERE event_key = ?) LIMIT 1`).get(event.responsibilityId, ...kinds, key));
  }

  /** The most recent events, oldest first, for the notices they leave in the conversation. */
  listRecent(limit = 100): TarsEvent[] {
    return this.db.prepare("SELECT body_json FROM tars_events ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.read(row)!).reverse();
  }

  /** Settles a pending event once; anything else is returned unchanged, so a replay never rewrites an outcome. */
  settle(key: string, status: Exclude<TarsEventStatus, "pending">, now: string, messageId: string | null = null): TarsEvent {
    return this.write(() => {
      const current = this.get(key);
      if (!current) throw new Error("The event was not found.");
      if (current.status !== "pending") return current;
      const next = TarsEventSchema.parse({ ...current, status, messageId, processedAt: now });
      this.db.prepare("UPDATE tars_events SET status = ?, body_json = ? WHERE event_key = ? AND status = 'pending'")
        .run(next.status, JSON.stringify(next), key);
      this.changes?.emit("snapshot", "conversation");
      return next;
    });
  }

  /** A started follow-up whose change stopped standing before its model call; it keeps its message id. */
  supersedeFollowUp(key: string, now: string): TarsEvent | null {
    return this.write(() => {
      const current = this.get(key);
      // It never reached the model, so its planner start does not count against the window.
      if (current?.messageId) this.forgetStart(current.messageId);
      if (current) this.reopenCoveredWaits(current);
      if (current?.status !== "followedUp") return current;
      const next = TarsEventSchema.parse({ ...current, status: "superseded", processedAt: now, startedAt: null });
      this.db.prepare("UPDATE tars_events SET status = ?, body_json = ? WHERE event_key = ? AND status = 'followedUp'")
        .run(next.status, JSON.stringify(next), key);
      this.changes?.emit("snapshot", "conversation");
      return next;
    });
  }

  private messagesReady() {
    this.hasMessages ||= Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tars_messages'").get());
    return this.hasMessages;
  }

  /**
   * When the user last acted toward Tars other than by typing: a decision
   * answer, a Confirm or any control click (Tars, Fleet, task view).
   * Automatic controls and Tars-authored closures never replenish the budget.
   */
  private lastUserClickAt(): string | null {
    const tables = new Set((this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
      AND name IN ('tars_action_records', 'tars_decision_answers')`).all() as Array<{ name: string }>).map((row) => row.name));
    const times = [...tables].map((table) => (this.db.prepare(`SELECT MAX(created_at) AS at FROM ${table}
      WHERE json_extract(body_json, '$.source') IN ('click', 'fleet', 'task', 'key', 'words', 'drag')`).get() as { at: string | null }).at);
    return times.reduce<string | null>((latest, at) => at && (!latest || at > latest) ? at : latest, null);
  }

  /**
   * The budget an automatic follow-up draws from: at most
   * `TARS_FOLLOW_UP_WINDOW_CAP` in any rolling window, and the automatic
   * turns since the user's last action (a typed message, a chosen answer, a
   * Confirm or any control click), which restarts the count.
   */
  gate(now: string): TarsFollowUpGate {
    if (!this.messagesReady()) return { nextWindowAt: null, usedTurns: 0 };
    // The window counts planner starts, not message creation: a follow-up
    // queued long ago still counts when it starts. Queued ones count as
    // starting now, so admission never queues more than the window can start.
    const queued = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM tars_messages
      WHERE state = 'queued' AND json_extract(body_json, '$.origin.kind') IN ${AUTOMATIC_ORIGINS}`).get() as { count: number }).count);
    const nextWindowAt = this.windowOpening(now, queued);
    const used = this.db.prepare(`SELECT COUNT(*) AS count FROM tars_messages
      WHERE json_extract(body_json, '$.origin.kind') IN ${AUTOMATIC_ORIGINS} AND created_at > ?
        AND rowid > COALESCE((SELECT MAX(rowid) FROM tars_messages
          WHERE json_extract(body_json, '$.origin.kind') IS NULL OR json_extract(body_json, '$.origin.kind') = 'answer'), 0)`)
      .get(this.lastUserClickAt() ?? "") as { count: number };
    return { nextWindowAt, usedTurns: Number(used.count) };
  }

  /** When the window has room for one more start, given `queued` more starting now; null when it has room now. */
  private windowOpening(now: string, queued = 0): string | null {
    const since = new Date(Date.parse(now) - TARS_FOLLOW_UP_WINDOW_MS).toISOString();
    const starts = (this.db.prepare("SELECT started_at FROM tars_follow_up_starts WHERE started_at > ? ORDER BY started_at")
      .all(since) as Array<{ started_at: string }>).map((row) => row.started_at);
    const all = [...starts, ...Array.from({ length: queued }, () => now)];
    if (all.length < TARS_FOLLOW_UP_WINDOW_CAP) return null;
    return new Date(Date.parse(all[all.length - TARS_FOLLOW_UP_WINDOW_CAP]!) + TARS_FOLLOW_UP_WINDOW_MS).toISOString();
  }

  /** Rolls back the start of an automatic message cancelled before its model call. */
  forgetStart(messageId: string): void {
    this.write(() => { this.db.prepare("DELETE FROM tars_follow_up_starts WHERE message_id = ?").run(messageId); });
  }

  /** When the next automatic planner start is allowed; null when one may start now. */
  startWindowOpening(now: string): string | null {
    return this.windowOpening(now);
  }

  /**
   * Records an automatic message's planner start, in the caller's transaction
   * with its claim. Idempotent per message. Returns false, recording nothing,
   * when the window has no room.
   */
  recordStart(messageId: string, now: string): boolean {
    return this.write(() => {
      if (this.db.prepare("SELECT 1 FROM tars_follow_up_starts WHERE message_id = ?").get(messageId)) return true;
      if (this.windowOpening(now)) return false;
      this.db.prepare("INSERT INTO tars_follow_up_starts (message_id, started_at) VALUES (?, ?)").run(messageId, now);
      return true;
    });
  }

  /** Whether the user wrote to Tars (a typed message or a chosen reply) after this time. */
  userSpokeSince(at: string): boolean {
    if (!this.messagesReady()) return false;
    return Boolean(this.db.prepare(`SELECT 1 FROM tars_messages WHERE created_at > ?
      AND (json_extract(body_json, '$.origin.kind') IS NULL OR json_extract(body_json, '$.origin.kind') = 'answer') LIMIT 1`).get(at));
  }

  /** Only a saved user request or answer about this work supersedes its follow-up. */
  userAddressedSince(responsibilityId: string, at: string): boolean {
    if (!this.messagesReady()) return false;
    const messages = this.db.prepare(`SELECT json_remove(body_json, '$.attachments') AS body_json FROM tars_messages WHERE created_at > ?
      AND ((json_extract(body_json, '$.origin.kind') IS NULL AND json_array_length(body_json, '$.decision.actions') > 0)
        OR json_extract(body_json, '$.origin.kind') = 'answer')`).all(at);
    for (const stored of messages) {
      const message = TarsMessageTargetSchema.parse(JSON.parse((stored as { body_json: string }).body_json));
      if (tarsMessageTargets(message).includes(responsibilityId)) return true;
      if (message.origin?.kind !== "answer") continue;
      const source = parseTarsDecisionId(message.origin.decisionId);
      if (!source || source.kind === "unverifiedCompletion") continue;
      const row = this.db.prepare("SELECT body_json FROM tars_messages WHERE id = ?").get(source.messageId) as { body_json: string } | undefined;
      if (row && tarsMessageTargets(TarsMessageTargetSchema.parse(JSON.parse(row.body_json))).includes(responsibilityId)) return true;
    }
    return Boolean(this.db.prepare(`SELECT 1 FROM tars_action_records WHERE created_at > ?
      AND json_extract(body_json, '$.action.responsibilityId') = ?
      AND json_extract(body_json, '$.source') IN ('click', 'fleet', 'task', 'key', 'words', 'drag') LIMIT 1`).get(at, responsibilityId));
  }

  /** Whether the user acted toward Tars in any way after this time; that restarts the automatic-turn count. */
  userActedSince(at: string): boolean {
    const click = this.lastUserClickAt();
    return (click !== null && click > at) || this.userSpokeSince(at);
  }

  /**
   * Removes processed events older than `maxAgeMs`; pending ones always stay.
   * A late duplicate of a removed event is recorded again and judged against
   * the work's current revision, so it never brings back an old episode.
   */
  prune(now: string, maxAgeMs = TARS_EVENT_RETENTION_MS): number {
    const cutoff = new Date(Date.parse(now) - maxAgeMs).toISOString();
    return this.write(() => {
      // Starts older than the window no longer count against it.
      this.db.prepare("DELETE FROM tars_follow_up_starts WHERE started_at < ?")
        .run(new Date(Date.parse(now) - TARS_FOLLOW_UP_WINDOW_MS).toISOString());
      return Number(this.db.prepare("DELETE FROM tars_events WHERE status <> 'pending' AND created_at < ?").run(cutoff).changes ?? 0);
    });
  }

  /**
   * The tray's view of Tars's next look at each live responsibility. Waiting
   * work without an event for its revision gets `nextCheck` while that time is
   * still ahead; a past time is never shown (the host records the wait then).
   */
  followUpStates(responsibilities: readonly Pick<TarsResponsibility, "id" | "state" | "revision" | "updatedAt" | "stageAsksUser">[], now: string): TarsFollowUpState[] {
    const rows = new Map(responsibilities.map((row) => [row.id, row]));
    const events = this.db.prepare(`SELECT body_json FROM tars_events WHERE status IN ('pending', 'followedUp', 'exhausted')
      ORDER BY rowid DESC LIMIT 500`).all().map((row) => this.read(row)!);
    let gate: TarsFollowUpGate | null = null;
    const seen = new Set<string>();
    const states: TarsFollowUpState[] = [];
    for (const event of events) {
      if (seen.has(event.responsibilityId) || !rows.has(event.responsibilityId) || !TARS_JUDGMENT_EVENTS.has(event.kind)) continue;
      seen.add(event.responsibilityId);
      const base = { responsibilityId: event.responsibilityId, kind: event.kind };
      if (event.status === "pending") {
        gate ??= this.gate(now);
        states.push({ ...base, status: gate.nextWindowAt ? "deferred" : "pending", at: gate.nextWindowAt });
      } else if (event.status === "followedUp" && event.messageId && this.messagesReady()) {
        const message = this.db.prepare("SELECT state FROM tars_messages WHERE id = ?").get(event.messageId) as { state: string } | undefined;
        if (message?.state === "queued" || message?.state === "reasoning") states.push({ ...base, status: "following", at: null });
      } else if (event.status === "exhausted" && !this.userActedSince(event.processedAt ?? event.createdAt)) {
        states.push({ ...base, status: "exhausted", at: null });
      }
    }
    for (const row of rows.values()) {
      const at = tarsNextWaitCheck(row);
      if (!at || at <= now || states.some((state) => state.responsibilityId === row.id) || this.get(tarsEventKey({ kind: "waitExpired", responsibilityId: row.id, episode: String(row.revision) }))) continue;
      if (isTarsStageAskingUser(row) && this.askCovered(row.id)) continue;
      states.push({ responsibilityId: row.id, kind: "waitExpired", status: "nextCheck", at });
    }
    return states.slice(0, 200);
  }
}
