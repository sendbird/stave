import { afterEach, describe, expect, test } from "bun:test";
import { checkApiConnection, discoverApiConnectionModels, resetVercelCatalogCache } from "../electron/main/api-connection-check";
import { checkClaudeGateway } from "../electron/main/claude-gateway-check";
import {
  VERCEL_AI_GATEWAY,
  classifyApiConnectionRequestError,
  type ApiConnection,
} from "../src/lib/providers/api-connections";
import { describeApiConnectionCheck, describeApiConnectionFailure } from "../src/lib/providers/api-connection-failure";

const vercel: ApiConnection = {
  id: "77777777-7777-4777-8777-777777777777",
  label: "Vercel",
  kind: "vercel-ai-gateway",
  secretId: "11111111-1111-4111-8111-111111111111",
  endpoints: { ...VERCEL_AI_GATEWAY.endpoints },
  models: [{ id: "anthropic/claude-sonnet-5" }],
};
const custom: ApiConnection = { ...vercel, kind: "custom", endpoints: { "claude-code": "https://proxy.example.test/anthropic" } };

/** Shaped like undici: `TypeError("fetch failed")` with the socket error as `cause`. */
function fetchFailed(cause: Record<string, unknown>) {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(String(cause.message ?? "socket")), cause) });
}
const throwing = (error: unknown) => (async () => { throw error; }) as unknown as typeof fetch;

afterEach(() => resetVercelCatalogCache());

describe("gateway request failure classes", () => {
  test("reads codes and names through the cause chain", () => {
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" }))).toBe("certificate-untrusted");
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "SELF_SIGNED_CERT_IN_CHAIN" }))).toBe("certificate-untrusted");
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "CERT_HAS_EXPIRED" }))).toBe("certificate-untrusted");
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "UND_ERR_CONNECT_TIMEOUT" }))).toBe("timeout");
    expect(classifyApiConnectionRequestError(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }))).toBe("timeout");
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "ENOTFOUND" }))).toBe("unreachable");
    expect(classifyApiConnectionRequestError(fetchFailed({ code: "ECONNREFUSED" }))).toBe("unreachable");
    expect(classifyApiConnectionRequestError(new TypeError("fetch failed"))).toBe("unreachable");
    // Electron's network stack reports by message.
    expect(classifyApiConnectionRequestError(new Error("net::ERR_CERT_AUTHORITY_INVALID"))).toBe("certificate-untrusted");
    expect(classifyApiConnectionRequestError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toBe("unreachable");
  });

  test("errors that are not about the request stay unclassified", () => {
    expect(classifyApiConnectionRequestError(new SyntaxError("Unexpected token < in JSON"))).toBeNull();
    expect(classifyApiConnectionRequestError(new TypeError("Cannot read properties of undefined"))).toBeNull();
    expect(classifyApiConnectionRequestError(null)).toBeNull();
  });

  test("a check reports the class, never the raw error text", async () => {
    const raw = "fixture-raw-proxy-text-must-not-surface";
    const cases = [
      [fetchFailed({ code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", message: raw }), "certificate-untrusted"],
      [Object.assign(new Error(raw), { name: "TimeoutError" }), "timeout"],
      [fetchFailed({ code: "ENOTFOUND", message: raw }), "unreachable"],
    ] as const;
    for (const [error, status] of cases) {
      for (const connection of [vercel, custom]) {
        const result = await checkApiConnection({ connection, token: "fixture-token", request: throwing(error) });
        expect(result).toMatchObject({ ok: false, status });
        expect(JSON.stringify(result)).not.toContain(raw);
        expect(JSON.stringify(result)).not.toContain("fixture-token");
      }
    }
  });

  test("the custom Claude endpoint path keeps an unreadable list apart from a failed request", async () => {
    const unreadable = (async () => new Response("<html>not json</html>")) as typeof fetch;
    const result = await checkClaudeGateway({ gateway: { baseUrl: "https://proxy.example.test/anthropic", secretId: vercel.secretId, models: ["anthropic/claude-sonnet-5"] }, token: "k", request: unreadable });
    expect(result.requestFailure).toBeUndefined();
    expect((await checkApiConnection({ connection: custom, token: "k", request: unreadable })).status).toBe("unexpected");
  });

  test("the model list says why it could not be read", async () => {
    expect(await discoverApiConnectionModels(throwing(fetchFailed({ code: "SELF_SIGNED_CERT_IN_CHAIN" })))).toMatchObject({ ok: false, reason: "certificate-untrusted" });
    resetVercelCatalogCache();
    expect(await discoverApiConnectionModels((async () => new Response("", { status: 429 })) as typeof fetch)).toMatchObject({ ok: false, reason: "rate-limited" });
    resetVercelCatalogCache();
    expect(await discoverApiConnectionModels((async () => new Response("", { status: 500 })) as typeof fetch)).toMatchObject({ ok: false, reason: "unexpected" });
  });

  test("each class has its own words, and what main describes passes through", () => {
    const statuses = ["unreachable", "timeout", "certificate-untrusted", "invalid-key", "budget-exhausted", "rate-limited", "missing-key"] as const;
    const texts = statuses.map((status) => describeApiConnectionFailure(status));
    expect(texts.every((text) => typeof text === "string" && text.length > 0)).toBe(true);
    expect(new Set(texts).size).toBe(statuses.length);
    expect(describeApiConnectionFailure("certificate-untrusted")).toContain("proxy");
    expect(describeApiConnectionCheck({ ok: false, status: "models-missing", missingModels: ["x/y"], message: "main says x/y is missing" })).toBe("main says x/y is missing");
    expect(describeApiConnectionCheck({ ok: false, status: "timeout", missingModels: [], message: "main text" })).not.toBe("main text");
  });
});
