import { AsyncLocalStorage } from "node:async_hooks";
import { getProviderAccountRegistry } from "./registry";
import { currentProviderAccountId } from "./runtime-scope";
import { normalizeClaudeModelId } from "../../src/lib/providers/claude-model-requirements";
import {
  apiConnectionDefaultModel,
  apiConnectionRoutingModelId,
  type ApiConnectionRuntime,
} from "../../src/lib/providers/api-connections";

/** Private main-to-host envelope. Never part of renderer runtime options or events. */
export interface GatewayCredential {
  profileId: string;
  token?: string;
}
/** One credential per runtime a request may run: a turn, its advisor, or a CLI tab. */
export type GatewayCredentials = Partial<Record<ApiConnectionRuntime, GatewayCredential>>;
const credentials = new AsyncLocalStorage<GatewayCredentials | undefined>();
export function withGatewayCredential<T>(credential: GatewayCredentials | undefined, run: () => T): T {
  return credentials.run(credential, run);
}

/** The selected API connection as `runtime` sees it, or undefined for a sign-in account. */
export function currentApiConnection(runtime: ApiConnectionRuntime, profileId = currentProviderAccountId(runtime)) {
  return profileId === "system-default" ? undefined : getProviderAccountRegistry().resolveGateway(profileId, runtime);
}
/** For reads that only label or skip work (usage, catalogs, status); an unknown account is not a connection. */
export function peekApiConnection(runtime: ApiConnectionRuntime, profileId = currentProviderAccountId(runtime)) {
  try { return currentApiConnection(runtime, profileId); } catch { return undefined; }
}
export function currentClaudeGateway(profileId = currentProviderAccountId("claude-code")) {
  return currentApiConnection("claude-code", profileId);
}

export function apiConnectionToken(runtime: ApiConnectionRuntime, profileId = currentProviderAccountId(runtime)) {
  const credential = credentials.getStore()?.[runtime];
  return credential?.profileId === profileId && credential.token ? credential.token : undefined;
}
export function gatewayCredentialAvailable(profileId = currentProviderAccountId("claude-code"), runtime: ApiConnectionRuntime = "claude-code") {
  return Boolean(apiConnectionToken(runtime, profileId));
}

export const API_CONNECTION_KEY_UNAVAILABLE =
  "The API connection's key is unavailable. Check the saved secret in Settings > Secrets.";

/** A native model ID as the runtime names it, without the gateway's creator prefix. */
function nativeApiConnectionModelId(runtime: ApiConnectionRuntime, id: string) {
  return runtime === "claude-code" ? normalizeClaudeModelId(id) : id.trim().replace(/^openai\//, "");
}

/**
 * The pinned model a request names, matched by routing ID, then by native ID
 * (`claude-sonnet-5` matches `anthropic/claude-sonnet-5`, `gpt-5.5` matches
 * `openai/gpt-5.5`); the runtime default when none is named.
 */
export function resolveApiConnectionModel(args: {
  runtime: ApiConnectionRuntime;
  models: readonly string[];
  model?: string;
}) {
  if (!args.model?.trim()) return apiConnectionDefaultModel(args.runtime, args.models.map((id) => ({ id })));
  const requested = args.model.trim();
  const native = nativeApiConnectionModelId(args.runtime, requested);
  return args.models.find((candidate) => candidate === requested) ??
    args.models.find((candidate) => apiConnectionRoutingModelId(candidate) === apiConnectionRoutingModelId(requested)) ??
    args.models.find((candidate) => nativeApiConnectionModelId(args.runtime, candidate) === native);
}

export function applyClaudeGatewayEnvironment(env: Record<string, string | undefined>, profileId?: string) {
  const gateway = currentClaudeGateway(profileId);
  if (!gateway) return env;
  const defaultModel = resolveApiConnectionModel({ runtime: "claude-code", models: gateway.models });
  // Explicit empty API key is required by the CLI's auth-token precedence.
  env.ANTHROPIC_API_KEY = "";
  env.ANTHROPIC_AUTH_TOKEN = apiConnectionToken("claude-code", profileId ?? currentProviderAccountId("claude-code")) ?? "";
  env.ANTHROPIC_BASE_URL = gateway.baseUrl;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  // Keep implicit subagents and small utility requests on a pinned Claude model when there is one.
  env.ANTHROPIC_MODEL = defaultModel;
  env.ANTHROPIC_SMALL_FAST_MODEL = defaultModel;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = defaultModel;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = defaultModel;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = defaultModel;
  env.CLAUDE_CODE_SUBAGENT_MODEL = defaultModel;
  return env;
}

/** Called before inference or interactive CLI spawn, including auxiliary queries. */
export function validateClaudeGatewayModel(model?: string, profileId?: string) {
  const gateway = currentClaudeGateway(profileId);
  if (!gateway) return model;
  if (!gatewayCredentialAvailable(profileId))
    throw new Error(API_CONNECTION_KEY_UNAVAILABLE);
  const configured = resolveApiConnectionModel({ runtime: "claude-code", models: gateway.models, model });
  if (!configured)
    throw new Error("Choose a model pinned on this API connection before sending.");
  return configured;
}
