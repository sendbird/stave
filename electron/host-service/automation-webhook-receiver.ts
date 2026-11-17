import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { readFileSync, renameSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  AutomationWebhookConfigSchema, AutomationWebhookDeliverySchema,
  AutomationWebhookReceiverSettingsSchema, webhookFiltersMatch,
  WEBHOOK_DELIVERY_ID_HEADER, WEBHOOK_DELIVERY_ID_PATTERN, WEBHOOK_REJECTION_REASONS, WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER, WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  type AutomationWebhookConfig, type AutomationWebhookDelivery, type AutomationWebhookReceiverSettings,
  type AutomationWebhookReceiverStatus, type AutomationWebhookRejection, type WebhookRejectionReason,
} from "../../src/lib/automation-webhooks";

const MAX_BODY_BYTES = 1_048_576;
const MAX_DELIVERIES = 1000;
const MAX_PENDING = 1000;
/** A queued event that still cannot start a run after this long is given up and recorded as failed. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
/** Claims outlive the timestamp tolerance on both sides, so a replay inside it is always a duplicate. */
const MIN_DEDUPE_RETENTION_MS = (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS * 2 + 60) * 1000;
/** Invalid requests per endpoint per minute before they are answered 429 without logging. */
const INVALID_REQUESTS_PER_MINUTE = 60;
const SECRET_CACHE_MS = 60_000;
const REJECTION_FLUSH_MS = 30_000;

const PendingSchema = z.object({
  entryId: z.string(), id: z.string(), payload: z.unknown(), dueAt: z.number(), receivedAt: z.number(),
  attempts: z.number().int().min(0), coalesce: z.boolean(),
  /** Persisted before a run is requested: one still set after a restart may already have started a task, so it is not sent again. */
  inFlight: z.boolean(),
}).strict();
type Pending = z.infer<typeof PendingSchema>;
const RejectionCounterSchema = z.object({count: z.number().int().min(0), lastAt: z.number()}).strict();
const JournalSchema = z.object({
  version: z.literal(2),
  dedupe: z.record(z.string(), z.number()),
  deliveries: z.array(AutomationWebhookDeliverySchema),
  pending: z.array(PendingSchema),
  rejections: z.record(z.string(), z.partialRecord(z.enum(WEBHOOK_REJECTION_REASONS), RejectionCounterSchema)),
}).strict();
type Journal = z.infer<typeof JournalSchema>;
interface WebhookAutomation {id: string; enabled: boolean; webhook?: AutomationWebhookConfig | undefined}
interface Dependencies {
  statePath: string;
  listAutomations: () => Promise<WebhookAutomation[]>;
  resolveSecret: (id: string) => Promise<string | null>;
  runWebhook: (args: {id: string; payload: unknown}) => Promise<unknown>;
  now?: () => number;
  /** Delay before the next attempt to start a queued event's run. */
  retryDelayMs?: (attempt: number) => number;
}

function emptyJournal(): Journal {
  return {version: 2, dedupe: {}, deliveries: [], pending: [], rejections: {}};
}

