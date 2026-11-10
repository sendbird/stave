import { createHash, randomUUID } from "node:crypto";
import {
  TARS_MESSAGE_FAILURE_TEXT, TARS_STORAGE_BUSY_MESSAGE, parseTarsConfirmationRequestId, tarsConfirmationRequestId, type TarsControlReason, type TarsMessageFailureCode,
  TarsActionReceiptSchema, TarsActionRecordSchema, TarsActInputSchema, TarsDecisionActionSchema, TarsDecisionSchema,
  TarsConversationSettingsSchema, type TarsConversationSettings,
  TarsMessageInputSchema, TarsMessageSchema, TarsReceiptOutcomeSchema, TarsDecisionAnswerSchema, TarsMessageOriginSchema, isTarsAnswerRetryable,
  TarsReprioritizeInputSchema, type TarsReprioritizeInput,
  type TarsActionReceipt, type TarsActionRecord, type TarsActInput, type TarsDecision, type TarsDecisionAction,
  type TarsMessage, type TarsMessageInput, type TarsReceiptOutcome, type TarsDecisionAnswer, type TarsAnswerRefusal, type TarsMessageOrigin,
  type TarsActionReason, TarsMessageViewSchema, type TarsMessageView, type TarsAttachmentSummary, type TarsMessageDelivery, type TarsMessageDeliveryStatus,
} from "../../src/lib/tars/conversation";
import {
  TarsPublishInputSchema, TarsPublishRecordSchema, type TarsPublishInput, type TarsPublishReason, type TarsPublishRecord,
} from "../../src/lib/tars/publication";
import { TarsWorkRequestSchema, type TarsWorkRequest } from "../../src/lib/tars/types";
import { AttachmentContextsSchema, type AttachmentContext } from "../../src/lib/providers/attachment-context";
import { tarsWorkRequestOf } from "../../src/lib/tars/brief";
import { TarsComposerDraftSchema, type TarsComposerDraft } from "../../src/lib/tars/composer-draft";
import { TarsChangeSignal, type TarsChangeListener } from "./tars-changes";
import { readLatestTarsControls, readSettledTarsTargets } from "./tars-proposals";

interface ConversationDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number | bigint };
  };
  transaction<T>(operation: () => T): { (): T; immediate(): T };
}
interface StoredRow { body_json: string; request_hash: string }
interface ViewRow { id: string; body_json: string }
export interface TarsProposalRef { messageId: string; actionIndex: number }

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const STORAGE_BUSY_MESSAGE = TARS_STORAGE_BUSY_MESSAGE;

/**
 * Every unit here takes the write lock first, so a lock failure means the wait
 * outlasted `busy_timeout` before anything changed. It is transient, never an
 * outcome to record. The fixed message survives the host-service boundary.
 */
export class TarsStorageBusyError extends Error {
  constructor() {
    super(STORAGE_BUSY_MESSAGE);
    this.name = "TarsStorageBusyError";
  }
}

export function isTarsStorageBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (typeof code === "string" && code.startsWith("SQLITE_BUSY")) || error.message.includes(STORAGE_BUSY_MESSAGE);
}

