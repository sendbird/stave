import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import {
  applyClaudeGatewayEnvironment,
  resolveApiConnectionModel,
  validateClaudeGatewayModel,
  withGatewayCredential,
} from "../electron/provider-accounts/gateway-runtime";
import { resolveHostGatewayCredential } from "../electron/main/provider-gateway-credential";
import {
  checkApiConnection,
  checkStoredApiConnection,
  discoverApiConnectionModels,
  resetVercelCatalogCache,
} from "../electron/main/api-connection-check";
import {
  CODEX_API_CONNECTION_KEY_ENV,
  CODEX_API_CONNECTION_PROVIDER_ID,
  buildCodexApiConnectionCliArgs,
  noteCodexApiConnectionSpawn,
  readCodexTurnAccount,
  retireStaleCodexApiConnectionClient,
} from "../electron/providers/codex-api-connection";
import { buildCodexThreadResumeParams, buildCodexThreadStartParams } from "../electron/providers/codex-app-server-params";
import { buildCodexCliEnv } from "../electron/providers/cli-path-env";
import { getProviderModelCatalog } from "../electron/providers/provider-model-catalog";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { buildCliSessionLaunch } from "../electron/host-service/cli-session-launch";
import {
  ApiConnectionCreateArgsSchema,
  ApiConnectionModelIdSchema,
  VERCEL_AI_GATEWAY,
  apiConnectionDefaultModel,
  classifyApiConnectionHttpStatus,
  describeApiConnectionHttpStatus,
  formatApiConnectionPrice,
  isExperimentalApiConnectionModel,
  type ApiConnection,
} from "../src/lib/providers/api-connections";
import { filterApiConnectionCatalog } from "../src/lib/providers/api-connection-catalog";
import { buildApiConnectionCatalogEntries } from "../src/lib/providers/api-connection-models";
import { ClaudeGatewaySchema } from "../src/lib/providers/claude-gateway";
import { configuredGatewayCatalog } from "../src/lib/providers/use-provider-model-catalogs";
import { useProviderAccounts } from "../src/lib/providers/use-provider-accounts";