function header(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

function bindError(cause: unknown): AutomationWebhookReceiverStatus["error"] {
  const code = (cause as NodeJS.ErrnoException | null)?.code;
  return code === "EADDRINUSE" ? "port-in-use" : code === "EADDRNOTAVAIL" ? "address-unavailable" : code === "EACCES" ? "permission-denied" : "bind-failed";
}

/**
 * Single-process receiver. A signed event is claimed and queued in the journal
 * before it is answered 202, then a run is requested until it starts (a busy
 * schedule is retried, never dropped). A run that may already have started when
 * the app stopped is not requested again, so an event starts at most one task.
 */
export function createAutomationWebhookReceiver(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const retryDelayMs = dependencies.retryDelayMs ?? ((attempt: number) => Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)));
  let notice: AutomationWebhookReceiverStatus["notice"] = null;
  let journal = emptyJournal();
  try {
    journal = JournalSchema.parse(JSON.parse(readFileSync(dependencies.statePath, "utf8")));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      // An unreadable journal is set aside, not deleted, and the receiver keeps working with a fresh one.
      try { renameSync(dependencies.statePath, `${dependencies.statePath}.corrupt-${now()}`); } catch { /* the next save replaces it */ }
      notice = "journal-quarantined";
      console.warn("[webhooks] journal could not be read; it was set aside and replaced");
    }
  }
  // Runs that were being requested when the app stopped may have started: record them instead of sending them twice.
  for (const entry of journal.pending.filter((candidate) => candidate.inFlight)) {
    journal.deliveries.push({id: randomUUID(), automationId: entry.id, receivedAt: new Date(entry.receivedAt).toISOString(), status: "failed", reason: "interrupted"});
  }
  journal.pending = journal.pending.filter((candidate) => !candidate.inFlight);

  let settings = AutomationWebhookReceiverSettingsSchema.parse({});
  let server: Server | null = null;
  let boundPort = settings.port;
  let error: AutomationWebhookReceiverStatus["error"] = null;
  let chain = Promise.resolve();
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let dirty = false;
  let pumping: Promise<void> | null = null;
  const uncommitted = new WeakSet<Pending>();
  const signedRequests = new Map<string, number[]>();
  const invalidRequests = new Map<string, number[]>();
  const secrets = new Map<string, {value: string | null; until: number}>();

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = chain.then(action, action);
    chain = next.then(() => undefined, () => undefined);
    return next;
  }
  /** Asynchronous, atomic journal write; callers serialize through `enqueue`. */
  async function writeJournal() {
    journal.dedupe = Object.fromEntries(Object.entries(journal.dedupe).filter(([, expiry]) => expiry > now()));
    journal.deliveries = journal.deliveries.slice(-MAX_DELIVERIES);
    const text = JSON.stringify(journal);
    dirty = false;
    try {
      await mkdir(dirname(dependencies.statePath), {recursive: true});
      const temporary = `${dependencies.statePath}.tmp`;
      const handle = await open(temporary, "w", 0o600);
      try {
        await handle.writeFile(text);
        await handle.sync();
      } finally { await handle.close(); }
      await rename(temporary, dependencies.statePath);
    } catch (cause) {
      dirty = true;
      throw cause;
    }
  }
  function flushIfDirty() {
    if (!dirty) return Promise.resolve();
    return enqueue(writeJournal).catch(() => { dirty = true; });
  }
  function deliver(id: string, status: AutomationWebhookDelivery["status"], reason: string | null = null) {
    const delivery = {id: randomUUID(), automationId: id, receivedAt: new Date(now()).toISOString(), status, reason};
    journal.deliveries.push(delivery);
    dirty = true;
    return delivery;
  }
  /** Counted in memory and written with the next periodic flush; never a journal write per request. */
  function reject(automationId: string, reason: WebhookRejectionReason) {
    const counters = journal.rejections[automationId] ??= {} as Journal["rejections"][string];
    const counter = counters[reason] ??= {count: 0, lastAt: 0};
    if (counter.count === 0 || now() - counter.lastAt > REJECTION_FLUSH_MS) console.info("[webhooks] rejected request", {automationId, reason});
    counter.count += 1;
    counter.lastAt = now();
    dirty = true;
  }
  function withinLimit(map: Map<string, number[]>, key: string, limit: number) {
    const recent = (map.get(key) ?? []).filter((time) => time > now() - 60_000);
    if (recent.length >= limit) { map.set(key, recent); return false; }
    recent.push(now());
    map.set(key, recent);
    return true;
  }
  async function secretFor(secretId: string) {
    const cached = secrets.get(secretId);
    if (cached && cached.until > now()) return cached.value;
    const value = await dependencies.resolveSecret(secretId);
    secrets.set(secretId, {value, until: now() + SECRET_CACHE_MS});
    return value;
  }

  type Verified = {ok: true; deliveryId: string | null; timestamp: string} | {ok: false; reason: WebhookRejectionReason};
  async function verify(config: AutomationWebhookConfig, body: Buffer, headers: IncomingHttpHeaders): Promise<Verified> {
    const signature = header(headers, WEBHOOK_SIGNATURE_HEADER);
    if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return {ok: false, reason: "signature-required"};
    const timestamp = header(headers, WEBHOOK_TIMESTAMP_HEADER);
    if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return {ok: false, reason: "timestamp-required"};
    const deliveryId = header(headers, WEBHOOK_DELIVERY_ID_HEADER);
    if (deliveryId !== undefined && !WEBHOOK_DELIVERY_ID_PATTERN.test(deliveryId)) return {ok: false, reason: "delivery-id-invalid"};
    const secret = await secretFor(config.secretId);
    if (!secret) return {ok: false, reason: "signature-invalid"};
    const expected = createHmac("sha256", secret).update(`${timestamp}.${deliveryId ?? ""}.`).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))) return {ok: false, reason: "signature-invalid"};
    if (Math.abs(now() / 1000 - Number(timestamp)) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return {ok: false, reason: "timestamp-out-of-range"};
    return {ok: true, deliveryId: deliveryId ?? null, timestamp};
  }

  /** Claims, filters and queues one verified event; answered only after the journal holds it. */
  async function accept(automation: WebhookAutomation, config: AutomationWebhookConfig, body: Buffer, payload: unknown, verified: {deliveryId: string | null; timestamp: string}) {
    const identity = verified.deliveryId ? `id:${verified.deliveryId}` : `body:${createHash("sha256").update(body).digest("hex")}:${verified.timestamp}`;
    const key = createHash("sha256").update(`${automation.id}\0${identity}`).digest("hex");
    if ((journal.dedupe[key] ?? 0) > now()) {
      deliver(automation.id, "duplicate");
      // The claim is already stored; a history write that fails is retried with the next one.
      await writeJournal().catch(() => undefined);
      return 202;
    }
    journal.dedupe[key] = now() + Math.max(config.dedupeWindowSeconds * 1000, MIN_DEDUPE_RETENTION_MS);
    if (!webhookFiltersMatch(payload, config.filters)) {
      // Signed and rate limited, so a write per filtered event is bounded; its claim must survive a restart.
      const delivery = deliver(automation.id, "filtered");
      try { await writeJournal(); }
      catch {
        delete journal.dedupe[key];
        journal.deliveries = journal.deliveries.filter((candidate) => candidate !== delivery);
        return 503;
      }
      return 202;
    }
    const merge = config.coalesceWindowSeconds
      ? journal.pending.find((entry) => entry.id === automation.id && entry.coalesce && !entry.inFlight && entry.attempts === 0 && entry.dueAt > now())
      : undefined;
    const previousPayload = merge?.payload;
    let added: Pending | null = null;
    if (merge) merge.payload = payload;
    else {
      if (journal.pending.length >= MAX_PENDING) { delete journal.dedupe[key]; return 503; }
      added = {entryId: randomUUID(), id: automation.id, payload, dueAt: now() + config.coalesceWindowSeconds * 1000, receivedAt: now(), attempts: 0, coalesce: config.coalesceWindowSeconds > 0, inFlight: false};
      journal.pending.push(added);
      uncommitted.add(added);
    }
    const delivery = deliver(automation.id, "accepted");
    try {
      await writeJournal();
    } catch {
      // Not stored, so not accepted: release the claim so the sender's retry is a new delivery.
      delete journal.dedupe[key];
      journal.deliveries = journal.deliveries.filter((candidate) => candidate !== delivery);
      if (added) journal.pending = journal.pending.filter((candidate) => candidate !== added);
      if (merge) merge.payload = previousPayload;
      return 503;
    }
    if (added) uncommitted.delete(added);
    schedulePending();
    return 202;
  }

  function schedulePending() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    const waiting = journal.pending.filter((entry) => !uncommitted.has(entry) && !entry.inFlight);
    if (!server || !waiting.length || pumping) return;
    const due = Math.min(...waiting.map((entry) => entry.dueAt));
    pendingTimer = setTimeout(() => { void pump(); }, Math.max(0, due - now()));
    pendingTimer.unref?.();
  }

  /** Requests a run for each due event, one at a time, outside the acceptance queue. */
  function pump() {
    pumping ??= drain().finally(() => { pumping = null; schedulePending(); });
    return pumping;
  }
  async function drain() {
    while (server) {
      const entry = journal.pending
        .filter((candidate) => candidate.dueAt <= now() && !candidate.inFlight && !uncommitted.has(candidate))
        .sort((left, right) => left.dueAt - right.dueAt)[0];
      if (!entry) break;
      let automation: WebhookAutomation | undefined;
      try { automation = (await dependencies.listAutomations()).find((candidate) => candidate.id === entry.id); }
      catch { entry.dueAt = now() + retryDelayMs(entry.attempts); break; }
      if (!automation?.enabled || !automation.webhook) {
        journal.pending = journal.pending.filter((candidate) => candidate !== entry);
        deliver(entry.id, "failed", "disabled");
        await enqueue(writeJournal).catch(() => { dirty = true; });
        continue;
      }
      entry.inFlight = true;
      try { await enqueue(writeJournal); }
      catch { entry.inFlight = false; entry.dueAt = now() + retryDelayMs(entry.attempts); break; }
      let started = false;
      try { await dependencies.runWebhook({id: entry.id, payload: entry.payload}); started = true; }
      catch { /* busy or unavailable: retried below */ }
      entry.inFlight = false;
      if (started) journal.pending = journal.pending.filter((candidate) => candidate !== entry);
      else {
        entry.attempts += 1;
        if (now() - entry.receivedAt > PENDING_TTL_MS) {
          journal.pending = journal.pending.filter((candidate) => candidate !== entry);
          deliver(entry.id, "failed", "dispatch-expired");
        } else entry.dueAt = now() + retryDelayMs(entry.attempts);
      }
      await enqueue(writeJournal).catch(() => { dirty = true; });
    }
  }

  /** One request to a known endpoint whose body was read: verified first, then counted against the sender's limit. */
  async function handleEvent(automation: WebhookAutomation, body: Buffer, headers: IncomingHttpHeaders): Promise<number> {
    const config = AutomationWebhookConfigSchema.parse(automation.webhook);
    const verified = await verify(config, body, headers);
    if (!verified.ok) {
      if (!withinLimit(invalidRequests, automation.id, INVALID_REQUESTS_PER_MINUTE)) { reject(automation.id, "unsigned-rate-limit"); return 429; }
      reject(automation.id, verified.reason);
      return 401;
    }
    if (!automation.enabled) { reject(automation.id, "disabled"); return 404; }
    if (!withinLimit(signedRequests, automation.id, config.rateLimitPerMinute)) { reject(automation.id, "rate-limit"); return 429; }
    let payload: unknown;
    try { payload = JSON.parse(body.toString("utf8")); } catch { reject(automation.id, "invalid-json"); return 400; }
    return enqueue(() => accept(automation, config, body, payload, verified));
  }

  async function stop() {
    if (pendingTimer) clearTimeout(pendingTimer);
    if (flushTimer) clearInterval(flushTimer);
    pendingTimer = null;
    flushTimer = null;
    const active = server;
    server = null;
    if (active) await new Promise<void>((resolve, reject) => active.close((cause) => cause ? reject(cause) : resolve()));
    await pumping;
    await chain;
    await flushIfDirty();
  }

  function rejectionsOf(automationId?: string): AutomationWebhookRejection[] {
    return Object.entries(journal.rejections)
      .filter(([id]) => !automationId || id === automationId)
      .flatMap(([id, counters]) => Object.entries(counters).map(([reason, counter]) => ({
        automationId: id, reason: reason as WebhookRejectionReason, count: counter.count, lastAt: new Date(counter.lastAt).toISOString(),
      })))
      .sort((left, right) => right.lastAt.localeCompare(left.lastAt));
  }

  return {
    status: (): AutomationWebhookReceiverStatus & {settings: AutomationWebhookReceiverSettings} => ({
      settings: {...settings}, listening: server?.listening ?? false, port: boundPort, error, notice,
    }),
    listDeliveries: (automationId?: string) => journal.deliveries.filter((delivery) => !automationId || delivery.automationId === automationId).slice(-100).reverse().map((delivery) => ({...delivery})),
    listRejections: rejectionsOf,
    stop,
    start: async (input: AutomationWebhookReceiverSettings = AutomationWebhookReceiverSettingsSchema.parse({})) => {
      await stop();
      settings = AutomationWebhookReceiverSettingsSchema.parse(input);
      error = null;
      secrets.clear();
      if (!settings.enabled) return;
      const listener = createServer(async (request, response) => {
        const finish = (code: number) => { response.writeHead(code, {"content-type": "application/json"}); response.end(JSON.stringify({ok: code === 202})); };
        try {
          const endpoint = /^\/webhooks\/([a-f0-9]{64})$/.exec((request.url ?? "").split("?")[0] ?? "")?.[1];
          if (request.method !== "POST" || !endpoint) { request.resume(); finish(404); return; }
          const automation = (await dependencies.listAutomations()).find((candidate) => candidate.webhook?.endpointId === endpoint);
          if (!automation) { request.resume(); finish(404); return; }
          let size = 0;
          const chunks: Buffer[] = [];
          for await (const chunk of request) {
            size += Buffer.byteLength(chunk);
            if (size > MAX_BODY_BYTES) {
              reject(automation.id, "body-too-large");
              finish(413); request.resume(); return;
            }
            chunks.push(Buffer.from(chunk));
          }
          finish(await handleEvent(automation, Buffer.concat(chunks), request.headers));
        } catch { if (!response.headersSent) finish(503); }
      });
      listener.requestTimeout = 15_000;
      listener.headersTimeout = 10_000;
      listener.maxHeadersCount = 50;
      await new Promise<void>((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(settings.port, settings.bindAddress, () => { listener.removeListener("error", reject); resolve(); });
      }).catch((cause) => { error = bindError(cause); throw cause; });
      server = listener;
      const address = listener.address();
      boundPort = address && typeof address !== "string" ? address.port : settings.port;
      listener.on("error", () => { error = "receiver-failed"; });
      flushTimer = setInterval(() => { void flushIfDirty(); }, REJECTION_FLUSH_MS);
      flushTimer.unref?.();
      schedulePending();
    },
    /** A signed event built here, through the same checks as a request. */
    sendTestEvent: async ({id, payload}: {id: string; payload: unknown}) => {
      if (!server?.listening) throw new Error("Webhook receiver is off.");
      const automation = (await dependencies.listAutomations()).find((candidate) => candidate.id === id);
      if (!automation?.webhook) throw new Error("Webhook automation does not exist.");
      const secret = await secretFor(automation.webhook.secretId);
      if (!secret) throw new Error("Webhook signing secret is missing.");
      const body = Buffer.from(JSON.stringify(payload));
      if (body.length > MAX_BODY_BYTES) throw new Error("Test event exceeds the body limit.");
      const timestamp = String(Math.floor(now() / 1000));
      const deliveryId = `test-${randomUUID()}`;
      const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.`).update(body).digest("hex")}`;
      return handleEvent(automation, body, {
        [WEBHOOK_SIGNATURE_HEADER]: signature, [WEBHOOK_TIMESTAMP_HEADER]: timestamp, [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
      });
    },
  };
}
export type AutomationWebhookReceiver = ReturnType<typeof createAutomationWebhookReceiver>;