/** Messages and proposed decisions survive provider sessions; receipts never imply a replay is safe. */
export class TarsConversationStore {
  private readonly db: ConversationDatabase;
  private readonly changes = new TarsChangeSignal();
  constructor(database: unknown) {
    this.db = database as ConversationDatabase;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tars_conversation_settings (
        id TEXT PRIMARY KEY CHECK (id = 'personal'), body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tars_messages (
        id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0), state TEXT NOT NULL,
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_messages_created ON tars_messages(created_at, id);
      CREATE INDEX IF NOT EXISTS idx_tars_messages_work ON tars_messages(state, created_at);
      CREATE TABLE IF NOT EXISTS tars_action_receipts (
        message_id TEXT NOT NULL, action_index INTEGER NOT NULL CHECK (action_index BETWEEN 0 AND 7),
        request_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0), body_json TEXT NOT NULL,
        PRIMARY KEY (message_id, action_index), FOREIGN KEY (message_id) REFERENCES tars_messages(id)
      );
      CREATE TABLE IF NOT EXISTS tars_action_records (
        request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_action_records_created ON tars_action_records(created_at, request_id);
      CREATE TABLE IF NOT EXISTS tars_decision_answers (
        decision_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK (revision > 0), status TEXT NOT NULL,
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_decision_answers_status ON tars_decision_answers(status, created_at);
      CREATE TABLE IF NOT EXISTS tars_publish_requests (
        request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_publish_requests_created ON tars_publish_requests(created_at, request_id);
      CREATE TABLE IF NOT EXISTS tars_composer_drafts (
        id TEXT PRIMARY KEY CHECK (id = 'personal'), body_json TEXT NOT NULL
      );
    `);
  }

  /**
   * Main and the host-service each hold a connection to this file and every
   * unit reads before it writes. A deferred transaction would fail its first
   * write at once (SQLITE_BUSY_SNAPSHOT, no `busy_timeout` wait) after the other
   * process commits; IMMEDIATE takes the lock first, and nested units become
   * savepoints. See `SqliteStore.persistTaskTurnDelta`.
   */
  private write<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  /**
   * Reports conversation writes. Receipts also change the snapshot: a
   * proposed control is a pending decision until it settles.
   */
  onChange(listener: TarsChangeListener): () => void {
    return this.changes.subscribe(listener);
  }

  getSettings(): TarsConversationSettings | null {
    const row = this.db.prepare("SELECT body_json FROM tars_conversation_settings WHERE id = 'personal'").get() as StoredRow | undefined;
    return row ? TarsConversationSettingsSchema.parse(JSON.parse(row.body_json)) : null;
  }

  configure(rawSettings: unknown): TarsConversationSettings {
    const settings = TarsConversationSettingsSchema.parse(rawSettings);
    this.db.prepare(`INSERT INTO tars_conversation_settings (id, body_json) VALUES ('personal', ?)
      ON CONFLICT(id) DO UPDATE SET body_json = excluded.body_json`).run(JSON.stringify(settings));
    this.changes.emit("conversation");
    return settings;
  }

  private readMessage(row: unknown): TarsMessage | null {
    return row ? TarsMessageSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  get(id: string): TarsMessage | null {
    return this.readMessage(this.db.prepare("SELECT body_json FROM tars_messages WHERE id = ?").get(id));
  }

  /**
   * The text, time and answered question of one message, read without its
   * attachments: what a work unit keeps as its original request
   * (`tarsWorkRequestOf`). Null when the message is gone or has no text.
   */
  workRequestOf(messageId: string): TarsWorkRequest | null {
    const row = this.db.prepare(`SELECT json_extract(body_json, '$.text') AS text, json_extract(body_json, '$.createdAt') AS created_at,
      json_extract(body_json, '$.origin') AS origin_json FROM tars_messages WHERE id = ?`).get(messageId) as
      { text: unknown; created_at: unknown; origin_json: unknown } | undefined;
    if (!row || typeof row.text !== "string" || !row.text || typeof row.created_at !== "string") return null;
    const origin = typeof row.origin_json === "string" ? TarsMessageOriginSchema.safeParse(JSON.parse(row.origin_json)) : null;
    const parsed = TarsWorkRequestSchema.safeParse(tarsWorkRequestOf({ id: messageId, text: row.text, createdAt: row.created_at,
      ...(origin?.success ? { origin: origin.data } : {}) }));
    return parsed.success ? parsed.data : null;
  }

  /**
   * One message's saved attachments, content included, read without the rest
   * of the message: the first turn of a work that carries them reads them
   * here (`tarsRunAttachmentContext`). Empty when the message has none; null
   * when the message is gone.
   */
  attachmentsOf(messageId: string): AttachmentContext[] | null {
    const row = this.db.prepare("SELECT json_extract(body_json, '$.attachments') AS attachments_json FROM tars_messages WHERE id = ?")
      .get(messageId) as { attachments_json: unknown } | undefined;
    if (!row) return null;
    return typeof row.attachments_json === "string" ? AttachmentContextsSchema.parse(JSON.parse(row.attachments_json)) : [];
  }

  /** Return the most recent bounded window in conversation order. */
  list(limit = 100): TarsMessage[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The message limit must be between 1 and 1000.");
    return this.db.prepare("SELECT body_json FROM tars_messages ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readMessage(row)!).reverse();
  }

  /**
   * The same window as `list`, as a window reads it: each attachment's
   * summary (`TarsAttachmentSummary`) instead of its content. SQLite drops the
   * content and measures it, so an image's data is never loaded here.
   */
  listViews(limit = 100): TarsMessageView[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The message limit must be between 1 and 1000.");
    return this.readViews(this.db.prepare(`SELECT id, json_remove(body_json, '$.attachments') AS body_json FROM tars_messages
      ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit) as ViewRow[]).reverse();
  }

  /** When the answered messages in a period were sent, newest first: an indexed range read that loads no message. */
  answeredTimes(args: { from: string; until: string; limit: number }): string[] {
    return (this.db.prepare(`SELECT created_at FROM tars_messages WHERE created_at >= ? AND created_at < ? AND state = 'answered'
      ORDER BY created_at DESC LIMIT ?`).all(args.from, args.until, args.limit) as Array<{ created_at: string }>).map((row) => row.created_at);
  }

  /** The newest message's id, without reading any message. */
  latestId(): string | null {
    return (this.db.prepare("SELECT id FROM tars_messages ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as { id: string } | undefined)?.id ?? null;
  }

  /**
   * Admit history before this request, independent of queue depth or
   * equal/shifted clocks. History is words only: attachments are summaries.
   * `after` (a conversation clear) keeps only messages saved or answered after
   * its time, plus the ones it saved as under way (`keep`), as the
   * conversation view shows them.
   */
  listBefore(messageId: string, limit = 8, after: { at: string; keep: readonly string[] } | null = null): TarsMessageView[] {
    this.requireLimit(limit);
    const at = after?.at ?? null;
    return this.readViews(this.db.prepare(`SELECT id, json_remove(body_json, '$.attachments') AS body_json FROM tars_messages
      WHERE rowid < (SELECT rowid FROM tars_messages WHERE id = ?)
        AND (? IS NULL OR created_at > ? OR json_extract(body_json, '$.updatedAt') > ? OR id IN (SELECT value FROM json_each(?)))
      ORDER BY rowid DESC LIMIT ?`).all(messageId, at, at, at, JSON.stringify(after?.keep ?? []), limit) as ViewRow[]).reverse();
  }

  /** Messages still queued or being answered: what a conversation clear saved now keeps in view whenever their replies land. */
  listInProgressIds(): string[] {
    return (this.db.prepare("SELECT id FROM tars_messages WHERE state IN ('queued', 'reasoning') ORDER BY rowid").all() as Array<{ id: string }>).map((row) => row.id);
  }

  /** Settled messages saved after `after` (any time when null) and at or before `through`: what a conversation clear at `through` hides. */
  countSettledBetween(after: string | null, through: string): number {
    return (this.db.prepare(`SELECT COUNT(*) AS count FROM tars_messages WHERE state NOT IN ('queued', 'reasoning')
      AND created_at <= ? AND (? IS NULL OR created_at > ?)`).get(through, after, after) as { count: number }).count;
  }

  /**
   * Rows read without their attachments, joined with each attachment's
   * summary measured in SQL: a file's UTF-8 bytes, an image's decoded bytes
   * from its base64 length and padding (as `tarsAttachmentSummary` measures).
   */
  private readViews(rows: readonly ViewRow[]): TarsMessageView[] {
    if (!rows.length) return [];
    const summaries = new Map<string, TarsAttachmentSummary[]>();
    const parts = this.db.prepare(`SELECT m.id AS id, json_extract(a.value, '$.type') AS type,
        coalesce(json_extract(a.value, '$.filePath'), json_extract(a.value, '$.label')) AS name,
        coalesce(json_extract(a.value, '$.language'), json_extract(a.value, '$.mimeType')) AS format,
        length(CAST(json_extract(a.value, '$.content') AS BLOB)) AS text_bytes,
        length(json_extract(a.value, '$.dataUrl')) - instr(json_extract(a.value, '$.dataUrl'), ',') AS base64_chars,
        (substr(json_extract(a.value, '$.dataUrl'), -2) = '==') + (substr(json_extract(a.value, '$.dataUrl'), -1) = '=') AS padding
      FROM tars_messages m, json_each(m.body_json, '$.attachments') a
      WHERE m.id IN (SELECT value FROM json_each(?)) ORDER BY m.id, a.key`).all(JSON.stringify(rows.map((row) => row.id))) as Array<{
        id: string; type: string; name: string; format: string; text_bytes: number | null; base64_chars: number | null; padding: number | null }>;
    for (const part of parts) {
      const image = part.type === "image_context";
      const size = image ? Math.max(0, Math.floor((part.base64_chars ?? 0) * 3 / 4) - (part.padding ?? 0)) : part.text_bytes ?? 0;
      summaries.set(part.id, [...(summaries.get(part.id) ?? []), { kind: image ? "image" : "file", name: part.name, type: part.format, size }]);
    }
    return rows.map((row) => {
      const attachments = summaries.get(row.id);
      return TarsMessageViewSchema.parse({ ...JSON.parse(row.body_json), ...(attachments?.length ? { attachments } : {}) });
    });
  }

  /** Scheduling is independent of the recent conversation window. */
  listQueued(limit = 32): TarsMessage[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_messages WHERE state = 'queued' ORDER BY created_at, rowid LIMIT ?")
      .all(limit).map((row) => this.readMessage(row)!);
  }

  listPendingActions(limit = 32): TarsMessage[] {
    this.requireLimit(limit);
    return this.db.prepare(`SELECT m.body_json FROM tars_messages m WHERE ${this.pendingActionsSql()}
      ORDER BY m.created_at, m.rowid LIMIT ?`).all(limit).map((row) => this.readMessage(row)!);
  }

  private requireLimit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The work limit must be between 1 and 1000.");
  }

  private pendingActionsSql() {
    return `m.state = 'answered'
      AND json_array_length(m.body_json, '$.decision.actions') >
        (SELECT COUNT(*) FROM tars_action_receipts r WHERE r.message_id = m.id
          AND json_extract(r.body_json, '$.status') IN ('applied', 'rejected', 'proposed'))`;
  }

  /** The words being written to Tars, kept across views and restarts until a send saves them as a message. */
  getDraft(): TarsComposerDraft | null {
    const row = this.db.prepare("SELECT body_json FROM tars_composer_drafts WHERE id = 'personal'").get() as Pick<StoredRow, "body_json"> | undefined;
    if (!row) return null;
    // An unreadable draft is dropped rather than blocking the composer.
    try {
      const parsed = TarsComposerDraftSchema.safeParse(JSON.parse(row.body_json));
      // A draft whose request is already a message was sent; it is never offered again.
      return parsed.success && !this.isSentRequest(parsed.data.requestId) ? parsed.data : null;
    } catch { return null; }
  }

  /**
   * Saves or (with `null`) deletes the draft. Not a conversation change: the
   * renderer that wrote it already shows it, and announcing every keystroke
   * would make every surface read the conversation again.
   */
  saveDraft(rawDraft: TarsComposerDraft | null): void {
    const draft = rawDraft === null ? null : TarsComposerDraftSchema.parse(rawDraft);
    // A retry of a send whose acknowledgement was lost carries a request that is already a message: that draft is gone, not saved again.
    if (!draft || this.isSentRequest(draft.requestId)) {
      this.db.prepare("DELETE FROM tars_composer_drafts WHERE id = 'personal'").run();
      return;
    }
    this.db.prepare(`INSERT INTO tars_composer_drafts (id, body_json) VALUES ('personal', ?)
      ON CONFLICT(id) DO UPDATE SET body_json = excluded.body_json`).run(JSON.stringify(draft));
  }

  private isSentRequest(requestId: string | null): boolean {
    return requestId !== null && Boolean(this.db.prepare("SELECT 1 FROM tars_messages WHERE request_id = ?").get(requestId));
  }

  /** The draft that sent this request is now a message; a draft with another or no request ID is newer and stays. */
  private clearSentDraft(requestId: string) {
    this.db.prepare("DELETE FROM tars_composer_drafts WHERE id = 'personal' AND json_extract(body_json, '$.requestId') = ?").run(requestId);
  }

  /** `origin` marks a message the user did not type (a chosen reply option, an automatic follow-up); its request id is its identity. */
  create(rawInput: TarsMessageInput, now: string, maxOutstanding?: number, rawOrigin?: TarsMessageOrigin): TarsMessage {
    const input = TarsMessageInputSchema.parse(rawInput);
    const origin = rawOrigin === undefined ? undefined : TarsMessageOriginSchema.parse(rawOrigin);
    // Zod emits the schema's field order, independent of caller object ordering.
    const requestHash = hash(input);
    return this.write(() => {
      const prior = this.db.prepare("SELECT body_json, request_hash FROM tars_messages WHERE request_id = ?")
        .get(input.requestId) as StoredRow | undefined;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new Error("This request ID already names a different message.");
        this.clearSentDraft(input.requestId);
        return this.readMessage(prior)!;
      }
      const settings = this.getSettings();
      if (!settings) throw new Error("Configure the representative model, account and turn limit before sending a message.");
      // Check retries first: saturation must never lose an existing request's acknowledgement.
      if (maxOutstanding !== undefined) {
        this.requireLimit(maxOutstanding);
        const row = this.db.prepare(`SELECT COUNT(*) AS count FROM tars_messages m
          WHERE m.state IN ('queued', 'reasoning') OR (${this.pendingActionsSql()})`).get() as { count: number };
        if (row.count >= maxOutstanding) throw new Error("Too many outstanding messages. Wait or cancel queued work before sending another.");
      }
      const message = TarsMessageSchema.parse({ ...input, ...settings, id: randomUUID(), revision: 1, state: "queued",
        reply: null, error: null, decision: null, ...(origin ? { origin } : {}), createdAt: now, updatedAt: now });
      this.db.prepare(`INSERT INTO tars_messages (id, request_id, request_hash, revision, state, created_at, body_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(message.id, message.requestId, requestHash, message.revision, message.state, now, JSON.stringify(message));
      this.clearSentDraft(message.requestId);
      this.changes.emit("conversation");
      return message;
    });
  }

  private requireRevision(id: string, expectedRevision: number): TarsMessage {
    const message = this.get(id);
    if (!message) throw new Error("The message was not found.");
    if (message.revision !== expectedRevision) throw new Error("The message changed. Refresh before trying again.");
    return message;
  }

  private transition(id: string, expectedRevision: number, allowed: TarsMessage["state"][],
    patch: Pick<TarsMessage, "state" | "reply" | "error" | "decision" | "errorCode">, now: string): TarsMessage {
    return this.write(() => {
      const current = this.requireRevision(id, expectedRevision);
      if (!allowed.includes(current.state)) throw new Error("The message cannot make this state transition.");
      const next = TarsMessageSchema.parse({ ...current, ...patch, revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_messages SET revision = ?, state = ?, body_json = ? WHERE id = ? AND revision = ?")
        .run(next.revision, next.state, JSON.stringify(next), id, expectedRevision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The message changed. Refresh before trying again.");
      this.changes.emit("conversation");
      return next;
    });
  }

  claim(id: string, expectedRevision: number, now: string): TarsMessage {
    return this.transition(id, expectedRevision, ["queued"], { state: "reasoning", reply: null, error: null, decision: null }, now);
  }

  /** Persist the complete proposal before the host admits any action. */
  answer(id: string, expectedRevision: number, rawDecision: TarsDecision, now: string): TarsMessage {
    const decision = TarsDecisionSchema.parse(rawDecision);
    return this.transition(id, expectedRevision, ["reasoning"], { state: "answered", reply: decision.reply, error: null, decision }, now);
  }

  /** `errorCode` names a failure the interface translates; without one `error` is shown as written. */
  fail(id: string, expectedRevision: number, error: string, now: string, errorCode?: TarsMessageFailureCode): TarsMessage {
    return this.transition(id, expectedRevision, ["queued", "reasoning"],
      { state: "failed", reply: null, error, decision: null, errorCode: errorCode ?? null }, now);
  }

  cancel(id: string, expectedRevision: number, now: string): TarsMessage {
    return this.transition(id, expectedRevision, ["queued", "reasoning"], { state: "cancelled", reply: null, error: null, decision: null }, now);
  }

  /** An interrupted model call requires a new user request; it is never silently billed again. */
  recover(now: string): TarsMessage[] {
    return this.write(() => this.db.prepare("SELECT body_json FROM tars_messages WHERE state = 'reasoning'").all()
      .map((entry) => this.readMessage(entry)!)
      .map((message) => this.fail(message.id, message.revision, TARS_MESSAGE_FAILURE_TEXT.interrupted, now, "interrupted")));
  }

  private readReceipt(row: unknown): TarsActionReceipt | null {
    return row ? TarsActionReceiptSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  listReceipts(messageId: string): TarsActionReceipt[] {
    return this.db.prepare("SELECT body_json FROM tars_action_receipts WHERE message_id = ? ORDER BY action_index")
      .all(messageId).map((entry) => this.readReceipt(entry)!);
  }

  /**
   * Fence a failed host delivery without racing a late local effect/receipt commit.
   * Controls are never fenced here: their run effect happens outside this database,
   * so only the host's idempotent retry may settle them. Returns whether any remain.
   */
  rejectUnsettledActions(messageId: string, expectedRevision: number, error: string, now: string): boolean {
    return this.write(() => {
      const message = this.requireRevision(messageId, expectedRevision);
      if (message.state !== "answered" || !message.decision)
        throw new Error("The message has no delegated decision to settle.");
      let controlsPending = false;
      for (const [index, action] of message.decision.actions.entries()) {
        if (action.kind === "control") {
          const status = this.getReceipt(messageId, index)?.status;
          controlsPending ||= status === undefined || status === "pending";
          continue;
        }
        const receipt = this.recordReceipt(messageId, expectedRevision, index, action, now);
        if (receipt.status === "pending") this.settleReceipt(messageId, index, receipt.revision,
          { status: "rejected", error }, now);
      }
      return controlsPending;
    });
  }

  /** A pending receipt records intent only. Reconcile its effect before retrying after a crash. */
  recordReceipt(messageId: string, expectedMessageRevision: number, actionIndex: number,
    rawAction: TarsDecisionAction, now: string): TarsActionReceipt {
    const action = TarsDecisionActionSchema.parse(rawAction);
    const requestHash = hash(action);
    return this.write(() => {
      const message = this.requireRevision(messageId, expectedMessageRevision);
      if (message.state !== "answered" || !message.decision) throw new Error("A decision must be saved before admitting actions.");
      if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= message.decision.actions.length ||
        hash(message.decision.actions[actionIndex]) !== requestHash) throw new Error("The action does not match the saved decision.");
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_action_receipts WHERE message_id = ? AND action_index = ?")
        .get(messageId, actionIndex) as StoredRow | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("This receipt already names a different action.");
        return this.readReceipt(existing)!;
      }
      const receipt = TarsActionReceiptSchema.parse({ messageId, actionIndex, requestHash, action,
        status: "pending", responsibilityId: null, error: null, reason: null, revision: 1, createdAt: now, updatedAt: now });
      this.db.prepare(`INSERT INTO tars_action_receipts (message_id, action_index, request_hash, revision, body_json)
        VALUES (?, ?, ?, ?, ?)`).run(messageId, actionIndex, requestHash, receipt.revision, JSON.stringify(receipt));
      this.changes.emit("conversation", "snapshot");
      return receipt;
    });
  }

  settleReceipt(messageId: string, actionIndex: number, expectedRevision: number,
    rawOutcome: TarsReceiptOutcome, now: string): TarsActionReceipt {
    const outcome = TarsReceiptOutcomeSchema.parse(rawOutcome);
    return this.write(() => {
      const current = this.readReceipt(this.db.prepare("SELECT body_json FROM tars_action_receipts WHERE message_id = ? AND action_index = ?")
        .get(messageId, actionIndex));
      if (!current) throw new Error("The action receipt was not found.");
      if (current.revision !== expectedRevision) throw new Error("The action receipt changed. Refresh before trying again.");
      if (current.status !== "pending") throw new Error("The action receipt has already settled.");
      // An ask grants nothing itself: only an answer applies one of its options.
      if (outcome.status === "applied" && current.action.kind === "ask") throw new Error("A question is never applied by its receipt.");
      if (outcome.status === "applied" && (current.action.kind === "control" || current.action.kind === "reprioritize" || current.action.kind === "show") &&
        outcome.responsibilityId !== current.action.responsibilityId) throw new Error("The outcome names a different responsibility.");
      const next = TarsActionReceiptSchema.parse({ ...current, status: outcome.status,
        responsibilityId: outcome.status === "applied" ? outcome.responsibilityId : null,
        error: outcome.status === "rejected" ? outcome.error : null,
        reason: outcome.status === "rejected" ? outcome.reason ?? null : null, revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare(`UPDATE tars_action_receipts SET revision = ?, body_json = ?
        WHERE message_id = ? AND action_index = ? AND revision = ?`)
        .run(next.revision, JSON.stringify(next), messageId, actionIndex, expectedRevision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The action receipt changed. Refresh before trying again.");
      this.changes.emit("conversation", "snapshot");
      return next;
    });
  }

  getReceipt(messageId: string, actionIndex: number): TarsActionReceipt | null {
    return this.readReceipt(this.db.prepare("SELECT body_json FROM tars_action_receipts WHERE message_id = ? AND action_index = ?")
      .get(messageId, actionIndex));
  }

  /** The callback must synchronously use this same database; no I/O belongs inside this transaction. */
  applyReceipt(messageId: string, actionIndex: number, expectedRevision: number,
    apply: () => { responsibilityId: string | null }, now: string): TarsActionReceipt {
    return this.write(() => {
      const current = this.readReceipt(this.db.prepare("SELECT body_json FROM tars_action_receipts WHERE message_id = ? AND action_index = ?")
        .get(messageId, actionIndex));
      if (!current) throw new Error("The action receipt was not found.");
      // A lost acknowledgement must not execute the same action again.
      if (current.status === "applied") return current;
      if (current.revision !== expectedRevision) throw new Error("The action receipt changed. Refresh before trying again.");
      if (current.status !== "pending") throw new Error("The action receipt has already settled.");
      const message = this.get(messageId);
      if (message?.state !== "answered") throw new Error("The message does not authorize action execution.");
      const outcome = apply();
      const parsed = TarsReceiptOutcomeSchema.parse({ status: "applied", responsibilityId: outcome.responsibilityId });
      return this.settleReceipt(messageId, actionIndex, current.revision, parsed, now);
    });
  }

  private readRecord(row: unknown): TarsActionRecord | null {
    return row ? TarsActionRecordSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  getAction(requestId: string): TarsActionRecord | null {
    return this.readRecord(this.db.prepare("SELECT body_json FROM tars_action_records WHERE request_id = ?").get(requestId));
  }

  /** Records by request id, in one read. */
  getActions(requestIds: readonly string[]): TarsActionRecord[] {
    if (!requestIds.length) return [];
    return this.db.prepare("SELECT body_json FROM tars_action_records WHERE request_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify([...new Set(requestIds)])).map((row) => this.readRecord(row)!);
  }

  /** The most recent direct controls, oldest first, for the conversation timeline. */
  listActions(limit = 100): TarsActionRecord[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_action_records ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readRecord(row)!).reverse();
  }

  /**
   * A pending record is intent only. Its request ID is the retry identity of one click.
   * A confirmation (`confirm:<message>:<index>`) is one user decision whichever
   * surface sends it, so its identity is the action alone: a retry from Fleet,
   * the tray or the conversation joins the first record, which keeps its source.
   */
  recordAction(rawInput: TarsActInput, now: string): TarsActionRecord {
    const { requestId, source, ...control } = TarsActInputSchema.parse(rawInput);
    const action = { kind: "control" as const, ...control };
    const confirmation = parseTarsConfirmationRequestId(requestId) !== null;
    const requestHash = confirmation ? hash(action) : hash({ source, action });
    return this.write(() => {
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_action_records WHERE request_id = ?")
        .get(requestId) as StoredRow | undefined;
      if (existing) {
        const record = this.readRecord(existing)!;
        // Compared by action, so confirmations saved with the earlier source-bound hash still match.
        const same = confirmation ? hash(record.action) === requestHash : existing.request_hash === requestHash;
        if (!same) throw new Error("This request ID already names a different action.");
        return record;
      }
      const record = TarsActionRecordSchema.parse({ requestId, source, requestHash, action, status: "pending",
        error: null, reason: null, revision: 1, createdAt: now, updatedAt: now });
      this.db.prepare("INSERT INTO tars_action_records (request_id, request_hash, revision, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
        .run(requestId, requestHash, record.revision, now, JSON.stringify(record));
      this.changes.emit("conversation");
      return record;
    });
  }

  /**
   * A queue move's pending record, by the same rules as a control's: its
   * request ID is the retry identity, and the same ID naming another move is refused.
   */
  recordMove(rawInput: TarsReprioritizeInput, now: string): TarsActionRecord {
    const { requestId, source, ...move } = TarsReprioritizeInputSchema.parse(rawInput);
    const action = { kind: "move" as const, ...move };
    const requestHash = hash({ source, action });
    return this.write(() => {
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_action_records WHERE request_id = ?")
        .get(requestId) as StoredRow | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("This request ID already names a different action.");
        return this.readRecord(existing)!;
      }
      const record = TarsActionRecordSchema.parse({ requestId, source, requestHash, action, status: "pending",
        error: null, reason: null, revision: 1, createdAt: now, updatedAt: now });
      this.db.prepare("INSERT INTO tars_action_records (request_id, request_hash, revision, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
        .run(requestId, requestHash, record.revision, now, JSON.stringify(record));
      this.changes.emit("conversation");
      return record;
    });
  }

  /** A queue move and its record settle together; `apply` returns the moved work's new priority. A replay never moves it again. */
  applyMove(requestId: string, apply: () => number, now: string): TarsActionRecord {
    return this.write(() => {
      const current = this.getAction(requestId);
      if (current?.status === "applied") return current;
      return this.settleRecord(requestId, { status: "applied", priority: apply() }, now);
    });
  }

  private settleRecord(requestId: string, outcome: { status: "applied"; priority?: number; delivery?: TarsMessageDelivery }
    | { status: "rejected"; reason: TarsControlReason; error: string }, now: string): TarsActionRecord {
    const current = this.getAction(requestId);
    if (!current) throw new Error("The action record was not found.");
    if (current.status !== "pending") throw new Error("The action record has already settled.");
    const rejected = outcome.status === "rejected" ? outcome : null;
    const next = TarsActionRecordSchema.parse({ ...current, status: outcome.status, error: rejected?.error ?? null,
      reason: rejected?.reason ?? null, ...(outcome.status === "applied" && outcome.priority !== undefined ? { priority: outcome.priority } : {}),
      ...(outcome.status === "applied" && outcome.delivery ? { delivery: outcome.delivery } : {}),
      revision: current.revision + 1, updatedAt: now });
    const result = this.db.prepare("UPDATE tars_action_records SET revision = ?, body_json = ? WHERE request_id = ? AND revision = ?")
      .run(next.revision, JSON.stringify(next), requestId, current.revision);
    if (Number(result.changes ?? 0) !== 1) throw new Error("The action record changed. Refresh before trying again.");
    this.changes.emit("conversation");
    return next;
  }

  /** Messages waiting for, or under, delivery to a busy task, oldest first: the delivery queue. */
  listOpenDeliveries(limit = 32): TarsActionRecord[] {
    this.requireLimit(limit);
    return this.db.prepare(`SELECT body_json FROM tars_action_records
      WHERE json_extract(body_json, '$.delivery.status') IN ('queued', 'delivering') ORDER BY created_at, rowid LIMIT ?`)
      .all(limit).map((row) => this.readRecord(row)!);
  }

  /**
   * The oldest open message of each work, in the order those were queued: the
   * only one of its work that may be said next. `after`, the request ID of the
   * last head read, pages on, so heads that must wait (paused or busy work)
   * never hide another work's.
   */
  listDeliveryHeads(limit = 32, after?: string): TarsActionRecord[] {
    this.requireLimit(limit);
    return this.db.prepare(`WITH open AS (
        SELECT rowid AS position, created_at, body_json, ROW_NUMBER() OVER (
          PARTITION BY json_extract(body_json, '$.action.responsibilityId') ORDER BY created_at, rowid) AS place
        FROM tars_action_records WHERE json_extract(body_json, '$.delivery.status') IN ('queued', 'delivering'))
      SELECT body_json FROM open WHERE place = 1
        AND (? IS NULL OR (created_at, position) > (SELECT created_at, rowid FROM tars_action_records WHERE request_id = ?))
      ORDER BY created_at, position LIMIT ?`)
      .all(after ?? null, after ?? null, limit).map((row) => this.readRecord(row)!);
  }

  /** Whether any message still waits for, or is under, delivery to this responsibility's task. */
  hasOpenDelivery(responsibilityId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM tars_action_records WHERE json_extract(body_json, '$.delivery.status') IN ('queued', 'delivering')
      AND json_extract(body_json, '$.action.responsibilityId') = ? LIMIT 1`).get(responsibilityId) != null;
  }

  /**
   * Moves one message's delivery on, only from the given statuses, in one
   * immediate transaction: the delivery queue's compare-and-set. Returns the
   * record, or null when its delivery was not in one of them (another pass or
   * a control settled it first).
   */
  transitionDelivery(requestId: string, from: readonly TarsMessageDeliveryStatus[],
    next: { status: TarsMessageDeliveryStatus; turnId?: string; reason?: TarsControlReason; error?: string }, now: string): TarsActionRecord | null {
    return this.write(() => {
      const current = this.getAction(requestId);
      if (!current?.delivery || !from.includes(current.delivery.status)) return null;
      const settledOtherwise = next.status === "failed" || next.status === "cancelled";
      const delivery: TarsMessageDelivery = { ...current.delivery, status: next.status,
        ...(next.turnId !== undefined ? { turnId: next.turnId } : {}),
        reason: settledOtherwise ? next.reason ?? "unknown" : null, error: settledOtherwise ? (next.error ?? "The message was not delivered.").slice(0, 2_000) : null, updatedAt: now };
      const record = TarsActionRecordSchema.parse({ ...current, delivery, revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_action_records SET revision = ?, body_json = ? WHERE request_id = ? AND revision = ?")
        .run(record.revision, JSON.stringify(record), requestId, current.revision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The action record changed. Refresh before trying again.");
      this.changes.emit("conversation");
      return record;
    });
  }

  /**
   * Settles every message still open for one responsibility, as a control or
   * observation that takes the work away does, in one transaction. A queued
   * one is cancelled. One under way counts as said only when `reached`
   * confirms its run took that message's own turn; otherwise it is cancelled
   * too, so it is never said later (after a hand-back, say). Returns how many it cancelled.
   */
  cancelOpenDeliveries(responsibilityId: string, reason: TarsControlReason, error: string, now: string,
    reached: (record: TarsActionRecord) => boolean = () => false): number {
    return this.write(() => {
      const open = this.db.prepare(`SELECT body_json FROM tars_action_records WHERE json_extract(body_json, '$.delivery.status') IN ('queued', 'delivering')
        AND json_extract(body_json, '$.action.responsibilityId') = ? ORDER BY created_at, rowid`).all(responsibilityId).map((row) => this.readRecord(row)!);
      let cancelled = 0;
      for (const record of open) {
        const said = record.delivery!.status === "delivering" && reached(record);
        const settled = this.transitionDelivery(record.requestId, [record.delivery!.status], said ? { status: "delivered" } : { status: "cancelled", reason, error }, now);
        if (settled && !said) cancelled++;
      }
      return cancelled;
    });
  }

  /**
   * Whether this proposal still speaks for its responsibility, by the
   * snapshot's rule: it belongs to the newest message that proposed a control
   * for it, and no other decision of that message on the same work was answered.
   */
  isCurrentProposal(ref: TarsProposalRef): boolean {
    const receipt = this.getReceipt(ref.messageId, ref.actionIndex);
    if (receipt?.action.kind !== "control") return false;
    const latest = readLatestTarsControls(this.db, receipt.action.responsibilityId).get(receipt.action.responsibilityId) ?? [];
    if (!latest.some((entry) => entry.messageId === ref.messageId && entry.actionIndex === ref.actionIndex)) return false;
    // Its own confirmation record exists while it is checked, so it is left out.
    return !readSettledTarsTargets(this.db, [ref.messageId], tarsConfirmationRequestId(ref.messageId, ref.actionIndex)).has(`${ref.messageId}:${receipt.action.responsibilityId}`);
  }

  /** A confirming click settles the proposal it confirms; `proposal` names it. */
  rejectAction(requestId: string, reason: TarsControlReason, error: string, now: string, proposal?: TarsProposalRef): TarsActionRecord {
    return this.write(() => {
      const record = this.settleRecord(requestId, { status: "rejected", reason, error }, now);
      if (proposal) this.settleProposal(proposal, { status: "rejected", error, reason }, now);
      return record;
    });
  }

  /**
   * Effect, record and any confirmed proposal settle together; a replayed
   * applied record never runs its effect again. `queue` names the run a
   * message waits for when its task was busy: the record is applied with its
   * words queued for delivery (`TarsMessageDelivery`) instead of said now.
   */
  applyAction(requestId: string, apply: () => void, now: string, proposal?: TarsProposalRef, queue?: { agentRunId: string }): TarsActionRecord {
    return this.write(() => {
      const current = this.getAction(requestId);
      if (current?.status === "applied") return current;
      apply();
      const record = this.settleRecord(requestId, { status: "applied", ...(queue ? { delivery: { status: "queued", agentRunId: queue.agentRunId,
        reason: null, error: null, queuedAt: now, updatedAt: now } } : {}) }, now);
      if (proposal) this.settleProposal(proposal, { status: "applied", responsibilityId: record.action.responsibilityId }, now);
      return record;
    });
  }

  /**
   * The clear proposal a confirmation applies, settled with the clear in the
   * caller's transaction. Throws unless it is that exact proposal and still waits.
   */
  settleClearProposal(ref: TarsProposalRef, scopes: readonly string[], now: string): TarsActionReceipt {
    const current = this.getReceipt(ref.messageId, ref.actionIndex);
    if (current?.action.kind !== "clear" || current.status !== "proposed") throw new Error("The clear proposal is not awaiting confirmation.");
    if ([...current.action.scopes].sort().join() !== [...scopes].sort().join()) throw new Error("The confirmation names other scopes than the proposal.");
    const next = TarsActionReceiptSchema.parse({ ...current, status: "applied", responsibilityId: null, error: null, reason: null,
      revision: current.revision + 1, updatedAt: now });
    const result = this.db.prepare(`UPDATE tars_action_receipts SET revision = ?, body_json = ?
      WHERE message_id = ? AND action_index = ? AND revision = ?`).run(next.revision, JSON.stringify(next), ref.messageId, ref.actionIndex, current.revision);
    if (Number(result.changes ?? 0) !== 1) throw new Error("The action receipt changed. Refresh before trying again.");
    this.changes.emit("conversation");
    return next;
  }

  /** Only the confirming click moves a proposal on; it is never applied by the conversation itself. */
  private settleProposal(ref: TarsProposalRef, outcome: { status: "applied"; responsibilityId: string } | { status: "rejected"; error: string; reason: TarsActionReason },
    now: string): TarsActionReceipt {
    const current = this.getReceipt(ref.messageId, ref.actionIndex);
    if (current?.status !== "proposed") throw new Error("The proposal is not awaiting confirmation.");
    const next = TarsActionReceiptSchema.parse({ ...current, status: outcome.status,
      responsibilityId: outcome.status === "applied" ? outcome.responsibilityId : null,
      error: outcome.status === "rejected" ? outcome.error : null, reason: outcome.status === "rejected" ? outcome.reason : null,
      revision: current.revision + 1, updatedAt: now });
    const result = this.db.prepare(`UPDATE tars_action_receipts SET revision = ?, body_json = ?
      WHERE message_id = ? AND action_index = ? AND revision = ?`)
      .run(next.revision, JSON.stringify(next), ref.messageId, ref.actionIndex, current.revision);
    if (Number(result.changes ?? 0) !== 1) throw new Error("The action receipt changed. Refresh before trying again.");
    this.changes.emit("conversation", "snapshot");
    return next;
  }

  private readPublish(row: unknown): TarsPublishRecord | null {
    return row ? TarsPublishRecordSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  getPublish(requestId: string): TarsPublishRecord | null {
    return this.readPublish(this.db.prepare("SELECT body_json FROM tars_publish_requests WHERE request_id = ?").get(requestId));
  }

  /** The most recent publish confirmations, oldest first, for the conversation timeline. */
  listPublishes(limit = 100): TarsPublishRecord[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_publish_requests ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readPublish(row)!).reverse();
  }

  /**
   * Records one confirmation's intent before any git or GitHub command runs.
   * Its request id is the retry identity: a repeated click joins the first
   * record. A word proposal's confirmation (`publish:<message>:<index>`) is one
   * decision whichever surface sends it, so any retry of it joins the first.
   */
  recordPublish(rawInput: TarsPublishInput, proposal: TarsProposalRef | null, now: string): TarsPublishRecord {
    const { requestId, source, ...request } = TarsPublishInputSchema.parse(rawInput);
    const requestHash = hash({ proposal, ...request });
    return this.write(() => {
      const existing = this.db.prepare("SELECT body_json, request_hash FROM tars_publish_requests WHERE request_id = ?")
        .get(requestId) as StoredRow | undefined;
      if (existing) {
        if (!proposal && existing.request_hash !== requestHash) throw new Error("This request ID already names a different publish.");
        return this.readPublish(existing)!;
      }
      const record = TarsPublishRecordSchema.parse({ requestId, source, requestHash, ...request, proposal, status: "pending",
        reason: null, error: null, url: null, number: null, revision: 1, createdAt: now, updatedAt: now });
      this.db.prepare("INSERT INTO tars_publish_requests (request_id, request_hash, revision, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
        .run(requestId, requestHash, record.revision, now, JSON.stringify(record));
      this.changes.emit("conversation");
      return record;
    });
  }

  /** Whether a publish proposal still waits for its confirmation, or that confirmation already has its record. */
  isPublishProposalOpen(ref: TarsProposalRef, requestId: string): boolean {
    const receipt = this.getReceipt(ref.messageId, ref.actionIndex);
    return receipt?.action.kind === "publish" && (receipt.status === "proposed" || this.getPublish(requestId) !== null);
  }

  /**
   * Settles a confirmation once, with the proposal it confirmed. A settled
   * record is returned as it is, so a replayed outcome changes nothing.
   */
  settlePublish(requestId: string, outcome: { status: "applied"; url: string; number: number | null; existing?: boolean }
    | { status: "rejected"; reason: TarsPublishReason; error: string }, now: string): TarsPublishRecord {
    return this.write(() => {
      const current = this.getPublish(requestId);
      if (!current) throw new Error("The publish record was not found.");
      if (current.status !== "pending") return current;
      const applied = outcome.status === "applied" ? outcome : null;
      const rejected = outcome.status === "rejected" ? outcome : null;
      const next = TarsPublishRecordSchema.parse({ ...current, status: outcome.status, reason: rejected?.reason ?? null,
        error: rejected?.error.slice(0, 2_000) ?? null, url: applied?.url ?? null, number: applied?.number ?? null,
        ...(applied?.existing ? { existing: true } : {}), revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_publish_requests SET revision = ?, body_json = ? WHERE request_id = ? AND revision = ?")
        .run(next.revision, JSON.stringify(next), requestId, current.revision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The publish record changed. Refresh before trying again.");
      if (current.proposal && this.getReceipt(current.proposal.messageId, current.proposal.actionIndex)?.status === "proposed") {
        this.settleProposal(current.proposal, rejected ? { status: "rejected", error: next.error!, reason: rejected.reason }
          : { status: "applied", responsibilityId: current.responsibilityId }, now);
      }
      this.changes.emit("conversation");
      return next;
    });
  }

  private readAnswer(row: unknown): TarsDecisionAnswer | null {
    return row ? TarsDecisionAnswerSchema.parse(JSON.parse((row as StoredRow).body_json)) : null;
  }

  getAnswer(decisionId: string): TarsDecisionAnswer | null {
    return this.readAnswer(this.db.prepare("SELECT body_json FROM tars_decision_answers WHERE decision_id = ?").get(decisionId));
  }

  /** The most recent answers, oldest first, for the conversation's decision cards. */
  listAnswers(limit = 100): TarsDecisionAnswer[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_decision_answers ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit).map((row) => this.readAnswer(row)!).reverse();
  }

  /** Answers whose effect has not settled yet (a lost host acknowledgement); retried with their first source. */
  listPendingAnswers(limit = 32): TarsDecisionAnswer[] {
    this.requireLimit(limit);
    return this.db.prepare("SELECT body_json FROM tars_decision_answers WHERE status = 'pending' ORDER BY created_at, rowid LIMIT ?")
      .all(limit).map((row) => this.readAnswer(row)!);
  }

  /** Answers by decision id, in one read. */
  getAnswers(decisionIds: readonly string[]): TarsDecisionAnswer[] {
    if (!decisionIds.length) return [];
    return this.db.prepare("SELECT body_json FROM tars_decision_answers WHERE decision_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify([...new Set(decisionIds)])).map((row) => this.readAnswer(row)!);
  }

  /**
   * Records the answer to a decision. Its identity is the decision: the same
   * option again returns the saved answer (a retry), a different option is
   * refused and changes nothing. After a retryable refusal the decision is
   * open again: a new attempt replaces it under its own act request id
   * (`<id>:<attempt>`), since the refused request id stays settled.
   */
  recordAnswer(raw: Pick<TarsDecisionAnswer, "decisionId" | "optionIndex" | "source" | "effect" | "label" | "actRequestId">, now: string):
    { answer: TarsDecisionAnswer; refusal: TarsAnswerRefusal | null } {
    return this.write(() => {
      const existing = this.getAnswer(raw.decisionId);
      if (existing && !isTarsAnswerRetryable(existing))
        return { answer: existing, refusal: existing.optionIndex === raw.optionIndex ? null : "alreadyAnswered" };
      const attempt = existing ? (existing.attempt ?? 1) + 1 : undefined;
      const answer = TarsDecisionAnswerSchema.parse({ ...raw, actRequestId: raw.actRequestId && attempt ? `${raw.actRequestId}:${attempt}` : raw.actRequestId,
        ...(attempt ? { attempt } : {}), status: "pending", reason: null, error: null, messageId: null,
        revision: existing ? existing.revision + 1 : 1, createdAt: now, updatedAt: now });
      if (existing) this.db.prepare("UPDATE tars_decision_answers SET revision = ?, status = ?, body_json = ? WHERE decision_id = ? AND revision = ?")
        .run(answer.revision, answer.status, JSON.stringify(answer), answer.decisionId, existing.revision);
      else this.db.prepare("INSERT INTO tars_decision_answers (decision_id, revision, status, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
        .run(answer.decisionId, answer.revision, answer.status, now, JSON.stringify(answer));
      // An answer ends the decision's wait, so the snapshot's pending decisions change too.
      this.changes.emit("conversation", "snapshot");
      return { answer, refusal: null };
    });
  }

  /** Settles an answer once; a settled answer is returned unchanged, so a retry never rewrites its outcome. */
  settleAnswer(decisionId: string, outcome: { status: "applied"; messageId?: string } | { status: "rejected"; reason: TarsControlReason | null; error: string },
    now: string): TarsDecisionAnswer {
    return this.write(() => {
      const current = this.getAnswer(decisionId);
      if (!current) throw new Error("The answer was not found.");
      if (current.status !== "pending") return current;
      const next = TarsDecisionAnswerSchema.parse({ ...current, status: outcome.status,
        reason: outcome.status === "rejected" ? outcome.reason : null, error: outcome.status === "rejected" ? outcome.error : null,
        messageId: outcome.status === "applied" ? outcome.messageId ?? current.messageId : current.messageId,
        revision: current.revision + 1, updatedAt: now });
      const result = this.db.prepare("UPDATE tars_decision_answers SET revision = ?, status = ?, body_json = ? WHERE decision_id = ? AND revision = ?")
        .run(next.revision, next.status, JSON.stringify(next), decisionId, current.revision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The answer changed. Refresh before trying again.");
      this.changes.emit("conversation", "snapshot");
      return next;
    });
  }
}
