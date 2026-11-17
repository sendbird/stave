import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  AutomationWebhookConfigSchema, AutomationWebhookDeliverySchema,
  AutomationWebhookReceiverSettingsSchema, webhookFiltersMatch,
  type AutomationWebhookConfig, type AutomationWebhookDelivery, type AutomationWebhookReceiverSettings,
} from "../../src/lib/automation-webhooks";

const MAX_BODY_BYTES = 1_048_576;
const PendingSchema = z.object({id: z.string(), payload: z.unknown(), dueAt: z.number()}).strict();
const JournalSchema = z.object({
  version: z.literal(1),
  dedupe: z.record(z.string(), z.number()),
  deliveries: z.array(AutomationWebhookDeliverySchema),
  pending: z.array(PendingSchema),
}).strict();
type Journal = z.infer<typeof JournalSchema>;
interface WebhookAutomation {id: string; enabled: boolean; webhook?: AutomationWebhookConfig}
interface Dependencies {
  statePath: string;
  listAutomations: () => Promise<WebhookAutomation[]>;
  resolveSecret: (id: string) => Promise<string | null>;
  runWebhook: (args: {id: string; payload: unknown}) => Promise<unknown>;
  now?: () => number;
}

/** Single-process receiver: journal claims are committed before dispatch for at-most-once delivery. */
export function createAutomationWebhookReceiver(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  let journal: Journal;
  try { journal = JournalSchema.parse(JSON.parse(readFileSync(dependencies.statePath, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Webhook journal cannot be read; receiver stopped to preserve deduplication.");
    journal = {version: 1, dedupe: {}, deliveries: [], pending: []};
  }
  let settings = AutomationWebhookReceiverSettingsSchema.parse({});
  let server: Server | null = null;
  let boundPort = settings.port;
  let error: string | null = null;
  let chain = Promise.resolve();
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  const requests = new Map<string, number[]>();
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = chain.then(action, action);
    chain = next.then(() => undefined, () => undefined);
    return next;
  }
  function save() {
    journal.dedupe = Object.fromEntries(Object.entries(journal.dedupe).filter(([,expiry]) => expiry > now()));
    journal.deliveries = journal.deliveries.slice(-1000);
    mkdirSync(dirname(dependencies.statePath), {recursive: true});
    const temporary = `${dependencies.statePath}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(journal));
      fsyncSync(fd);
    } finally {closeSync(fd);}
    renameSync(temporary, dependencies.statePath);
  }
  function record(id: string, status: AutomationWebhookDelivery["status"], reason: string | null = null) {
    journal.deliveries.push({id: randomUUID(), automationId:id, receivedAt:new Date(now()).toISOString(), status, reason});
    save();
    if (status === "rejected") console.info("[webhooks] rejected delivery", {automationId:id, reason});
  }
  function schedulePending() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    if (!server || !journal.pending.length) return;
    const due = Math.min(...journal.pending.map(p => p.dueAt));
    pendingTimer = setTimeout(() => {void enqueue(flushPending).catch(() => {error = "Webhook dispatch failed.";});}, Math.max(0, due - now()));
    pendingTimer.unref?.();
  }
  async function flushPending() {
    const due = journal.pending.filter(p => p.dueAt <= now());
    journal.pending = journal.pending.filter(p => p.dueAt > now());
    save();
    const automations = await dependencies.listAutomations();
    for (const pending of due) {
      if (!automations.some(a => a.id === pending.id && a.enabled && a.webhook)) continue;
      try { await dependencies.runWebhook({id:pending.id, payload:pending.payload}); }
      catch {record(pending.id, "rejected", "dispatch-failed");}
    }
    schedulePending();
  }
  function allowRequest(automation: WebhookAutomation) {
    const config = AutomationWebhookConfigSchema.parse(automation.webhook);
    const recent = (requests.get(automation.id) ?? []).filter(time => time > now()-60_000);
    requests.set(automation.id, recent);
    if (recent.length >= config.rateLimitPerMinute) {record(automation.id,"rejected","rate-limit");return false;}
    recent.push(now());
    return true;
  }
  async function processEvent(automation: WebhookAutomation, body: Buffer, signature: string | undefined, deliveryId?: string, counted = false) {
    const config = AutomationWebhookConfigSchema.parse(automation.webhook);
    const reject = (code:number, reason:string) => {record(automation.id,"rejected",reason); return code;};
    if (!counted && !allowRequest(automation)) return 429;
    if (!automation.enabled) return reject(404,"disabled");
    const secret = await dependencies.resolveSecret(config.secretId);
    if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return reject(401,"signature-required");
    const expected = createHmac("sha256",secret).update(body).digest();
    if (!timingSafeEqual(expected,Buffer.from(signature.slice(7),"hex"))) return reject(401,"signature-invalid");
    let payload: unknown;
    try {payload = JSON.parse(body.toString("utf8"));} catch {return reject(400,"invalid-json");}
    const identity = deliveryId ? `id:${deliveryId}` : `body:${createHash("sha256").update(body).digest("hex")}`;
    const key = createHash("sha256").update(`${automation.id}\0${identity}`).digest("hex");
    if ((journal.dedupe[key] ?? 0) > now()) {record(automation.id,"duplicate");return 202;}
    journal.dedupe[key] = now() + config.dedupeWindowSeconds*1000;
    if (!webhookFiltersMatch(payload,config.filters)) {record(automation.id,"filtered");return 202;}
    if (config.coalesceWindowSeconds) {
      const existing = journal.pending.find(p => p.id === automation.id);
      if (existing) existing.payload = payload;
      else journal.pending.push({id:automation.id,payload,dueAt:now()+config.coalesceWindowSeconds*1000});
      record(automation.id,"accepted");
      schedulePending();
    } else {
      record(automation.id,"accepted");
      try {await dependencies.runWebhook({id:automation.id,payload});}
      catch {return reject(503,"dispatch-failed");}
    }
    return 202;
  }
  async function stop() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    const active = server;
    server = null;
    if (active) await new Promise<void>((resolve,reject)=>active.close(e=>e?reject(e):resolve()));
    await chain;
  }
  return {
    status: () => ({settings:{...settings},listening:server?.listening ?? false,port:boundPort,error}),
    listDeliveries: (automationId?: string) => journal.deliveries.filter(d => !automationId || d.automationId===automationId).slice(-100).reverse().map(d=>({...d})),
    stop,
    start: async (input: AutomationWebhookReceiverSettings = AutomationWebhookReceiverSettingsSchema.parse({})) => {
      await stop();
      settings = AutomationWebhookReceiverSettingsSchema.parse(input);
      error = null;
      if (!settings.enabled) return;
      const listener = createServer(async (request,response) => {
        const finish = (code:number) => {response.writeHead(code,{"content-type":"application/json"});response.end(JSON.stringify({ok:code===202}));};
        try {
          const endpoint = /^\/webhooks\/([a-f0-9]{64})$/.exec((request.url??"").split("?")[0]??"")?.[1];
          if (request.method !== "POST" || !endpoint) {request.resume();finish(404);return;}
          const automation=(await dependencies.listAutomations()).find(a=>a.webhook?.endpointId===endpoint);
          if (!automation) {request.resume();finish(404);return;}
          if (!await enqueue(async()=>allowRequest(automation))) {request.resume();finish(429);return;}
          let size=0;
          const chunks:Buffer[]=[];
          for await (const chunk of request) {
            size+=Buffer.byteLength(chunk);
            if(size>MAX_BODY_BYTES) {
              await enqueue(async()=>record(automation.id,"rejected","body-too-large"));
              finish(413);request.resume();return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const signature=request.headers["x-stave-signature"];
          const delivery=request.headers["x-delivery-id"];
          finish(await enqueue(()=>processEvent(automation,Buffer.concat(chunks),typeof signature==="string"?signature:undefined,typeof delivery==="string"?delivery:undefined,true)));
        } catch { if (!response.headersSent) finish(503); }
      });
      listener.requestTimeout=15_000;
      listener.headersTimeout=10_000;
      listener.maxHeadersCount=50;
      await new Promise<void>((resolve,reject)=>{listener.once("error",reject);listener.listen(settings.port,settings.bindAddress,()=>{listener.removeListener("error",reject);resolve();});}).catch((cause)=>{error="Webhook receiver could not bind.";throw cause;});
      server=listener;
      const address=listener.address();
      boundPort=address && typeof address!=="string"?address.port:settings.port;
      listener.on("error",()=>{error="Webhook receiver failed.";});
      schedulePending();
    },
    sendTestEvent: async ({id,payload}:{id:string;payload:unknown}) => {
      if (!server?.listening) throw new Error("Webhook receiver is off.");
      const automation=(await dependencies.listAutomations()).find(a=>a.id===id);
      if(!automation?.webhook) throw new Error("Webhook automation does not exist.");
      const secret=await dependencies.resolveSecret(automation.webhook.secretId);
      if(!secret) throw new Error("Webhook signing secret is missing.");
      const body=Buffer.from(JSON.stringify(payload));
      if(body.length>MAX_BODY_BYTES) throw new Error("Test event exceeds the body limit.");
      return enqueue(()=>processEvent(automation,body,`sha256=${createHmac("sha256",secret).update(body).digest("hex")}`,randomUUID()));
    },
  };
}
export type AutomationWebhookReceiver = ReturnType<typeof createAutomationWebhookReceiver>;
