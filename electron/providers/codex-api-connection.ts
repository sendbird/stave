import { createHash } from "node:crypto";
import {
  API_CONNECTION_KEY_UNAVAILABLE,
  apiConnectionToken,
  currentApiConnection,
  resolveApiConnectionModel,
} from "../provider-accounts/gateway-runtime";
import { currentProviderAccountId } from "../provider-accounts/runtime-scope";
import type { CodexConfigOverrides } from "./codex-app-server-params";

/**
 * Codex adapter for an API connection. Codex reads provider routing from
 * config, not from `OPENAI_BASE_URL`, so a connection turn names a
 * `model_providers` entry in its thread config and the key reaches the App
 * Server through the provider's `env_key` at spawn. Verified against
 * codex-cli 0.159.3: a `thread/start` or `thread/resume` config override routes
 * `POST <base_url>/responses` with `Authorization: Bearer <env_key value>`.
 */
export const CODEX_API_CONNECTION_PROVIDER_ID = "stave-api-connection";
/** Stave-owned, so a key the user exports in their shell is never picked up instead. */
export const CODEX_API_CONNECTION_KEY_ENV = "STAVE_API_CONNECTION_KEY";

type CodexConnection = NonNullable<ReturnType<typeof currentApiConnection>>;

export function currentCodexApiConnection(profileId = currentProviderAccountId("codex")) {
  return currentApiConnection("codex", profileId);
}

function providerTable(connection: CodexConnection) {
  return {
    name: "Stave API connection",
    base_url: connection.baseUrl,
    env_key: CODEX_API_CONNECTION_KEY_ENV,
    // The only wire protocol current Codex speaks. No `supports_websockets`:
    // Vercel serves WebSocket streaming for OpenAI models only.
    wire_api: "responses",
  };
}

/**
 * Thread config for a connection turn. The key name is masked to an empty
 * value in tool shells, on top of Codex's default `*KEY*` exclusion, so a user
 * config that inherits every variable still cannot hand the key to a command.
 */
export function buildCodexApiConnectionConfigOverrides(connection: CodexConnection): CodexConfigOverrides {
  return {
    model_provider: CODEX_API_CONNECTION_PROVIDER_ID,
    [`model_providers.${CODEX_API_CONNECTION_PROVIDER_ID}`]: providerTable(connection),
    [`shell_environment_policy.set.${CODEX_API_CONNECTION_KEY_ENV}`]: "",
  };
}

/**
 * The thread `config` and `model` for the selected Codex account. Unchanged for
 * a sign-in account. For a connection, the model must be one it pins (empty
 * picks its default); anything else fails before a request leaves Stave.
 */
export function applyCodexApiConnectionThread<T extends { model?: string; config?: CodexConfigOverrides }>(params: T): T {
  const connection = currentCodexApiConnection();
  if (!connection) return params;
  const model = resolveApiConnectionModel({ runtime: "codex", models: connection.models, model: params.model });
  if (!model) throw new Error("Choose a model pinned on this API connection before sending.");
  return { ...params, model, config: { ...params.config, ...buildCodexApiConnectionConfigOverrides(connection) } };
}

/** A connection authenticates with its key, not a Codex sign-in; check the key instead of `account/read`. */
export async function readCodexTurnAccount(request: (method: string, params: unknown) => Promise<unknown>) {
  if (!currentCodexApiConnection())
    return await request("account/read", { refreshToken: true }) as { account: unknown | null; requiresOpenaiAuth: boolean };
  if (!apiConnectionToken("codex")) throw new Error(API_CONNECTION_KEY_UNAVAILABLE);
  return { account: null, requiresOpenaiAuth: false };
}

/** Adds the key to a Codex child environment (App Server or CLI tab) when a connection is selected. */
export function applyCodexApiConnectionEnvironment(env: Record<string, string | undefined>, profileId?: string) {
  if (!currentCodexApiConnection(profileId)) return env;
  env[CODEX_API_CONNECTION_KEY_ENV] = apiConnectionToken("codex", profileId) ?? "";
  return env;
}

const spawnedKeys = new WeakMap<object, string>();
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

/** Records which key an App Server process was spawned with (as a hash, never the value). */
export function noteCodexApiConnectionSpawn<T extends Record<string, string | undefined>>(client: object, env: T): T {
  const key = env[CODEX_API_CONNECTION_KEY_ENV];
  // An empty key (spawned before the secret was readable) is tracked too, so it is replaced.
  if (key !== undefined) spawnedKeys.set(client, fingerprint(key));
  else spawnedKeys.delete(client);
  return env;
}

/**
 * A shared App Server keeps the key it was spawned with. After the key is
 * replaced in Secrets, retire the idle process so the next request spawns one
 * with the new key; a process with a turn running keeps going until it idles.
 */
export function retireStaleCodexApiConnectionClient(client: { dispose: (message?: string) => void }, activeTurns: number) {
  const spawned = spawnedKeys.get(client);
  const token = apiConnectionToken("codex");
  if (spawned === undefined || !token || spawned === fingerprint(token) || activeTurns > 0) return false;
  spawnedKeys.delete(client);
  client.dispose("Restarting Codex App Server: the API connection's key changed.");
  return true;
}

/** `-c` overrides and `--model` for an interactive Codex CLI tab on a connection. */
export function buildCodexApiConnectionCliArgs(model?: string, profileId?: string): string[] {
  const connection = currentCodexApiConnection(profileId);
  if (!connection) return [];
  if (!apiConnectionToken("codex", profileId)) throw new Error(API_CONNECTION_KEY_UNAVAILABLE);
  const resolved = resolveApiConnectionModel({ runtime: "codex", models: connection.models, model });
  if (!resolved) throw new Error("Choose a model pinned on this API connection before starting the CLI.");
  // TOML basic strings accept JSON string escapes.
  const table = Object.entries(providerTable(connection)).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(", ");
  return [
    "-c", `model_provider=${JSON.stringify(CODEX_API_CONNECTION_PROVIDER_ID)}`,
    "-c", `model_providers.${CODEX_API_CONNECTION_PROVIDER_ID}={ ${table} }`,
    "-c", `shell_environment_policy.set.${CODEX_API_CONNECTION_KEY_ENV}=""`,
    "--model", resolved,
  ];
}
