import {
  VERCEL_AI_GATEWAY,
  apiConnectionRoutingModelId,
  classifyApiConnectionHttpStatus,
  describeApiConnectionHttpStatus,
  type ApiConnection,
  type ApiConnectionCatalogResult,
  type ApiConnectionCheckResult,
} from "../../src/lib/providers/api-connections";
import { filterApiConnectionCatalog } from "../../src/lib/providers/api-connection-catalog";
import { getProviderAccountRegistry } from "../provider-accounts/registry";
import { checkClaudeGateway } from "./claude-gateway-check";

const CATALOG_MAX_BYTES = 8_000_000;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

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
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await readBoundedJson(response, CATALOG_MAX_BYTES);
  catalogCache = { payload, fetchedAt: now };
  return payload;
}

export function resetVercelCatalogCache() {
  catalogCache = null;
}

export async function discoverApiConnectionModels(request: Fetch = fetch): Promise<ApiConnectionCatalogResult> {
  try {
    return { ok: true, models: filterApiConnectionCatalog(await fetchVercelCatalog(request)) };
  } catch {
    return { ok: false, models: [], message: "Could not load the Vercel AI Gateway model list. Check your network, then try again; you can also type model IDs." };
  }
}

function result(status: ApiConnectionCheckResult["status"], message: string, missingModels: string[] = []): ApiConnectionCheckResult {
  return { ok: status === "ok", status, message, missingModels };
}

function httpFailure(status: number) {
  return result(classifyApiConnectionHttpStatus(status), describeApiConnectionHttpStatus(status));
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
  const authorized = { headers: { Authorization: `Bearer ${args.token}` }, redirect: "error" as const, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
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
  } catch {
    return result("unreachable", "Could not reach the gateway. Check your network and the endpoint URL, then try again.");
  }
}

/** Resolves the key in main for one check; the value never leaves this function. */
export async function checkStoredApiConnection(
  id: string,
  resolveSecret: (secretId: string) => Promise<{ value: string } | null | undefined>,
  request?: Fetch,
): Promise<ApiConnectionCheckResult> {
  let connection: ApiConnection | undefined;
  try { connection = getProviderAccountRegistry().listApiConnections().find((candidate) => candidate.id === id); }
  catch { connection = undefined; }
  if (!connection) return result("unexpected", "The API connection no longer exists.");
  let token: string | undefined;
  try { token = (await resolveSecret(connection.secretId))?.value.trim(); } catch { token = undefined; }
  if (!token || /[\r\n\0]/.test(token))
    return result("missing-key", "The connection's key is missing or locked. Check it in Settings > Secrets.");
  return checkApiConnection({ connection, token, request });
}
