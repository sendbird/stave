import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import {
  isLoopbackAddress,
  REMOTE_CONTROL_MAX_AUDIT,
  REMOTE_CONTROL_MAX_DEVICES,
  RemoteActionSchema,
  RemoteAuditSchema,
  RemoteConfigSchema,
  RemoteDeviceSchema,
  RemotePairSchema,
  RemoteResultSchema,
  RemoteSnapshotSchema,
  type RemoteAction,
  type RemoteAudit,
  type RemoteConfig,
  type RemoteInterface,
  type RemoteResult,
  type RemoteStartError,
  type RemoteStatus,
} from "../../../src/lib/remote-control";

export const RemoteStoredSchema = z
  .object({
    devices: z
      .array(
        RemoteDeviceSchema.extend({
          hash: z.string().regex(/^[a-f0-9]{64}$/),
        }).strict(),
      )
      .max(REMOTE_CONTROL_MAX_DEVICES),
    audit: z.array(RemoteAuditSchema).max(REMOTE_CONTROL_MAX_AUDIT),
  })
  .strict();
export type RemoteStored = z.infer<typeof RemoteStoredSchema>;

const PAIRING_TTL_MS = 300_000;
const PAIRING_LOCK_MS = 300_000;
const PAIRING_MAX_FAILURES = 5;
const PAIRING_MAX_PER_MINUTE = 10;
const DEVICE_MAX_PER_MINUTE = 60;
const LAST_SEEN_PERSIST_MS = 60_000;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class RemoteConfigError extends Error {
  constructor(readonly code: "invalid-address" | RemoteStartError) {
    super(code);
  }
}

export class RemotePairingUnavailableError extends Error {
  constructor() {
    super("Pairing unavailable.");
  }
}

export interface RemotePorts {
  snapshot(): Promise<z.infer<typeof RemoteSnapshotSchema>>;
  act(action: RemoteAction): Promise<RemoteResult>;
  save(state: RemoteStored): Promise<void>;
  record(audit: RemoteAudit): Promise<void>;
  asset(path: string): Promise<{ body: Uint8Array; type: string } | null>;
  now?: () => number;
  interfaces?: () => RemoteInterface[];
}

/** Addresses a non-loopback listener may use: assigned, external and routable without a zone id. */
export function listRemoteInterfaces(): RemoteInterface[] {
  const result: RemoteInterface[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family !== "IPv4" && entry.family !== "IPv6") continue;
      if (entry.family === "IPv6" && entry.address.toLowerCase().startsWith("fe80:")) continue;
      result.push({ name: name.slice(0, 100), address: entry.address, family: entry.family });
    }
  }
  return result.slice(0, 64);
}

function sameRequest(entry: RemoteAudit["action"], action: RemoteAction) {
  return (
    entry.workspaceId === action.workspaceId &&
    entry.taskId === action.taskId &&
    entry.turnId === action.turnId &&
    entry.requestId === action.requestId &&
    entry.messageId === action.messageId
  );
}