const secretId = "11111111-1111-4111-8111-111111111111";
const otherSecretId = "22222222-2222-4222-8222-222222222222";
let root: string;
let registry: ProviderAccountRegistry;
const originalRoot = process.env.STAVE_USER_DATA_PATH;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-api-connection-")));
  process.env.STAVE_USER_DATA_PATH = root;
  registry = new ProviderAccountRegistry(root);
  resetVercelCatalogCache();
});
afterEach(() => {
  if (originalRoot === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = originalRoot;
  rmSync(root, { recursive: true, force: true });
});

const pinned = [
  { id: "zai/glm-5.3", name: "GLM 5.3", contextWindow: 1_000_000, inputPrice: "0.0000014", outputPrice: "0.0000044" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 1_000_000, inputPrice: "0.000002", outputPrice: "0.00001" },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" },
];
const createVercel = (label = "Company gateway") =>
  registry.createApiConnection({ label, kind: "vercel-ai-gateway", secretId, models: pinned });
/** Runs in a request whose main-resolved credentials name this connection for both runtimes. */
const inConnection = <T>(id: string, token: string | undefined, run: () => T) =>
  withGatewayCredential({ "claude-code": { profileId: id, token }, codex: { profileId: id, token } },
    () => withProviderAccountScope({ claudeAccountProfileId: id, codexAccountProfileId: id }, run));

// Entries shaped like GET https://ai-gateway.vercel.sh/v1/models (public, fetched 2026-10-02), trimmed.
const catalogFixture = {
  object: "list",
  data: [
    { id: "zai/glm-5.3", name: "GLM 5.3", type: "language", tags: ["implicit-caching", "reasoning", "tool-use", "structured-output"], context_window: 1000000, pricing: { input: "0.0000014", output: "0.0000044", varies_by_provider: true } },
    { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", type: "language", tags: ["reasoning", "tool-use", "vision"], context_window: 1000000, pricing: { input: "0.000002", output: "0.00001" } },
    { id: "moonshotai/kimi-k3", name: "Kimi K3", type: "language", tags: ["reasoning", "tool-use"], context_window: 1000000, pricing: { input: "0.000003", output: "0.000015" } },
    { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", type: "language", tags: ["reasoning", "tool-use"], context_window: 131072, pricing: { input: "0.0000001", output: "0.0000005" } },
    { id: "google/gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", type: "language", tags: ["image-generation", "vision"], context_window: 131072, pricing: { input: "0.0000005", output: "0.000003" } },
    { id: "tencent/hy-mt2-lite", name: "Tencent Hy-MT2-Lite", type: "language", context_window: 8000, pricing: { input: "0.000000044", output: "0.000000177" } },
    { id: "alibaba/qwen3-embedding-0.6b", name: "Qwen3 Embedding 0.6B", type: "embedding", context_window: 32768, pricing: { input: "0.00000001" } },
    { id: "retired/old-model", name: "Old", type: "language", tags: ["tool-use"], deprecated_at: 1_000 },
    { id: "bad id with spaces", type: "language", tags: ["tool-use"] },
    "not an object",
  ],
};

describe("API connection schema", () => {
  test("model IDs accept creator/model and every Claude ID older builds stored, nothing shell-like", () => {
    for (const id of ["moonshotai/kimi-k3", "zai/glm-5.3", "openai/gpt-oss-120b", "anthropic/claude-sonnet-5", "claude-sonnet-5", "claude-code/anthropic/claude-sonnet-5[1m]", "claude-code/moonshotai/kimi-k3[1m]"])
      expect(ApiConnectionModelIdSchema.safeParse(id).success).toBe(true);
    for (const id of ["", "has space", "a/b/c", "x;rm -rf", "$(id)", "`id`", "x\ny"])
      expect(ApiConnectionModelIdSchema.safeParse(id).success).toBe(false);
    // The Claude runtime's gateway shape no longer rejects non-Claude models.
    expect(ClaudeGatewaySchema.safeParse({ baseUrl: "https://ai-gateway.vercel.sh/claude-code", secretId, models: ["moonshotai/kimi-k3"] }).success).toBe(true);
  });

  test("a custom connection needs an HTTPS endpoint; the Vercel preset derives both", () => {
    const base = { label: "Gateway", secretId, models: [{ id: "zai/glm-5.3" }] };
    expect(ApiConnectionCreateArgsSchema.safeParse({ ...base, kind: "custom" }).success).toBe(false);
    expect(ApiConnectionCreateArgsSchema.safeParse({ ...base, kind: "custom", endpoints: {} }).success).toBe(false);
    expect(ApiConnectionCreateArgsSchema.safeParse({ ...base, kind: "custom", endpoints: { codex: "http://gateway.example.test/v1" } }).success).toBe(false);
    expect(ApiConnectionCreateArgsSchema.safeParse({ ...base, kind: "custom", endpoints: { codex: "https://gateway.example.test/v1/" } }).success).toBe(true);
    expect(ApiConnectionCreateArgsSchema.safeParse({ ...base, kind: "vercel-ai-gateway", models: [{ id: "zai/glm-5.3" }, { id: "zai/glm-5.3" }] }).success).toBe(false);
    const connection = createVercel();
    expect(connection.endpoints).toEqual(VERCEL_AI_GATEWAY.endpoints);
    const custom = registry.createApiConnection({ ...base, kind: "custom", endpoints: { codex: "https://gateway.example.test/v1/" } });
    expect(custom.endpoints).toEqual({ codex: "https://gateway.example.test/v1" });
  });

  test("defaults: the first natively read model per runtime, else the first pinned", () => {
    expect(apiConnectionDefaultModel("claude-code", pinned)).toBe("anthropic/claude-sonnet-5");
    expect(apiConnectionDefaultModel("codex", pinned)).toBe("openai/gpt-oss-120b");
    expect(apiConnectionDefaultModel("codex", [{ id: "zai/glm-5.3" }])).toBe("zai/glm-5.3");
    expect(isExperimentalApiConnectionModel("claude-code", "zai/glm-5.3")).toBe(true);
    expect(isExperimentalApiConnectionModel("claude-code", "claude-code/anthropic/claude-sonnet-5[1m]")).toBe(false);
    expect(isExperimentalApiConnectionModel("codex", "zai/glm-5.3")).toBe(false);
  });
});

describe("selection: one connection is an account under each runtime", () => {
  test("each runtime gets its own entry, endpoint and managed folder", () => {
    const connection = createVercel();
    const entries = registry.list().filter((profile) => profile.id === connection.id);
    expect(entries.map((entry) => entry.providerId)).toEqual(["claude-code", "codex"]);
    expect(entries[1]).toMatchObject({ label: "Company gateway", gateway: { baseUrl: VERCEL_AI_GATEWAY.endpoints.codex, secretId, models: pinned.map((model) => model.id) }, apiConnection: { kind: "vercel-ai-gateway" } });
    const claudeDir = registry.resolveDirectory({ providerId: "claude-code", profileId: connection.id });
    const codexDir = registry.resolveDirectory({ providerId: "codex", profileId: connection.id });
    expect(claudeDir).toBe(path.join(root, "provider-accounts", "connections", connection.id, "claude-code"));
    expect(codexDir).toBe(path.join(root, "provider-accounts", "connections", connection.id, "codex"));
    const native = registry.create({ providerId: "codex", label: "Work" });
    expect(registry.resolveGateway(native.id, "codex")).toBeUndefined();
    const claudeOnly = registry.createApiConnection({ label: "Claude only", kind: "custom", secretId, endpoints: { "claude-code": "https://proxy.example.test" }, models: [{ id: "claude-sonnet-5" }] });
    expect(() => registry.resolveGateway(claudeOnly.id, "codex")).toThrow("no longer exists");
  });

  test("name, key reference and models can change; the endpoints cannot", () => {
    const connection = createVercel();
    const updated = registry.updateApiConnection({ id: connection.id, label: "Renamed", secretId: otherSecretId, models: [{ id: "moonshotai/kimi-k3" }] });
    expect(updated).toMatchObject({ label: "Renamed", secretId: otherSecretId, endpoints: VERCEL_AI_GATEWAY.endpoints, models: [{ id: "moonshotai/kimi-k3" }] });
    expect(() => registry.updateApiConnection({ id: connection.id, endpoints: { codex: "https://elsewhere.example.test" } } as never)).toThrow("Invalid");
    registry.removeApiConnection(connection.id);
    expect(registry.list().some((profile) => profile.id === connection.id)).toBe(false);
    expect(() => registry.removeApiConnection(connection.id)).toThrow("no longer exists");
  });

  test("the picker groups a connection's models under the runtime and tags experimental ones", () => {
    const connection = createVercel();
    const profile = registry.list().find((entry) => entry.id === connection.id && entry.providerId === "claude-code")!;
    const claude = buildApiConnectionCatalogEntries({ runtime: "claude-code", profile });
    expect(claude.map((entry) => [entry.model, entry.isDefault, entry.badge ?? null, entry.group])).toEqual([
      ["zai/glm-5.3", false, "experimental", "Company gateway · API billing"],
      ["anthropic/claude-sonnet-5", true, null, "Company gateway · API billing"],
      ["openai/gpt-oss-120b", false, "experimental", "Company gateway · API billing"],
    ]);
    expect(claude[0]!.description).toContain("Experimental in Claude Code");
    expect(claude[0]!.description).toContain("$1.40 / $4.40 per 1M tokens");
    expect(claude[1]!.description).toBe("1M context · $2 / $10 per 1M tokens");
    const codex = buildApiConnectionCatalogEntries({ runtime: "codex", profile: { ...profile } });
    expect(codex.some((entry) => entry.badge)).toBe(false);
    expect(codex.find((entry) => entry.isDefault)?.model).toBe("openai/gpt-oss-120b");
  });

  test("selecting the Codex entry makes its pins the whole renderer and main catalog", async () => {
    const connection = createVercel();
    const before = useProviderAccounts.getState().profiles;
    try {
      useProviderAccounts.setState({ profiles: registry.list() });
      const catalog = configuredGatewayCatalog({ providerId: "codex", runtimeOptions: { codexAccountProfileId: connection.id } });
      expect(catalog?.models).toEqual(pinned.map((model) => model.id));
      expect(configuredGatewayCatalog({ providerId: "codex" })).toBeUndefined();
    } finally { useProviderAccounts.setState({ profiles: before }); }
    const main = await inConnection(connection.id, "fixture", () => getProviderModelCatalog({ providerId: "codex", runtimeOptions: { codexAccountProfileId: connection.id } }));
    expect(main.models.map((entry) => entry.model)).toEqual(pinned.map((model) => model.id));
    let called = false;
    const snapshot = await inConnection(connection.id, "fixture", () => getRateLimitsSnapshot({ providers: ["codex"], force: true,
      runtimeOptions: { codexAccountProfileId: connection.id },
      fetchers: { codex: async () => { called = true; throw new Error("must not read subscription usage"); } } }));
    expect(called).toBe(false);
    expect(snapshot.codex.error).toContain("API billing");
  });
});

describe("runtime adapters", () => {
  test("main resolves one key for both runtimes of a shared connection", async () => {
    const connection = createVercel();
    let reveals = 0;
    const resolve = async (id: string) => { reveals++; expect(id).toBe(secretId); return { id, value: "fixture-key" }; };
    const both = await resolveHostGatewayCredential({ runtimeOptions: { claudeAccountProfileId: connection.id, codexAccountProfileId: connection.id } }, resolve);
    expect(both).toEqual({ "claude-code": { profileId: connection.id, token: "fixture-key" }, codex: { profileId: connection.id, token: "fixture-key" } });
    expect(reveals).toBe(1);
    expect(await resolveHostGatewayCredential({ providerId: "codex", runtimeOptions: { codexAccountProfileId: connection.id } }, resolve))
      .toEqual({ codex: { profileId: connection.id, token: "fixture-key" } });
    expect(await resolveHostGatewayCredential({ providerId: "claude-code", runtimeOptions: { codexAccountProfileId: connection.id } }, resolve)).toBeUndefined();
  });

  test("Claude: gateway env, a Claude model for background work, and experimental models allowed", () => {
    const connection = createVercel();
    inConnection(connection.id, "fixture-key", () => {
      const env = applyClaudeGatewayEnvironment({ ANTHROPIC_API_KEY: "inherited" });
      expect(env).toMatchObject({
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_AUTH_TOKEN: "fixture-key",
        ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/claude-code",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "anthropic/claude-sonnet-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "anthropic/claude-sonnet-5",
      });
      expect(validateClaudeGatewayModel("zai/glm-5.3")).toBe("zai/glm-5.3");
      expect(validateClaudeGatewayModel(undefined)).toBe("anthropic/claude-sonnet-5");
      expect(() => validateClaudeGatewayModel("moonshotai/kimi-k3")).toThrow("pinned");
    });
  });

  test("Codex: provider config on thread start and resume, key in the child env, no OPENAI_BASE_URL", () => {
    const connection = createVercel();
    inConnection(connection.id, "fixture-key", () => {
      const start = buildCodexThreadStartParams({ cwd: root, runtimeOptions: { model: "zai/glm-5.3" } });
      expect(start.model).toBe("zai/glm-5.3");
      expect(start.config).toMatchObject({
        model_provider: CODEX_API_CONNECTION_PROVIDER_ID,
        [`model_providers.${CODEX_API_CONNECTION_PROVIDER_ID}`]: {
          base_url: "https://ai-gateway.vercel.sh/codex/v1",
          env_key: CODEX_API_CONNECTION_KEY_ENV,
          wire_api: "responses",
        },
        [`shell_environment_policy.set.${CODEX_API_CONNECTION_KEY_ENV}`]: "",
      });
      expect(JSON.stringify(start)).not.toContain("fixture-key");
      expect(JSON.stringify(start)).not.toContain("supports_websockets");
      const resume = buildCodexThreadResumeParams({ threadId: "thread", cwd: root, runtimeOptions: {} });
      expect(resume.model).toBe("openai/gpt-oss-120b");
      expect(resume.config?.model_provider).toBe(CODEX_API_CONNECTION_PROVIDER_ID);
      expect(() => buildCodexThreadStartParams({ cwd: root, runtimeOptions: { model: "gpt-6-sol" } })).toThrow("pinned");
      const env = buildCodexCliEnv({ executablePath: process.execPath, accountProfileId: connection.id, mcpConfigPaths: [], resolver: () => null });
      expect(env[CODEX_API_CONNECTION_KEY_ENV]).toBe("fixture-key");
      expect(env.CODEX_HOME).toBe(path.join(root, "provider-accounts", "connections", connection.id, "codex"));
      expect(env.OPENAI_BASE_URL).toBeUndefined();
    });
    // A sign-in account is untouched.
    const plain = buildCodexThreadStartParams({ cwd: root, runtimeOptions: { model: "gpt-6-sol" } });
    expect(plain.model).toBe("gpt-6-sol");
    expect(plain.config?.model_provider).toBeUndefined();
  });

  test("a native model ID resolves to the same model pinned with its creator prefix, per runtime", () => {
    const models = ["openai/gpt-5.5", "anthropic/claude-sonnet-5"];
    expect(resolveApiConnectionModel({ runtime: "codex", models, model: "gpt-5.5" })).toBe("openai/gpt-5.5");
    expect(resolveApiConnectionModel({ runtime: "codex", models, model: "openai/gpt-5.5" })).toBe("openai/gpt-5.5");
    expect(resolveApiConnectionModel({ runtime: "claude-code", models, model: "claude-sonnet-5" })).toBe("anthropic/claude-sonnet-5");
    // A different model, or another runtime's prefix, is never substituted.
    expect(resolveApiConnectionModel({ runtime: "codex", models, model: "gpt-5.4" })).toBeUndefined();
    expect(resolveApiConnectionModel({ runtime: "codex", models, model: "claude-sonnet-5" })).toBeUndefined();
    expect(resolveApiConnectionModel({ runtime: "claude-code", models, model: "gpt-5.5" })).toBeUndefined();
    const connection = createVercel();
    inConnection(connection.id, "fixture-key", () => {
      expect(buildCodexThreadStartParams({ cwd: root, runtimeOptions: { model: "gpt-oss-120b" } }).model).toBe("openai/gpt-oss-120b");
      expect(buildCodexApiConnectionCliArgs("gpt-oss-120b").at(-1)).toBe("openai/gpt-oss-120b");
    });
  });

  test("Codex: a connection turn checks its key instead of a Codex sign-in", async () => {
    const connection = createVercel();
    const calls: string[] = [];
    const request = async (method: string) => { calls.push(method); return { account: null, requiresOpenaiAuth: true }; };
    expect(await inConnection(connection.id, "fixture-key", () => readCodexTurnAccount(request))).toEqual({ account: null, requiresOpenaiAuth: false });
    await expect(inConnection(connection.id, undefined, () => readCodexTurnAccount(request))).rejects.toThrow("key is unavailable");
    expect(calls).toEqual([]);
    expect(await readCodexTurnAccount(request)).toEqual({ account: null, requiresOpenaiAuth: true });
    expect(calls).toEqual(["account/read"]);
  });

  test("Codex: a shared App Server spawned with an older key is retired once idle", () => {
    const connection = createVercel();
    let disposed = 0;
    const client = { dispose: () => { disposed++; } };
    inConnection(connection.id, "old-key", () => noteCodexApiConnectionSpawn(client, { [CODEX_API_CONNECTION_KEY_ENV]: "old-key" }));
    inConnection(connection.id, "old-key", () => expect(retireStaleCodexApiConnectionClient(client, 0)).toBe(false));
    inConnection(connection.id, "new-key", () => expect(retireStaleCodexApiConnectionClient(client, 1)).toBe(false));
    expect(disposed).toBe(0);
    inConnection(connection.id, "new-key", () => expect(retireStaleCodexApiConnectionClient(client, 0)).toBe(true));
    expect(disposed).toBe(1);
    const plain = { dispose: () => { disposed++; } };
    noteCodexApiConnectionSpawn(plain, { PATH: "/usr/bin" });
    inConnection(connection.id, "new-key", () => expect(retireStaleCodexApiConnectionClient(plain, 0)).toBe(false));
  });

  test("Codex CLI tab: config overrides and a pinned model, resume keeps its session", () => {
    const connection = createVercel("Gateway \"quoted\"");
    inConnection(connection.id, "fixture-key", () => {
      const args = buildCodexApiConnectionCliArgs("zai/glm-5.3");
      expect(args).toEqual([
        "-c", `model_provider="${CODEX_API_CONNECTION_PROVIDER_ID}"`,
        "-c", `model_providers.${CODEX_API_CONNECTION_PROVIDER_ID}={ name = "Stave API connection", base_url = "https://ai-gateway.vercel.sh/codex/v1", env_key = "${CODEX_API_CONNECTION_KEY_ENV}", wire_api = "responses" }`,
        "-c", `shell_environment_policy.set.${CODEX_API_CONNECTION_KEY_ENV}=""`,
        "--model", "zai/glm-5.3",
      ]);
      expect(args.join(" ")).not.toContain("fixture-key");
      expect(buildCodexApiConnectionCliArgs()).toContain("openai/gpt-oss-120b");
      const resume = buildCliSessionLaunch({ providerId: "codex", cwd: root, requestedNativeSessionId: "session-1",
        runtimeOptions: { codexAccountProfileId: connection.id, codexBinaryPath: process.execPath } });
      expect(resume.ok && resume.commandArgs?.[0]).toBe("resume");
      expect(resume.ok && resume.commandArgs?.at(-1)).toBe("session-1");
      expect(resume.ok && resume.env[CODEX_API_CONNECTION_KEY_ENV]).toBe("fixture-key");
    });
    expect(() => inConnection(connection.id, undefined, () => buildCodexApiConnectionCliArgs())).toThrow("key is unavailable");
  });
});

describe("model discovery", () => {
  test("keeps coding-capable language models, with name, context and price", () => {
    const models = filterApiConnectionCatalog(catalogFixture, 2_000);
    expect(models.map((model) => model.id)).toEqual([
      "anthropic/claude-sonnet-5",
      "moonshotai/kimi-k3",
      "openai/gpt-oss-120b",
      "tencent/hy-mt2-lite",
      "zai/glm-5.3",
    ]);
    expect(models.find((model) => model.id === "moonshotai/kimi-k3")).toMatchObject({ name: "Kimi K3", contextWindow: 1_000_000, inputPrice: "0.000003", outputPrice: "0.000015" });
    expect(formatApiConnectionPrice(models.find((model) => model.id === "openai/gpt-oss-120b")!)).toBe("$0.10 / $0.50 per 1M tokens");
    expect(formatApiConnectionPrice({ inputPrice: "0.000000044", outputPrice: "0.000015" })).toBe("$0.04 / $15 per 1M tokens");
    expect(formatApiConnectionPrice({ inputPrice: "0.000000001", outputPrice: "x" })).toBe("$0.001 / ? per 1M tokens");
    expect(formatApiConnectionPrice({ inputPrice: "0.000002" })).toBe("");
    expect(() => filterApiConnectionCatalog({ nope: true })).toThrow("supported model list");
  });

  test("reads the public catalog without a key, bounded and without redirects", async () => {
    const request = (async (url: unknown, init: RequestInit) => {
      expect(url).toBe(VERCEL_AI_GATEWAY.modelsUrl);
      expect(init.redirect).toBe("error");
      expect(init.headers).toBeUndefined();
      return new Response(JSON.stringify(catalogFixture));
    }) as typeof fetch;
    const result = await discoverApiConnectionModels(request);
    expect(result.ok && result.models.length).toBe(5);
    resetVercelCatalogCache();
    expect(await discoverApiConnectionModels((async () => new Response("x".repeat(8_000_001))) as typeof fetch)).toMatchObject({ ok: false });
  });
});

describe("connection check", () => {
  const vercel: ApiConnection = { id: "77777777-7777-4777-8777-777777777777", label: "Vercel", kind: "vercel-ai-gateway", secretId, endpoints: VERCEL_AI_GATEWAY.endpoints, models: [{ id: "anthropic/claude-sonnet-5" }, { id: "claude-code/zai/glm-5.3[1m]" }] };
  const answering = (credits: Response | (() => Response)) => {
    const seen: Array<{ url: string; auth?: string }> = [];
    const request = (async (url: unknown, init: RequestInit = {}) => {
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
      seen.push({ url: String(url), auth });
      if (url === VERCEL_AI_GATEWAY.creditsUrl) return typeof credits === "function" ? credits() : credits;
      if (url === VERCEL_AI_GATEWAY.modelsUrl) return new Response(JSON.stringify(catalogFixture));
      throw new Error(`unexpected ${String(url)}`);
    }) as typeof fetch;
    return { request, seen };
  };

  test("maps 401, 402 and 429 to what the key holder can do", () => {
    expect(classifyApiConnectionHttpStatus(401)).toBe("invalid-key");
    expect(classifyApiConnectionHttpStatus(403)).toBe("invalid-key");
    expect(classifyApiConnectionHttpStatus(402)).toBe("budget-exhausted");
    expect(classifyApiConnectionHttpStatus(429)).toBe("rate-limited");
    expect(classifyApiConnectionHttpStatus(500)).toBe("unexpected");
    expect(describeApiConnectionHttpStatus(402)).toContain("budget");
    expect(describeApiConnectionHttpStatus(429)).toContain("free-tier");
  });

  test("Vercel: the key goes only to /v1/credits, pins compare in routing form", async () => {
    const { request, seen } = answering(new Response(JSON.stringify({ balance: "95.50", total_used: "4.50" })));
    const result = await checkApiConnection({ connection: vercel, token: "fixture-key", request });
    expect(result).toMatchObject({ ok: true, status: "ok", missingModels: [] });
    expect(seen).toEqual([{ url: VERCEL_AI_GATEWAY.creditsUrl, auth: "Bearer fixture-key" }, { url: VERCEL_AI_GATEWAY.modelsUrl, auth: undefined }]);
    expect(result.message).not.toContain("95.50");
  });

  test("Vercel: refusals and unlisted pins", async () => {
    for (const [status, expected] of [[401, "invalid-key"], [402, "budget-exhausted"], [429, "rate-limited"]] as const) {
      const { request } = answering(new Response(JSON.stringify({ error: { message: "fixture-sensitive-body", type: "quota_for_entity_exceeded" } }), { status }));
      const result = await checkApiConnection({ connection: vercel, token: "fixture-key", request });
      expect(result).toMatchObject({ ok: false, status: expected });
      expect(JSON.stringify(result)).not.toContain("fixture-sensitive-body");
    }
    const { request } = answering(new Response("{}"));
    const missing = await checkApiConnection({ connection: { ...vercel, models: [...vercel.models, { id: "moonshotai/kimi-k9" }] }, token: "fixture-key", request });
    expect(missing).toMatchObject({ ok: false, status: "models-missing", missingModels: ["moonshotai/kimi-k9"] });
    const offline = await checkApiConnection({ connection: vercel, token: "fixture-key", request: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
    expect(offline.status).toBe("unreachable");
  });

  test("custom: the Claude endpoint's model list, or the Codex endpoint's /models", async () => {
    const claude: ApiConnection = { ...vercel, kind: "custom", endpoints: { "claude-code": "https://proxy.example.test/anthropic" }, models: [{ id: "anthropic/claude-sonnet-5" }] };
    const listing = (async (url: unknown) => {
      expect(url).toBe("https://proxy.example.test/anthropic/v1/models");
      return new Response(JSON.stringify({ data: [{ id: "claude-code/anthropic/claude-sonnet-5[1m]" }] }));
    }) as typeof fetch;
    expect(await checkApiConnection({ connection: claude, token: "k", request: listing })).toMatchObject({ ok: true, status: "ok" });
    expect(await checkApiConnection({ connection: claude, token: "k", request: (async () => new Response("", { status: 402 })) as typeof fetch }))
      .toMatchObject({ status: "budget-exhausted" });
    const codexOnly: ApiConnection = { ...claude, endpoints: { codex: "https://proxy.example.test/v1" } };
    const codexRequest = (async (url: unknown) => { expect(url).toBe("https://proxy.example.test/v1/models"); return new Response("{}"); }) as typeof fetch;
    expect(await checkApiConnection({ connection: codexOnly, token: "k", request: codexRequest })).toMatchObject({ ok: true });
  });

  test("a missing or locked key never reaches the network", async () => {
    const connection = createVercel();
    const request = (async () => { throw new Error("must not fetch"); }) as typeof fetch;
    expect(await checkStoredApiConnection(connection.id, async () => null, request)).toMatchObject({ status: "missing-key" });
    expect(await checkStoredApiConnection(connection.id, async () => { throw new Error("locked"); }, request)).toMatchObject({ status: "missing-key" });
    expect(await checkStoredApiConnection("88888888-8888-4888-8888-888888888888", async () => ({ value: "k" }), request)).toMatchObject({ ok: false });
  });
});
