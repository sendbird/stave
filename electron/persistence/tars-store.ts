import { tarsGoalReached } from "../../src/lib/tars/completion";
import { createHash, randomUUID } from "node:crypto";
import {
  TarsActivitySchema, type TarsActivity,
  AdmittedTarsResponsibilityInputSchema,
  TarsIdentitySchema,
  TarsResponsibilityPatchSchema,
  TarsResponsibilitySchema,
  UpdateTarsIdentityInputSchema,
  type AdmittedTarsResponsibilityInput,
  type TarsIdentity,
  type TarsPendingDecision,
  type TarsResponsibility,
  type TarsResponsibilityPatch,
  type TarsSnapshot,
  type UpdateTarsIdentityInput,
} from "../../src/lib/tars/types";
import { hasTarsDecisionTables, readLatestTarsControls, readMovedOnTarsMessages, readOpenTarsAsks, readSettledTarsTargets, readTarsAnswers, readTarsPrAskTarget } from "./tars-proposals";
import { isTarsAnswerSettling, tarsAskDecisionId, tarsUnverifiedDecisionId } from "../../src/lib/tars/decisions";
import { tarsConfirmationRequestId } from "../../src/lib/tars/conversation";
import { isTarsResponsibilityTerminal } from "../../src/lib/tars/attention";
import { TarsChangeSignal, type TarsChangeListener } from "./tars-changes";
import { TarsEventInbox } from "./tars-event-inbox";
import { classifyTarsTransition, type TarsEvent, type TarsEventInput } from "../../src/lib/tars/events";
import { readTarsTrayCleared, TarsViewStore } from "./tars-view-store";
import { TarsScheduleStore } from "./tars-schedule-store";
import { TARS_IDENTITY_UNSAVED_AT } from "../../src/lib/tars/default-instructions";

interface TarsDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number | bigint };
  };
  transaction<T>(operation: () => T): { (): T; immediate(): T };
}

interface StoredRow { body_json: string; request_hash: string }

/** The code fields to save; an uncoded detail stores none, so its row keeps its earlier shape. */
function detailCodeOf(value: Pick<TarsResponsibilityPatch, "detailCode" | "detailParams">) {
  return value.detailCode ? { detailCode: value.detailCode, ...(value.detailParams ? { detailParams: value.detailParams } : {}) } : {};
}

/** Keeps obligations independently of replaceable provider conversations and runs. */
export class TarsStore {
  private readonly db: TarsDatabase;
  private readonly changes = new TarsChangeSignal();
  private hasReceipts = false;
  private hasDecisionTables = false;
  /** The event inbox on this same connection; a responsibility change and its event commit together. */
  readonly events: TarsEventInbox;
  /** Clears and view settings on this same connection; they report through this store's changes. */
  readonly view: TarsViewStore;
  /** The schedules Tars created, their confirmations and their runs, on this same connection. */
  readonly schedules: TarsScheduleStore;
  /** The clock the snapshot reads the follow-up window with; tests pass their own. */
  private readonly now: () => string;