/** No listener exists until local configuration explicitly enables it. */
export class RemoteControlServer {
  private server: Server | null = null;
  private config: RemoteConfig = RemoteConfigSchema.parse({ enabled: false });
  private startError: RemoteStartError | null = null;
  private state: RemoteStored;
  private code: { hash: string; expiresAt: number } | null = null;
  private failures = 0;
  private lockedUntil = 0;
  private pairWindow = { start: 0, count: 0 };
  private rates = new Map<string, { start: number; count: number }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private ports: RemotePorts,
    initial: unknown = { devices: [], audit: [] },
  ) {
    this.state = RemoteStoredSchema.parse(initial);
  }

  private now() {
    return (this.ports.now ?? Date.now)();
  }

  private interfaces() {
    return (this.ports.interfaces ?? listRemoteInterfaces)();
  }

  status(): RemoteStatus {
    return {
      enabled: Boolean(this.server),
      configured: this.config.enabled,
      address: this.config.address,
      port: this.config.port,
      startError: this.startError,
      pairingLocked: this.now() < this.lockedUntil,
      interfaces: this.interfaces(),
      devices: this.state.devices.map(({ hash: _hash, ...device }) => device),
      audit: this.state.audit,
    };
  }

  /** The saved configuration, including its network confirmation. */
  currentConfig(): RemoteConfig {
    return { ...this.config };
  }

  async configure(raw: unknown) {
    const config = RemoteConfigSchema.parse(raw);
    const loopback = isLoopbackAddress(config.address);
    if (
      !isIP(config.address) ||
      config.address === "0.0.0.0" ||
      config.address === "::" ||
      (!loopback && !config.confirmNetwork)
    ) {
      throw new RemoteConfigError("invalid-address");
    }
    // Turning off must work even after the address left this computer.
    if (config.enabled && !loopback && !this.interfaces().some((entry) => entry.address === config.address)) {
      throw new RemoteConfigError("address-unavailable");
    }
    await this.close();
    this.config = config;
    this.startError = null;
    if (!config.enabled) return this.status();
    const server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) this.json(res, 503, { error: "unavailable" });
        else res.end();
      });
    });
    server.maxConnections = 128;
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 1_000;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.address, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch {
      this.startError = "bind-failed";
      throw new RemoteConfigError("bind-failed");
    }
    this.server = server;
    return this.status();
  }

  /** Record a start failure for a configuration restored at launch. */
  markStartFailed(config: RemoteConfig, error: RemoteStartError) {
    this.config = config;
    this.startError = error;
  }

  async close() {
    const server = this.server;
    this.server = null;
    this.code = null;
    this.rates.clear();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  pairing() {
    if (!this.server || this.now() < this.lockedUntil) throw new RemotePairingUnavailableError();
    const code = randomBytes(16).toString("hex");
    const expiresAt = this.now() + PAIRING_TTL_MS;
    this.code = { hash: hash(code), expiresAt };
    return { code, expiresAt, url: `http://${this.hostName()}/#${code}` };
  }

  async revoke(id?: string) {
    return this.serial(async () => {
      const next = {
        ...this.state,
        devices: id ? this.state.devices.filter((device) => device.id !== id) : [],
      };
      await this.ports.save(next);
      this.state = next;
      this.code = null;
    });
  }

  private hostName() {
    const address = this.config.address.includes(":") ? `[${this.config.address}]` : this.config.address;
    return `${address}:${this.config.port}`;
  }

  private json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(JSON.stringify(value));
  }

  private async body(req: IncomingMessage) {
    if (req.headers["content-type"] !== "application/json") throw new Error("Invalid content type.");
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 65_536) throw new Error("Body too large.");
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }

  private limited(key: string, max: number) {
    const now = this.now();
    const old = this.rates.get(key);
    const rate = old && now - old.start < 60_000 ? old : { start: now, count: 0 };
    this.rates.set(key, rate);
    return ++rate.count > max;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    // Exact host and same-origin mutations prevent rebinding and cross-site writes.
    const host = this.hostName();
    if (
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      (req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"])))
    ) {
      return this.json(res, 403, { error: "origin" });
    }
    const path = req.url ?? "";
    if (req.method === "GET" && (path === "/" || /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path))) {
      const asset = await this.ports.asset(path === "/" ? "remote.html" : path.slice(1));
      if (!asset) return this.json(res, 404, { error: "missing" });
      res.writeHead(200, {
        "Content-Type": asset.type,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      res.end(asset.body);
      return;
    }
    if (path === "/api/pair" && req.method === "POST") {
      const now = this.now();
      if (now - this.pairWindow.start >= 60_000) this.pairWindow = { start: now, count: 0 };
      if (++this.pairWindow.count > PAIRING_MAX_PER_MINUTE || now < this.lockedUntil) {
        return this.json(res, 429, { error: "locked" });
      }
      let parsed: z.infer<typeof RemotePairSchema>;
      try {
        parsed = RemotePairSchema.parse(await this.body(req));
      } catch {
        return this.json(res, 400, { error: "invalid" });
      }
      return this.serial(async () => {
        // Body transfer and queued storage work may cross the code deadline.
        const now = this.now();
        if (now < this.lockedUntil) return this.json(res, 429, { error: "locked" });
        if (!this.server) return this.json(res, 503, { error: "unavailable" });
        if (
          !this.code ||
          now >= this.code.expiresAt ||
          !timingSafeEqual(Buffer.from(hash(parsed.code), "hex"), Buffer.from(this.code.hash, "hex"))
        ) {
          if (++this.failures >= PAIRING_MAX_FAILURES) {
            this.lockedUntil = now + PAIRING_LOCK_MS;
            this.code = null;
            // A fresh window after the lock: one typo must not re-lock at once.
            this.failures = 0;
          }
          return this.json(res, 403, { error: "invalid-code" });
        }
        this.code = null;
        if (this.state.devices.length >= REMOTE_CONTROL_MAX_DEVICES) {
          return this.json(res, 409, { error: "device-limit" });
        }
        const token = randomBytes(32).toString("hex");
        const device = { id: randomUUID(), name: parsed.name, createdAt: now, lastSeen: now, hash: hash(token) };
        const next = { ...this.state, devices: [...this.state.devices, device] };
        await this.ports.save(next);
        this.state = next;
        this.failures = 0;
        return this.json(res, 200, { token });
      });
    }
    const bearer = req.headers.authorization;
    if (!bearer || !/^Bearer [a-f0-9]{64}$/.test(bearer)) return this.json(res, 401, { error: "unauthorized" });
    const digest = Buffer.from(hash(bearer.slice(7)), "hex");
    const device = this.state.devices.find((entry) => timingSafeEqual(Buffer.from(entry.hash, "hex"), digest));
    if (!device) return this.json(res, 401, { error: "unauthorized" });
    if (this.limited(device.id, DEVICE_MAX_PER_MINUTE)) return this.json(res, 429, { error: "rate" });
    const seenAt = this.now();
    if (seenAt - device.lastSeen >= LAST_SEEN_PERSIST_MS) {
      device.lastSeen = seenAt;
      void this.serial(() => this.ports.save(this.state)).catch(() => undefined);
    }
    if (path === "/api/state" && req.method === "GET") {
      return this.json(res, 200, RemoteSnapshotSchema.parse(await this.ports.snapshot()));
    }
    if (path !== "/api/action" || req.method !== "POST") return this.json(res, 404, { error: "forbidden" });
    let action: RemoteAction;
    try {
      action = RemoteActionSchema.parse(await this.body(req));
    } catch {
      return this.json(res, 400, { error: "invalid" });
    }
    return this.serial(async () => {
      if (!this.server) return this.json(res, 503, { error: "unavailable" });
      if (!this.state.devices.some((entry) => entry.id === device.id)) {
        return this.json(res, 401, { error: "unauthorized" });
      }
      // An attempt that never reached the desktop (`unavailable`) may be retried;
      // any other recorded outcome settles the request for this boundary.
      const duplicate = this.state.audit.some(
        (entry) => entry.result.reason !== "unavailable" && sameRequest(entry.action, action),
      );
      const auditAction =
        action.kind === "question"
          ? {
              kind: action.kind,
              workspaceId: action.workspaceId,
              taskId: action.taskId,
              turnId: action.turnId,
              requestId: action.requestId,
              messageId: action.messageId,
            }
          : action;
      const audit: RemoteAudit = {
        id: randomUUID(),
        deviceId: device.id,
        deviceName: device.name,
        time: this.now(),
        action: auditAction,
        result: { ok: false, reason: "unavailable" },
      };
      // Persist intent before dispatch: a storage failure cannot cause an unrecorded action.
      this.state = { ...this.state, audit: [...this.state.audit, audit].slice(-REMOTE_CONTROL_MAX_AUDIT) };
      await this.ports.save(this.state);
      try {
        audit.result = duplicate
          ? { ok: false, reason: "expired" }
          : this.server
            ? RemoteResultSchema.parse(await this.ports.act(action))
            : { ok: false, reason: "unavailable" };
      } catch {
        audit.result = { ok: false, reason: "unavailable" };
      }
      await this.ports.save(this.state);
      await this.ports.record(audit);
      return this.json(res, 200, audit.result);
    });
  }
}
