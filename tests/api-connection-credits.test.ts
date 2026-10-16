import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import {
  fetchApiConnectionCredits,
  readStoredApiConnectionCredits,
  resetApiConnectionCreditsCache,
} from "../electron/main/api-connection-check";
import { VERCEL_AI_GATEWAY } from "../src/lib/providers/api-connections";

const secretId = "11111111-1111-4111-8111-111111111111";
const otherSecretId = "22222222-2222-4222-8222-222222222222";
const KEY = "fixture-credits-key";
let root: string;
let registry: ProviderAccountRegistry;
const originalRoot = process.env.STAVE_USER_DATA_PATH;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-api-credits-")));
  process.env.STAVE_USER_DATA_PATH = root;
  registry = new ProviderAccountRegistry(root);
  resetApiConnectionCreditsCache();
});
afterEach(() => {
  if (originalRoot === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = originalRoot;
  rmSync(root, { recursive: true, force: true });
});

/** A fetch that answers only the credits URL and records what it was sent. */
function answering(answer: () => Response | Promise<Response>) {
  const seen: Array<{ url: string; auth?: string; redirect?: RequestRedirect; signal: boolean }> = [];
  const request = (async (url: unknown, init: RequestInit = {}) => {
    seen.push({
      url: String(url),
      auth: (init.headers as Record<string, string> | undefined)?.Authorization,
      redirect: init.redirect,
      signal: init.signal instanceof AbortSignal,
    });
    if (url !== VERCEL_AI_GATEWAY.creditsUrl) throw new Error(`unexpected ${String(url)}`);
    return answer();
  }) as typeof fetch;
  return { request, seen };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
const models = [{ id: "anthropic/claude-sonnet-5" }];
const createVercel = () => registry.createApiConnection({ label: "Company gateway", kind: "vercel-ai-gateway", secretId, models });
const resolveKey = async () => ({ value: KEY });

describe("credits: reading the balance", () => {
  test("decimal strings, as Vercel documents them, pass through unchanged", async () => {
    const { request, seen } = answering(json({ balance: "95.50", total_used: "4.50" }));
    const result = await fetchApiConnectionCredits(KEY, request);
    expect(result).toEqual({ ok: true, balanceUsd: "95.50", totalUsedUsd: "4.50" });
    // The key goes only to the credits URL, as a bearer, never across a redirect, with a timeout.
    expect(seen).toEqual([{ url: VERCEL_AI_GATEWAY.creditsUrl, auth: `Bearer ${KEY}`, redirect: "error", signal: true }]);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  test("numbers are read as the same decimal; extra fields are ignored", async () => {
    const { request } = answering(json({ balance: 95.5, total_used: 0, currency: "USD" }));
    expect(await fetchApiConnectionCredits(KEY, request)).toEqual({ ok: true, balanceUsd: "95.5", totalUsedUsd: "0" });
  });

  test("anything else is unknown, never a guessed number", async () => {
    const malformed: Array<() => Response> = [
      () => new Response("not json"),
      () => new Response(""),
      json({ balance: "95.50" }),
      json({ balance: "about $95", total_used: "4.50" }),
      json({ balance: "1e3", total_used: "4.50" }),
      json({ balance: null, total_used: "4.50" }),
      json({ balance: { amount: "95.50" }, total_used: "4.50" }),
      json({ balance: 1e-7, total_used: "4.50" }),
      json(["95.50", "4.50"]),
    ];
    for (const answer of malformed) {
      const result = await fetchApiConnectionCredits(KEY, answering(answer).request);
      expect(result).toEqual({ ok: false, reason: "unexpected" });
    }
  });

  test("401, 402 and 429 map to what the key holder can do; the body is dropped", async () => {
    const cases = [[401, "invalid-key"], [403, "invalid-key"], [402, "budget-exhausted"], [429, "rate-limited"], [500, "unexpected"]] as const;
    for (const [status, reason] of cases) {
      const { request } = answering(json({ error: { message: `fixture-sensitive-body ${KEY}` } }, status));
      const result = await fetchApiConnectionCredits(KEY, request);
      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain("fixture-sensitive-body");
      expect(JSON.stringify(result)).not.toContain(KEY);
    }
  });

  test("a timeout, a dropped connection and an untrusted certificate keep their own reasons", async () => {
    const timeout = answering(() => { throw new DOMException(`aborted ${KEY}`, "TimeoutError"); });
    expect(await fetchApiConnectionCredits(KEY, timeout.request)).toEqual({ ok: false, reason: "timeout" });
    const offline = answering(() => { throw new TypeError("fetch failed"); });
    expect(await fetchApiConnectionCredits(KEY, offline.request)).toEqual({ ok: false, reason: "unreachable" });
    const proxy = answering(() => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "SELF_SIGNED_CERT_IN_CHAIN" } }); });
    expect(await fetchApiConnectionCredits(KEY, proxy.request)).toEqual({ ok: false, reason: "certificate-untrusted" });
    // The body stream timing out after the headers arrived is still a timeout.
    const slowBody = answering(() => new Response(new ReadableStream({
      pull(controller) { controller.error(new DOMException("body timed out", "TimeoutError")); },
    })));
    expect(await fetchApiConnectionCredits(KEY, slowBody.request)).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("credits: the stored connection", () => {
  test("concurrent reads share one request and a success is reused for a minute", async () => {
    const connection = createVercel();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { request, seen } = answering(async () => { await gate; return json({ balance: "95.50", total_used: "4.50" })(); });
    const now = 1_000_000;
    const reads = [1, 2, 3].map(() => readStoredApiConnectionCredits(connection.id, resolveKey, request, now));
    release();
    const results = await Promise.all(reads);
    expect(seen).toHaveLength(1);
    for (const result of results) expect(result).toEqual({ ok: true, balanceUsd: "95.50", totalUsedUsd: "4.50" });

    expect(await readStoredApiConnectionCredits(connection.id, resolveKey, request, now + 59_000)).toMatchObject({ ok: true });
    expect(seen).toHaveLength(1);
    expect(await readStoredApiConnectionCredits(connection.id, resolveKey, request, now + 60_000)).toMatchObject({ ok: true });
    expect(seen).toHaveLength(2);
  });

  test("a failure is not kept, and a new key reference reads again", async () => {
    const connection = createVercel();
    let status = 429;
    const { request, seen } = answering(() => (status === 200 ? json({ balance: "10", total_used: "1" })() : json({}, status)()));
    expect(await readStoredApiConnectionCredits(connection.id, resolveKey, request, 0)).toEqual({ ok: false, reason: "rate-limited" });
    status = 200;
    expect(await readStoredApiConnectionCredits(connection.id, resolveKey, request, 1)).toEqual({ ok: true, balanceUsd: "10", totalUsedUsd: "1" });
    expect(seen).toHaveLength(2);
    registry.updateApiConnection({ id: connection.id, secretId: otherSecretId });
    await readStoredApiConnectionCredits(connection.id, resolveKey, request, 2);
    expect(seen).toHaveLength(3);
  });

  test("only Vercel connections are read; a missing or locked key never reaches the network", async () => {
    const request = (async () => { throw new Error("must not fetch"); }) as typeof fetch;
    const custom = registry.createApiConnection({
      label: "Proxy", kind: "custom", secretId, models, endpoints: { "claude-code": "https://proxy.example.test/anthropic" },
    });
    expect(await readStoredApiConnectionCredits(custom.id, resolveKey, request)).toEqual({ ok: false, reason: "unsupported" });
    const vercel = createVercel();
    expect(await readStoredApiConnectionCredits(vercel.id, async () => null, request)).toEqual({ ok: false, reason: "missing-key" });
    expect(await readStoredApiConnectionCredits(vercel.id, async () => { throw new Error("locked"); }, request)).toEqual({ ok: false, reason: "missing-key" });
    expect(await readStoredApiConnectionCredits(vercel.id, async () => ({ value: "a\nb" }), request)).toEqual({ ok: false, reason: "missing-key" });
    expect(await readStoredApiConnectionCredits("88888888-8888-4888-8888-888888888888", resolveKey, request)).toEqual({ ok: false, reason: "unexpected" });
  });
});
