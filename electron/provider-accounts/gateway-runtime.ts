import { AsyncLocalStorage } from "node:async_hooks";
import { getProviderAccountRegistry } from "./registry";
import { currentProviderAccountId } from "./runtime-scope";
import { normalizeClaudeModelId } from "../../src/lib/providers/claude-model-requirements";

/** Private main-to-host envelope. Never part of renderer runtime options or events. */
export interface GatewayCredential {
  profileId: string;
  token?: string;
}
const credentials = new AsyncLocalStorage<GatewayCredential | undefined>();
export function withGatewayCredential<T>(credential: GatewayCredential | undefined, run: () => T): T {
  return credentials.run(credential, run);
}
export function currentClaudeGateway(profileId = currentProviderAccountId("claude-code")) {
  return getProviderAccountRegistryIfSelected(profileId)?.resolveGateway(profileId);
}
function getProviderAccountRegistryIfSelected(profileId: string) {
  return profileId === "system-default" ? undefined : getProviderAccountRegistry();
}
export function gatewayCredentialAvailable(profileId = currentProviderAccountId("claude-code")) {
  const credential = credentials.getStore();
  return credential?.profileId === profileId && Boolean(credential.token);
}

export function applyClaudeGatewayEnvironment(env: Record<string, string | undefined>, profileId?: string) {
  const gateway = currentClaudeGateway(profileId);
  if (!gateway) return env;
  const credential = credentials.getStore();
  // Explicit empty API key is required by the CLI's auth-token precedence.
  env.ANTHROPIC_API_KEY = "";
  env.ANTHROPIC_AUTH_TOKEN = gatewayCredentialAvailable(profileId) ? credential!.token : "";
  env.ANTHROPIC_BASE_URL = gateway.baseUrl;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  // Keep implicit subagents and small utility requests on an explicitly configured model.
  env.ANTHROPIC_MODEL = gateway.models[0];
  env.ANTHROPIC_SMALL_FAST_MODEL = gateway.models[0];
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = gateway.models[0];
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = gateway.models[0];
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = gateway.models[0];
  env.CLAUDE_CODE_SUBAGENT_MODEL = gateway.models[0];
  return env;
}

/** Called before inference or interactive CLI spawn, including auxiliary queries. */
export function validateClaudeGatewayModel(model?: string, profileId?: string) {
  const gateway = currentClaudeGateway(profileId);
  if (!gateway) return model;
  if (!gatewayCredentialAvailable(profileId))
    throw new Error("Gateway API key is unavailable. Check the saved secret in Settings > Secrets.");
  const configured = !model ? gateway.models[0] : gateway.models.find(candidate => candidate === model) ??
    gateway.models.find(candidate => normalizeClaudeModelId(candidate) === normalizeClaudeModelId(model));
  if (!configured)
    throw new Error("Choose a model configured for this Gateway connection before sending.");
  return configured;
}
