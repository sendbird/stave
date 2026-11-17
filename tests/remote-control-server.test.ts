import { request } from "node:http";
import { afterEach, describe, expect, test } from "bun:test";
import { RemoteControlServer, type RemotePorts } from "../electron/main/remote-control/server";
const servers: RemoteControlServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const action = {
    kind: "approval" as const, workspaceId: "w", taskId: "t", turnId: "turn", messageId: "m", requestId: "r", approved: false
};
let nextPort = 6500;
async function setup() {
    let time = 1000000;
    let onTimeRead = () => {};
    const actions: unknown[] = [];
    const saves: unknown[] = [];
    const audit: unknown[] = [];
    const ports: RemotePorts = {
        snapshot: async () => ({
            tasks: [], requests: []
        }), act: async (a) => { actions.push(a); return actions.length === 1 ? {
            ok: true, reason: "applied"
        } : {
            ok: false, reason: "expired"
        }; }, save: async (s) => { saves.push(structuredClone(s)); }, record: async (a) => { audit.push(a); }, asset: async () => null, now: () => { onTimeRead(); return time; }
    };
    const server = new RemoteControlServer(ports);
    servers.push(server);
    expect(server.status().enabled).toBe(false);
    const port = nextPort++;
    await server.configure({
        enabled: true, port
    });
    const base = `http://127.0.0.1:${port}`;
    const post = (path: string, data: unknown, token?: string, headers = {}) => fetch(base + path, {
        method: "POST", headers: {
            "Content-Type": "application/json", ...(token ? {
                Authorization: `Bearer ${token}`
            } : {}), ...headers
        }, body: JSON.stringify(data)
    });
    const pair = async () => { const p = server.pairing(); const r = await post("/api/pair", {
        code: p.code, name: "Phone"
    }); expect(r.status).toBe(200); return (await r.json() as {
        token: string;
    }).token; };
    return {
        server, base, post, pair, actions, saves, audit, onTimeRead: (callback: () => void) => { onTimeRead = callback; }, advance: (ms: number) => { time += ms; }
    };
}
describe("remote control boundary", () => {
    test("starts disabled, binds loopback only by default, requires network confirmation", async () => {
        const s = await setup();
        expect(s.server.status()).toMatchObject({
            address: "127.0.0.1", enabled: true
        });
        await expect(s.server.configure({
            enabled: true, address: "0.0.0.0", port: 6500
        })).rejects.toThrow();
        await s.server.close();
        expect(s.server.status().enabled).toBe(false);
        expect(() => s.server.pairing()).toThrow();
    });
    test("single-use code; only hashes persisted; revocation rejects the bearer", async () => {
        const s = await setup();
        const code = s.server.pairing().code;
        const r = await s.post("/api/pair", {
            code, name: "Phone"
        });
        const { token } = await r.json() as {
            token: string;
        };
        expect(token.length).toBe(64);
        expect(JSON.stringify(s.saves)).not.toContain(token);
        expect(JSON.stringify(s.saves)).not.toContain(code);
        expect((await s.post("/api/pair", {
            code, name: "Again"
        })).status).toBe(403);
        expect((await fetch(s.base + "/api/state")).status).toBe(401);
        expect((await fetch(s.base + "/api/state", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })).status).toBe(200);
        await s.server.revoke();
        expect((await s.post("/api/action", action, token)).status).toBe(401);
    });
    test("expires after five minutes and locks repeated failures", async () => {
        const s = await setup();
        const code = s.server.pairing().code;
        s.advance(300000);
        expect((await s.post("/api/pair", {
            code, name: "Phone"
        })).status).toBe(403);
        for (let i = 0; i < 4; i++)
            await s.post("/api/pair", {
                code: "0".repeat(32), name: "Phone"
            });
        expect((await s.post("/api/pair", {
            code, name: "Phone"
        })).status).toBe(429);
        expect(() => s.server.pairing()).toThrow();
        s.advance(300001);
        expect(s.server.pairing().code).toHaveLength(32);
    });
    test("strict allowlist rejects extra fields, persistent approval and forbidden commands", async () => {
        const s = await setup();
        const token = await s.pair();
        for (const body of [
            {
                ...action, scope: "always"
            }, {
                ...action, extra: true
            }, {
                ...action, kind: "prompt"
            }, {
                ...action, kind: "archive"
            }, {
                ...action, kind: "settings"
            }
        ])
            expect((await s.post("/api/action", body, token)).status).toBe(400);
        expect(s.actions).toHaveLength(0);
        expect((await s.post("/api/action", action, token, {
            Origin: "http://untrusted.invalid"
        })).status).toBe(403);
    });
    test("a code expiring while the request body arrives is rejected", async () => {
        const s = await setup();
        const code = s.server.pairing().code;
        let accepted!: () => void;
        const headersRead = new Promise<void>(resolve => { accepted = resolve; });
        s.onTimeRead(accepted);
        let pending!: ReturnType<typeof request>;
        const response = new Promise<number>((resolve, reject) => {
            pending = request(s.base + "/api/pair", { method: "POST", headers: { "Content-Type": "application/json" } }, res => { res.resume(); resolve(res.statusCode!); });
            pending.on("error", reject);
            pending.flushHeaders();
        });
        await headersRead;
        s.advance(300001);
        pending.end(JSON.stringify({ code, name: "Phone" }));
        expect(await response).toBe(403);
    });
    test("bounded polling and same-origin policy", async () => {
        const s = await setup();
        const token = await s.pair();
        expect((await s.post("/api/action", action, token, {
            "Sec-Fetch-Site": "cross-site"
        })).status).toBe(403);
        for (let i = 0; i < 60; i++)
            expect((await fetch(s.base + "/api/state", {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })).status).toBe(200);
        expect((await fetch(s.base + "/api/state", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })).status).toBe(429);
        s.advance(60001);
        expect((await fetch(s.base + "/api/state", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })).status).toBe(200);
    });
    test("routes question and stop envelopes without permitting broader authority", async () => {
        const s = await setup();
        const token = await s.pair();
        const question = {
            kind: "question", workspaceId: "w", taskId: "t", turnId: "turn", requestId: "q", messageId: "m", answers: {
                key: "answer"
            }
        };
        const stop = {
            kind: "stop", workspaceId: "w", taskId: "t", turnId: "turn"
        };
        expect((await s.post("/api/action", question, token)).status).toBe(200);
        expect((await s.post("/api/action", stop, token)).status).toBe(200);
        expect(s.actions).toEqual([
            question, stop
        ]);
        expect(JSON.stringify(s.saves)).not.toContain("answer");
    });
    test("concurrent duplicate answers dispatch once", async () => {
        const s = await setup();
        const token = await s.pair();
        const results = await Promise.all([
            s.post("/api/action", action, token), s.post("/api/action", action, token)
        ]);
        expect(await results[0]!.json()).toEqual({
            ok: true, reason: "applied"
        });
        expect(await results[1]!.json()).toEqual({
            ok: false, reason: "expired"
        });
        expect(s.actions).toHaveLength(1);
    });
    test("dispatches allowed actions and writes audit intent and result", async () => {
        const s = await setup();
        const token = await s.pair();
        expect(await (await s.post("/api/action", action, token)).json()).toEqual({
            ok: true, reason: "applied"
        });
        expect(await (await s.post("/api/action", action, token)).json()).toEqual({
            ok: false, reason: "expired"
        });
        expect(s.actions).toEqual([
            action
        ]);
        expect(s.audit).toHaveLength(2);
        expect(s.server.status().audit[0]).toMatchObject({
            deviceName: "Phone", time: 1000000
        });
    });
});
