import { createHash } from "node:crypto";
import { z } from "zod";
import {
  VERCEL_AI_GATEWAY,
  apiConnectionRoutingModelId,
  classifyApiConnectionHttpStatus,
  classifyApiConnectionRequestError,
  describeApiConnectionHttpStatus,
  type ApiConnection,
  type ApiConnectionCatalogFailure,
  type ApiConnectionCatalogResult,
  type ApiConnectionCheckResult,
  type ApiConnectionCreditsResult,
  type ApiConnectionRequestFailure,
} from "../../src/lib/providers/api-connections";
import { filterApiConnectionCatalog } from "../../src/lib/providers/api-connection-catalog";
import { getProviderAccountRegistry } from "../provider-accounts/registry";
import { checkClaudeGateway } from "./claude-gateway-check";

const CATALOG_MAX_BYTES = 8_000_000;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const CREDITS_MAX_BYTES = 64_000;
const CREDITS_TTL_MS = 60_000;

type Fetch = typeof fetch;

/** A gateway answer that was not 2xx; only the status is kept. */
class GatewayHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function catalogFailureReason(error: unknown): ApiConnectionCatalogFailure {
  if (error instanceof GatewayHttpError) return error.status === 429 ? "rate-limited" : "unexpected";
  return classifyApiConnectionRequestError(error) ?? "unexpected";
}

/** Reads at most `maxBytes` of a JSON body; never follows a redirect upstream of this. */
async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error("too large");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel(); reader.releaseLock(); }
  return JSON.parse(text);
}

let catalogCache: { payload: unknown; fetchedAt: number } | null = null;