  constructor(database: unknown, options: { now?: () => string } = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.db = database as TarsDatabase;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tars_activity (
        id TEXT PRIMARY KEY, responsibility_id TEXT NOT NULL, revision INTEGER NOT NULL,
        body_json TEXT NOT NULL, UNIQUE(responsibility_id, revision)
      );
      CREATE TABLE IF NOT EXISTS tars_identity (
        id TEXT PRIMARY KEY CHECK (id = 'personal'),
        body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tars_responsibilities (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        priority INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tars_responsibilities_queue
        ON tars_responsibilities(priority DESC, created_at ASC, id ASC);
    `);
    this.db.prepare("INSERT OR IGNORE INTO tars_identity (id, body_json) VALUES ('personal', ?)")
      .run(JSON.stringify({ id: "personal", name: "Tars", instructions: "", updatedAt: TARS_IDENTITY_UNSAVED_AT }));
    this.events = new TarsEventInbox(this.db, this.changes);
    this.view = new TarsViewStore(this.db, this.changes);
    this.schedules = new TarsScheduleStore(this.db, this.changes);
  }

  /** Records an observation that is not a saved change (an expired wait); idempotent by its key. */
  recordEvent(input: TarsEventInput, now: string): TarsEvent {
    return this.events.record(input, now);
  }

  /**
   * Main and the host-service share this file and each unit reads before it
   * writes, so it takes the write lock first (IMMEDIATE) instead of failing
   * with SQLITE_BUSY_SNAPSHOT after the other process commits. Nested in a
   * caller's transaction it is a savepoint. See `SqliteStore.persistTaskTurnDelta`.
   */
  private write<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  /** Reports responsibility and identity writes, and the activity entries they journal. */
  onChange(listener: TarsChangeListener): () => void {
    return this.changes.subscribe(listener);
  }

  listActivity(limit = 100): TarsActivity[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("The activity limit must be between 1 and 1000.");
    return this.db.prepare("SELECT body_json FROM tars_activity ORDER BY rowid DESC LIMIT ?").all(limit)
      .map((row) => TarsActivitySchema.parse(JSON.parse((row as StoredRow).body_json))).reverse();
  }

  private journal(row: TarsResponsibility, now: string, prChecks?: import("../../src/lib/tars/pr-checks").TarsPrChecks) {
    const event = TarsActivitySchema.parse({ id: randomUUID(), responsibilityId: row.id, revision: row.revision,
      title: row.title, state: row.state, detail: row.detail, ...detailCodeOf(row), ...(prChecks ? { prChecks } : {}), createdAt: now });
    this.db.prepare("INSERT INTO tars_activity (id, responsibility_id, revision, body_json) VALUES (?, ?, ?, ?)")
      .run(event.id, event.responsibilityId, event.revision, JSON.stringify(event));
    // The conversation timeline shows activity.
    this.changes.emit("conversation");
  }

  private readResponsibility(row: unknown): TarsResponsibility | null {
    if (!row) return null;
    return this.restoreCompletion(TarsResponsibilitySchema.parse(JSON.parse((row as StoredRow).body_json)));
  }

  private restoreCompletion(saved: TarsResponsibility): TarsResponsibility {
    // Older completion records establish an execution result, not a requested goal.
    // Read conservatively without rewriting history or its idempotency hash.
    const external = saved.completionGoal === "pullRequest" || saved.completionGoal === "merge";
    const accepted = !external && (saved.completionConfirmedAt || saved.detailCode === "acceptedWithoutVerification");
    return saved.state === "completed" && !tarsGoalReached(saved) && !accepted ? { ...saved, state: "resultReady" } : saved;
  }

  get(id: string): TarsResponsibility | null {
    return this.readResponsibility(this.db.prepare("SELECT body_json FROM tars_responsibilities WHERE id = ?").get(id));
  }

  snapshot(): TarsSnapshot {
    const row = this.db.prepare("SELECT body_json FROM tars_identity WHERE id = 'personal'").get() as StoredRow | undefined;
    if (!row) throw new Error("The personal supervisor identity is missing.");
    const responsibilities = this.db.prepare("SELECT body_json FROM tars_responsibilities ORDER BY priority DESC, created_at ASC, id ASC")
      .all().map((entry) => this.readResponsibility(entry)!);
    return {
      identity: TarsIdentitySchema.parse(JSON.parse(row.body_json)),
      responsibilities,
      pendingDecisions: this.pendingDecisions(responsibilities),
      followUps: this.events.followUpStates(responsibilities.filter((entry) => !isTarsResponsibilityTerminal(entry)), this.now()),
      cleared: readTarsTrayCleared(this.db, responsibilities, this.now()),
      runtime: "desktop",
    };
  }

  /**
   * Decisions waiting on the user that are bound to a responsibility, in one
   * list for Fleet and the tray. The receipts and answers live in the
   * conversation store's tables on this same connection; a store opened
   * without them (tests, a fresh profile) has none.
   *
   * - `confirm`: model-proposed controls still waiting for Confirm. Only
   *   controls from the newest message that proposed one for the
   *   responsibility can wait (`readLatestTarsControls`), only while still
   *   proposed, no other decision of their message was answered, the
   *   responsibility has not ended, its revision is current, no answer,
   *   dismissal or withdrawal closed it and the user has not sent a newer
   *   message since (the conversation moved on). The host refuses to confirm
   *   any other.
   * - `unverifiedCompletion`: work blocked because Stave could not verify its
   *   completion, until answered, dismissed or changed. A dismissed one leaves
   *   the work blocked, so it shows as blocked work with its own controls.
   * - `ask`: an unanswered question of the newest message whose control
   *   options all still target current revisions. A question about no work
   *   stays in the conversation only. Host PR review and CI-limit questions
   *   stay bound to the current published head even after execution completes.
   */
  private pendingDecisions(responsibilities: readonly TarsResponsibility[]): TarsPendingDecision[] {
    if (!this.hasReceipts) {
      this.hasReceipts = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tars_action_receipts'").get());
      if (!this.hasReceipts) return [];
    }
    this.hasDecisionTables ||= hasTarsDecisionTables(this.db);
    const rows = new Map(responsibilities.map((entry) => [entry.id, entry]));
    const live = (id: string, revision: number, operation?: string) => { const owner = rows.get(id); return Boolean(owner) && (!isTarsResponsibilityTerminal(owner!) || owner!.state === "completed" && operation === "message") && owner!.revision === revision; };
    const proposals = [...readLatestTarsControls(this.db).values()].flat()
      .filter((receipt) => receipt.status === "proposed" && receipt.action.kind === "control");
    const settled = this.hasDecisionTables ? readSettledTarsTargets(this.db, proposals.map((receipt) => receipt.messageId)) : new Set<string>();
    const answered = this.hasDecisionTables ? readTarsAnswers(this.db, proposals.map((receipt) => tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex)))
      : new Map();
    const movedOn = this.hasDecisionTables ? readMovedOnTarsMessages(this.db, proposals.map((receipt) => receipt.messageId)) : new Set<string>();
    const confirms = proposals.flatMap((receipt): TarsPendingDecision[] => {
      const { action } = receipt;
      if (action.kind !== "control" || settled.has(`${receipt.messageId}:${action.responsibilityId}`) || movedOn.has(`${receipt.messageId}:${action.responsibilityId}`) ||
        answered.has(tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex)) || !live(action.responsibilityId, action.expectedRevision, action.operation)) return [];
      return [{ responsibilityId: action.responsibilityId, messageId: receipt.messageId, actionIndex: receipt.actionIndex,
        operation: action.operation, expectedRevision: action.expectedRevision, proposedAt: receipt.updatedAt }];
    });
    if (!this.hasDecisionTables) return confirms;
    // A refused answer that leaves the decision open (`isTarsAnswerRetryable`) keeps it waiting.
    const settlingAnswer = (answers: Map<string, Parameters<typeof isTarsAnswerSettling>[0]>, id: string) => {
      const answer = answers.get(id); return answer !== undefined && isTarsAnswerSettling(answer);
    };
    const blocked = responsibilities.filter((row) => row.state === "blocked" && row.detailCode === "unverifiedCompletion");
    const unverifiedAnswers = readTarsAnswers(this.db, blocked.map((row) => tarsUnverifiedDecisionId(row.id, row.revision)));
    const unverified = blocked.flatMap((row): TarsPendingDecision[] => settlingAnswer(unverifiedAnswers, tarsUnverifiedDecisionId(row.id, row.revision)) ? []
      : [{ kind: "unverifiedCompletion", responsibilityId: row.id, messageId: null, actionIndex: null, operation: null,
        expectedRevision: row.revision, proposedAt: row.updatedAt, optionCount: row.completionGoal === "pullRequest" || row.completionGoal === "merge" ? 2 : 3 }]);
    const open = readOpenTarsAsks(this.db);
    const askAnswers = readTarsAnswers(this.db, open.map((receipt) => tarsAskDecisionId(receipt.messageId, receipt.actionIndex)));
    const askSettled = readSettledTarsTargets(this.db, open.map((receipt) => receipt.messageId));
    const asks = open.flatMap((receipt): TarsPendingDecision[] => {
      if (receipt.action.kind !== "ask" || settlingAnswer(askAnswers, tarsAskDecisionId(receipt.messageId, receipt.actionIndex))) return [];
      const targets = receipt.action.options.flatMap((option) => option.effect.kind === "control" ? [option.effect] : []);
      const prTarget = targets.length ? null : readTarsPrAskTarget(this.db, receipt, rows);
      if ((!targets.length && !prTarget) || targets.some((target) => askSettled.has(`${receipt.messageId}:${target.responsibilityId}`))) return [];
      if (!targets.every((target) => live(target.responsibilityId, target.expectedRevision, target.operation))) return [];
      return [{ kind: "ask", responsibilityId: targets[0]?.responsibilityId ?? prTarget!.id, messageId: receipt.messageId, actionIndex: receipt.actionIndex,
        operation: null, expectedRevision: targets[0]?.expectedRevision ?? prTarget!.revision, proposedAt: receipt.updatedAt,
        question: receipt.action.question, optionCount: receipt.action.options.length }];
    });
    return [...confirms, ...unverified, ...asks];
  }

  /** Accepts an admitted agent only from host decision admission; the create IPC schema has no agent field. */
  create(rawInput: AdmittedTarsResponsibilityInput, now: string): TarsResponsibility {
    const { agentId, ...input } = AdmittedTarsResponsibilityInputSchema.parse(rawInput);
    // Without an agent the request hash keeps its earlier shape, so replays still match.
    const normalized = { ...input, model: input.model ?? null, ...(agentId ? { agentId } : {}) };
    const canonicalRequest = Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
    const requestHash = createHash("sha256").update(JSON.stringify(canonicalRequest)).digest("hex");
    return this.write(() => {
      const prior = this.db.prepare("SELECT body_json, request_hash FROM tars_responsibilities WHERE request_id = ?")
        .get(input.requestId) as StoredRow | undefined;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new Error("This request ID already names a different responsibility.");
        return this.readResponsibility(prior)!;
      }
      const responsibility = TarsResponsibilitySchema.parse({
        ...normalized, agentId: agentId ?? null,
        id: randomUUID(), revision: 1, state: "queued", detail: null,
        taskId: null, executionWorkspaceId: null, agentRunId: null, reverifyAfter: null, createdAt: now, updatedAt: now,
      });
      this.db.prepare(`INSERT INTO tars_responsibilities
        (id, request_id, request_hash, revision, priority, created_at, body_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(responsibility.id, responsibility.requestId, requestHash, responsibility.revision,
          responsibility.priority, responsibility.createdAt, JSON.stringify(responsibility));
      this.journal(responsibility, now);
      this.changes.emit("snapshot");
      return responsibility;
    });
  }

  /**
   * Compare-and-swap makes stale UI controls and competing runtime observations fail closed.
   * A transition that is an inbox event is recorded in the same transaction; `recovered` marks
   * a run found after a lost acknowledgement (a host recovery).
   */
  patch(id: string, expectedRevision: number, rawPatch: TarsResponsibilityPatch, now: string, options: { recovered?: boolean } = {}): TarsResponsibility {
    const patch = TarsResponsibilityPatchSchema.parse(rawPatch);
    return this.write(() => {
      const previous = this.get(id);
      if (!previous) throw new Error("The responsibility was not found.");
      if (previous.revision !== expectedRevision) throw new Error("The responsibility changed. Refresh it before trying again.");
      const merged: Record<string, unknown> = { ...previous, ...patch, revision: previous.revision + 1, updatedAt: now };
      if (("agentRunId" in patch && patch.agentRunId !== previous.agentRunId) ||
        (patch.state === "running" && previous.state !== "running")) {
        delete merged.completionConfirmedAt;
        merged.resultVerifiedRunId = null;
      }
      if ("agentRunId" in patch && patch.agentRunId !== previous.agentRunId && previous.publication) {
        merged.publicationHistory = [...(previous.publicationHistory ?? []),
          { ...previous.publication, agentRunId: previous.publication.agentRunId ?? previous.agentRunId ?? undefined }];
        if (previous.publication.state !== "opened" || !previous.publication.watch) delete merged.publication;
      }
      // A detail written without a code is free text, so it never keeps an earlier sentence's code.
      if ("detail" in patch) {
        delete merged.detailCode; delete merged.detailParams;
        Object.assign(merged, detailCodeOf(patch));
      }
      const next = this.restoreCompletion(TarsResponsibilitySchema.parse(merged));
      const result = this.db.prepare(`UPDATE tars_responsibilities
        SET revision = ?, priority = ?, body_json = ? WHERE id = ? AND revision = ?`)
        .run(next.revision, next.priority, JSON.stringify(next), id, expectedRevision);
      if (Number(result.changes ?? 0) !== 1) throw new Error("The responsibility changed. Refresh it before trying again.");
      this.changes.emit("snapshot");
      if (previous.state !== next.state || previous.detail !== next.detail ||
        JSON.stringify(detailCodeOf(previous)) !== JSON.stringify(detailCodeOf(next))) this.journal(next, now);
      const observed = { responsibilityId: next.id, episode: String(next.revision), observedRevision: next.revision,
        observedState: next.state, attempt: next.agentRunId };
      if (options.recovered) this.events.record({ ...observed, kind: "hostRecovery" }, now);
      const checks = next.publication?.checks;
      const oldChecks = previous.publication?.checks;
      const ciKind = checks && next.publication?.state === "opened" && checks.headSha === next.publication.commit
        && !next.publication.watch?.stopped?.match(/closed|expired/)
        && (checks.state !== oldChecks?.state || checks.headSha !== oldChecks?.headSha)
        ? ({ failed: "ciFailed", passed: "ciPassed", unavailable: "ciUnavailable" } as const)[checks.state as "failed" | "passed" | "unavailable"] : undefined;
      if (ciKind && !this.events.get(`${ciKind}:${next.id}:${checks!.headSha}`)) {
        this.events.record({ ...observed, kind: ciKind, episode: checks!.headSha! }, now);
        this.journal(next, now, checks);
      }
      const kind = classifyTarsTransition(previous, next);
      if (kind) this.events.record({ ...observed, kind }, now);
      return next;
    });
  }

  updateIdentity(rawInput: UpdateTarsIdentityInput, now: string): TarsIdentity {
    const input = UpdateTarsIdentityInputSchema.parse(rawInput);
    const next = TarsIdentitySchema.parse({ ...input, id: "personal", updatedAt: now });
    const result = this.db.prepare("UPDATE tars_identity SET body_json = ? WHERE id = 'personal'").run(JSON.stringify(next));
    if (Number(result.changes ?? 0) !== 1) throw new Error("The personal supervisor identity is missing.");
    this.changes.emit("snapshot");
    return next;
  }
}
