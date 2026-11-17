import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import { RemoteActionSchema, RemoteConfigSchema, RemotePairSchema, RemoteSnapshotSchema, RemoteResultSchema, RemoteDeviceSchema, RemoteAuditSchema, type RemoteAction, type RemoteResult } from "../../../src/lib/remote-control";
const StoredSchema = z.object({
    devices: z.array(RemoteDeviceSchema.extend({
        hash: z.string().regex(/^[a-f0-9]{64}$/)
    }).strict()).max(32), audit: z.array(RemoteAuditSchema).max(100)
}).strict();
type Stored = z.infer<typeof StoredSchema>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export interface RemotePorts {
    snapshot(): Promise<z.infer<typeof RemoteSnapshotSchema>>;
    act(action: RemoteAction): Promise<RemoteResult>;
    save(state: Stored): Promise<void>;
    record(audit: z.infer<typeof RemoteAuditSchema>): Promise<void>;
    asset(path: string): Promise<{
        body: Uint8Array;
        type: string;
    } | null>;
    now?: () => number;
}
/** No listener exists until local configuration explicitly enables it. */
export class RemoteControlServer {
    private server: Server | null = null;
    private config = RemoteConfigSchema.parse({
        enabled: false
    });
    private state: Stored;
    private code: {
        hash: string;
        expiresAt: number;
    } | null = null;
    private failures = 0;
    private lockedUntil = 0;
    private pairWindow = {
        start: 0, count: 0
    };
    private rates = new Map<string, {
        start: number;
        count: number;
    }>();
    private queue: Promise<unknown> = Promise.resolve();
    constructor(private ports: RemotePorts, initial: unknown = {
        devices: [], audit: []
    }) { this.state = StoredSchema.parse(initial); }
    private now() { return (this.ports.now ?? Date.now)(); }
    status() { return {
        enabled: Boolean(this.server), address: this.config.address, port: this.config.port, devices: this.state.devices.map(({ hash: _hash, ...device }) => device), audit: this.state.audit
    }; }
    async configure(raw: unknown) {
        const config = RemoteConfigSchema.parse(raw);
        const loopback = config.address === "127.0.0.1" || config.address === "::1";
        if (!isIP(config.address) || (!loopback && (!config.confirmNetwork || !Object.values(networkInterfaces()).flat().some(i => i?.address === config.address))))
            throw new Error("Invalid interface or missing network confirmation.");
        await this.close();
        this.config = config;
        if (!config.enabled)
            return this.status();
        const server = createServer((req, res) => { void this.handle(req, res).catch(() => { if (!res.headersSent)
            this.json(res, 503, {
                error: "unavailable"
            });
        else
            res.end(); }); });
        server.maxConnections = 128;
        server.requestTimeout = 10000;
        server.headersTimeout = 10000;
        server.keepAliveTimeout = 1000;
        await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.port, config.address, () => { server.off("error", reject); resolve(); }); });
        this.server = server;
        return this.status();
    }
    async close() { const server = this.server; this.server = null; this.code = null; this.rates.clear(); if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    } }
    pairing() {
        if (!this.server || this.now() < this.lockedUntil)
            throw new Error("Pairing unavailable.");
        const code = randomBytes(16).toString("hex");
        const expiresAt = this.now() + 300000;
        this.code = {
            hash: hash(code), expiresAt
        };
        const address = this.config.address.includes(":") ? `[${this.config.address}]` : this.config.address;
        return {
            code, expiresAt, url: `http://${address}:${this.config.port}/#${code}`
        };
    }
    async revoke(id?: string) {
        return this.serial(async () => {
            const next = {
                ...this.state, devices: id ? this.state.devices.filter(d => d.id !== id) : []
            };
            await this.ports.save(next);
            this.state = next;
            this.code = null;
        });
    }
    private json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, {
        "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
    }); res.end(JSON.stringify(value)); }
    private async body(req: IncomingMessage) {
        if (req.headers["content-type"] !== "application/json")
            throw new Error("Invalid content type.");
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of req) {
            length += chunk.length;
            if (length > 65536)
                throw new Error("Body too large.");
            chunks.push(Buffer.from(chunk));
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    }
    private limited(key: string, max: number) { const now = this.now(); const old = this.rates.get(key); const rate = old && now - old.start < 60000 ? old : {
        start: now, count: 0
    }; this.rates.set(key, rate); return ++rate.count > max; }
    private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation); this.queue = result.catch(() => undefined); return result; }
    private async handle(req: IncomingMessage, res: ServerResponse) {
        // Exact host and same-origin mutations prevent rebinding and cross-site writes.
        const address = this.config.address.includes(":") ? `[${this.config.address}]` : this.config.address;
        const host = `${address}:${this.config.port}`;
        if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || (req.headers["sec-fetch-site"] && ![
            "same-origin", "none"
        ].includes(String(req.headers["sec-fetch-site"]))))
            return this.json(res, 403, {
                error: "origin"
            });
        const path = req.url ?? "";
        if (req.method === "GET" && (path === "/" || /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path))) {
            const asset = await this.ports.asset(path === "/" ? "remote.html" : path.slice(1));
            if (!asset)
                return this.json(res, 404, {
                    error: "missing"
                });
            res.writeHead(200, {
                "Content-Type": asset.type, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            });
            res.end(asset.body);
            return;
        }
        if (path === "/api/pair" && req.method === "POST") {
            const now = this.now();
            if (now - this.pairWindow.start >= 60000)
                this.pairWindow = {
                    start: now, count: 0
                };
            if (++this.pairWindow.count > 10 || now < this.lockedUntil)
                return this.json(res, 429, {
                    error: "locked"
                });
            let parsed: z.infer<typeof RemotePairSchema>;
            try {
                parsed = RemotePairSchema.parse(await this.body(req));
            }
            catch {
                return this.json(res, 400, {
                    error: "invalid"
                });
            }
            return this.serial(async () => {
                if (!this.server)
                    return this.json(res, 503, {
                        error: "unavailable"
                    });
                if (!this.code || now >= this.code.expiresAt || !timingSafeEqual(Buffer.from(hash(parsed.code), "hex"), Buffer.from(this.code.hash, "hex"))) {
                    if (++this.failures >= 5) {
                        this.lockedUntil = now + 300000;
                        this.code = null;
                    }
                    return this.json(res, 403, {
                        error: "invalid-code"
                    });
                }
                this.code = null;
                if (this.state.devices.length >= 32)
                    return this.json(res, 409, {
                        error: "device-limit"
                    });
                const token = randomBytes(32).toString("hex");
                const device = {
                    id: randomUUID(), name: parsed.name, lastSeen: now, hash: hash(token)
                };
                const next = {
                    ...this.state, devices: [
                        ...this.state.devices, device
                    ]
                };
                await this.ports.save(next);
                this.state = next;
                this.failures = 0;
                return this.json(res, 200, {
                    token
                });
            });
        }
        const bearer = req.headers.authorization;
        if (!bearer || !/^Bearer [a-f0-9]{64}$/.test(bearer))
            return this.json(res, 401, {
                error: "unauthorized"
            });
        const digest = hash(bearer.slice(7));
        const device = this.state.devices.find(d => timingSafeEqual(Buffer.from(d.hash, "hex"), Buffer.from(digest, "hex")));
        if (!device)
            return this.json(res, 401, {
                error: "unauthorized"
            });
        if (this.limited(device.id, 60))
            return this.json(res, 429, {
                error: "rate"
            });
        device.lastSeen = this.now();
        if (path === "/api/state" && req.method === "GET")
            return this.json(res, 200, RemoteSnapshotSchema.parse(await this.ports.snapshot()));
        if (path !== "/api/action" || req.method !== "POST")
            return this.json(res, 404, {
                error: "forbidden"
            });
        let action: RemoteAction;
        try {
            action = RemoteActionSchema.parse(await this.body(req));
        }
        catch {
            return this.json(res, 400, {
                error: "invalid"
            });
        }
        return this.serial(async () => {
            if (!this.server)
                return this.json(res, 503, {
                    error: "unavailable"
                });
            if (!this.state.devices.some(d => d.id === device.id))
                return this.json(res, 401, {
                    error: "unauthorized"
                });
            const duplicate = this.state.audit.some(entry => entry.action.workspaceId === action.workspaceId && entry.action.taskId === action.taskId && entry.action.turnId === action.turnId && (action.kind === "stop" ? entry.action.kind === "stop" : entry.action.kind !== "stop" && entry.action.requestId === action.requestId && entry.action.messageId === action.messageId));
            const auditAction = action.kind === "question" ? {
                kind: action.kind, workspaceId: action.workspaceId, taskId: action.taskId, turnId: action.turnId, requestId: action.requestId, messageId: action.messageId
            } : action;
            const audit = {
                id: randomUUID(), deviceId: device.id, deviceName: device.name, time: this.now(), action: auditAction, result: {
                    ok: false, reason: "unavailable"
                } as RemoteResult
            };
            // Persist intent before dispatch: a storage failure cannot cause an unrecorded action.
            this.state = {
                ...this.state, audit: [
                    ...this.state.audit, audit
                ].slice(-100)
            };
            await this.ports.save(this.state);
            try {
                audit.result = duplicate ? {
                    ok: false, reason: "expired"
                } : this.server ? RemoteResultSchema.parse(await this.ports.act(action)) : {
                    ok: false, reason: "unavailable"
                };
            }
            catch {
                audit.result = {
                    ok: false, reason: "expired"
                };
            }
            await this.ports.save(this.state);
            await this.ports.record(audit);
            return this.json(res, 200, audit.result);
        });
    }
}