/** The public Vercel AI Gateway catalog. No key is sent: the endpoint is unauthenticated. */
export async function fetchVercelCatalog(request: Fetch = fetch, now = Date.now()): Promise<unknown> {
  if (catalogCache && now - catalogCache.fetchedAt < CATALOG_TTL_MS) return catalogCache.payload;
  const response = await request(VERCEL_AI_GATEWAY.modelsUrl, { redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new GatewayHttpError(response.status);
  }
  const payload = await readBoundedJson(response, CATALOG_MAX_BYTES);
  catalogCache = { payload, fetchedAt: now };
  return payload;
}

export function resetVercelCatalogCache() {
  catalogCache = null;
}

export async function discoverApiConnectionModels(request: Fetch = fetch, purpose: "coding" | "decision" = "coding"): Promise<ApiConnectionCatalogResult> {
  try {
    return { ok: true, models: filterApiConnectionCatalog(await fetchVercelCatalog(request), Date.now(), purpose) };
  } catch (error) {
    return {
      ok: false,
      models: [],
      reason: catalogFailureReason(error),
      message: "Could not load the Vercel AI Gateway model list. Check your network, then try again; you can also type model IDs.",
    };
  }
}

function result(status: ApiConnectionCheckResult["status"], message: string, missingModels: string[] = []): ApiConnectionCheckResult {
  return { ok: status === "ok", status, message, missingModels };
}

function httpFailure(status: number) {
  return result(classifyApiConnectionHttpStatus(status), describeApiConnectionHttpStatus(status));
}

const REQUEST_FAILURE_MESSAGE: Record<ApiConnectionRequestFailure, string> = {
  unreachable: "Could not reach the gateway. Check your network and the endpoint URL, then try again.",
  timeout: "The gateway did not answer in time. Try again; if it keeps happening, check your network or proxy.",
  "certificate-untrusted": "The gateway's TLS certificate is not trusted on this network. A proxy that inspects traffic can cause this.",
};

function requestFailureStatus(error: unknown): ApiConnectionRequestFailure {
  return classifyApiConnectionRequestError(error) ?? "unreachable";
}

/** The request got no usable answer; the message is fixed, never the raw error. */
function requestFailure(error: unknown) {
  const status = requestFailureStatus(error);
  return result(status, REQUEST_FAILURE_MESSAGE[status]);
}

/** Bearer key, no redirects (the key must not follow one), and a bounded wait. */
function authorizedRequest(token: string) {
  return { headers: { Authorization: `Bearer ${token}` }, redirect: "error" as const, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

const LISTED = "The key works and the gateway lists every pinned model. Send a turn to confirm tools and streaming work.";
const missingMessage = (missing: string[]) =>
  `The key works, but the gateway does not list ${missing.join(", ")}. Pick those models from the list again, or check the IDs with whoever runs the gateway.`;

/**
 * Proves the key and the pinned models without inference: a Vercel connection
 * reads `GET /v1/credits` with the key, then compares pins with the public
 * catalog; a custom connection asks its Claude endpoint for `GET /v1/models`,
 * or its Codex endpoint for `GET /models`. Model IDs compare in routing form,
 * so `claude-code/anthropic/claude-sonnet-5[1m]` matches `anthropic/claude-sonnet-5`.
 */
export async function checkApiConnection(args: { connection: ApiConnection; token: string; request?: Fetch }): Promise<ApiConnectionCheckResult> {
  const request = args.request ?? fetch;
  const { connection } = args;
  const pinned = connection.models.map((model) => model.id);
  const authorized = authorizedRequest(args.token);
  try {
    if (connection.kind === "vercel-ai-gateway") {
      const credits = await request(VERCEL_AI_GATEWAY.creditsUrl, authorized);
      await credits.body?.cancel();
      if (!credits.ok) return httpFailure(credits.status);
      let listed: Set<string>;
      try {
        const payload = await fetchVercelCatalog(request) as { data?: Array<{ id?: unknown }> };
        listed = new Set((payload.data ?? []).flatMap((entry) => (typeof entry.id === "string" ? [apiConnectionRoutingModelId(entry.id)] : [])));
      } catch {
        return result("ok", "The key works. The model list could not be read, so send a turn to confirm the pinned models.");
      }
      const missing = pinned.filter((id) => !listed.has(apiConnectionRoutingModelId(id)));
      return missing.length > 0 ? result("models-missing", missingMessage(missing), missing) : result("ok", LISTED);
    }
    const claudeEndpoint = connection.endpoints["claude-code"];
    if (claudeEndpoint) {
      const checked = await checkClaudeGateway({ gateway: { baseUrl: claudeEndpoint, secretId: connection.secretId, models: pinned }, token: args.token, request });
      if (checked.httpStatus) return httpFailure(checked.httpStatus);
      if (checked.requestFailure) return result(checked.requestFailure, REQUEST_FAILURE_MESSAGE[checked.requestFailure]);
      if (checked.ok) return result("ok", LISTED);
      if (checked.models.length > 0 || checked.message.startsWith("The gateway does not list")) {
        const missing = pinned.filter((id) => !checked.models.includes(id));
        return result("models-missing", missingMessage(missing), missing);
      }
      return result("unexpected", checked.message);
    }
    const models = await request(`${connection.endpoints.codex}/models`, authorized);
    await models.body?.cancel();
    if (!models.ok) return httpFailure(models.status);
    return result("ok", "The gateway accepted the key. Its model list is in a format Stave doesn't read, so send a turn to confirm the pinned models.");
  } catch (error) {
    return requestFailure(error);
  }
}

type ResolveSecret = (secretId: string) => Promise<{ value: string } | null | undefined>;

function findApiConnection(id: string): ApiConnection | undefined {
  try { return getProviderAccountRegistry().listApiConnections().find((candidate) => candidate.id === id); }
  catch { return undefined; }
}

/** The usable key value, or null when it is missing, locked, or not a single header line. */
async function resolveApiConnectionToken(secretId: string, resolveSecret: ResolveSecret): Promise<string | null> {
  let token: string | undefined;
  try { token = (await resolveSecret(secretId))?.value.trim(); } catch { token = undefined; }
  return !token || /[\r\n\0]/.test(token) ? null : token;
}

/** Resolves the key in main for one check; the value never leaves this function. */
export async function checkStoredApiConnection(id: string, resolveSecret: ResolveSecret, request?: Fetch): Promise<ApiConnectionCheckResult> {
  const connection = findApiConnection(id);
  if (!connection) return result("unexpected", "The API connection no longer exists.");
  const token = await resolveApiConnectionToken(connection.secretId, resolveSecret);
  if (!token) return result("missing-key", "The connection's key is missing or locked. Check it in Settings > Secrets.");
  return checkApiConnection({ connection, token, request });
}

/** A USD amount as the gateway answers it: a plain decimal string, or a number that prints as one. */
const UsdDecimalSchema = z.string().trim().max(32).regex(/^-?\d+(?:\.\d+)?$/);
const UsdAmountSchema = z.union([UsdDecimalSchema, z.number().transform(String).pipe(UsdDecimalSchema)]);
const CreditsResponseSchema = z.object({ balance: UsdAmountSchema, total_used: UsdAmountSchema });

/**
 * Reads a Vercel AI Gateway balance with the key. Only the two amounts or a
 * reason leave this function: never the key, a header, or the raw body.
 */
export async function fetchApiConnectionCredits(token: string, request: Fetch = fetch): Promise<ApiConnectionCreditsResult> {
  let response: Response;
  try { response = await request(VERCEL_AI_GATEWAY.creditsUrl, authorizedRequest(token)); }
  catch (error) { return { ok: false, reason: requestFailureStatus(error) }; }
  try {
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: classifyApiConnectionHttpStatus(response.status) };
    }
    const parsed = CreditsResponseSchema.safeParse(await readBoundedJson(response, CREDITS_MAX_BYTES));
    return parsed.success
      ? { ok: true, balanceUsd: parsed.data.balance, totalUsedUsd: parsed.data.total_used }
      : { ok: false, reason: "unexpected" };
  } catch (error) {
    // A body cut off by the timeout is a timeout; one that is not JSON is unexpected.
    return { ok: false, reason: classifyApiConnectionRequestError(error) ?? "unexpected" };
  }
}

type CreditsSuccess = Extract<ApiConnectionCreditsResult, { ok: true }>;
// Keyed by the key's value, not its Secrets reference: replacing the value in
// Secrets keeps the reference, and must not keep the old key's balance.
const creditsCache = new Map<string, { keyHash: string; result: CreditsSuccess; fetchedAt: number }>();
const creditsInFlight = new Map<string, { keyHash: string; read: Promise<ApiConnectionCreditsResult> }>();
const hashKey = (token: string) => createHash("sha256").update(token).digest("hex");

export function resetApiConnectionCreditsCache() {
  creditsCache.clear();
  creditsInFlight.clear();
}

/**
 * A Vercel connection's balance for the status bar meters. Kept in main so
 * every meter and window shares one budget: concurrent reads of a connection
 * share one request, and a success is reused for a minute, so the gateway is
 * asked at most once a minute per connection and key. Failures are not kept,
 * so the next read tries again.
 */
export async function readStoredApiConnectionCredits(
  id: string,
  resolveSecret: ResolveSecret,
  request?: Fetch,
  now = Date.now(),
): Promise<ApiConnectionCreditsResult> {
  const connection = findApiConnection(id);
  if (!connection) return { ok: false, reason: "unexpected" };
  if (connection.kind !== "vercel-ai-gateway") return { ok: false, reason: "unsupported" };
  // The key is read on every request (a local lookup), so a removed or
  // replaced key is never answered from the cache.
  const token = await resolveApiConnectionToken(connection.secretId, resolveSecret);
  if (!token) {
    creditsCache.delete(id);
    return { ok: false, reason: "missing-key" };
  }
  const keyHash = hashKey(token);
  const cached = creditsCache.get(id);
  if (cached && cached.keyHash === keyHash && now - cached.fetchedAt < CREDITS_TTL_MS) return cached.result;
  const pending = creditsInFlight.get(id);
  if (pending && pending.keyHash === keyHash) return pending.read;
  const read = fetchApiConnectionCredits(token, request).then((answer) => {
    if (answer.ok) creditsCache.set(id, { keyHash, result: answer, fetchedAt: now });
    return answer;
  }).finally(() => {
    if (creditsInFlight.get(id)?.read === read) creditsInFlight.delete(id);
  });
  creditsInFlight.set(id, { keyHash, read });
  return read;
}
