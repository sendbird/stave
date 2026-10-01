import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import { withGatewayCredential, validateClaudeGatewayModel } from "../electron/provider-accounts/gateway-runtime";
import { resolveHostGatewayCredential } from "../electron/main/provider-gateway-credential";
import { checkClaudeGateway } from "../electron/main/claude-gateway-check";
import { buildClaudeQueryOptions, buildClaudeReadOnlyPromptOptions } from "../electron/providers/claude-sdk-runtime";
import { buildClaudeCliEnv } from "../electron/providers/cli-path-env";
import { getProviderModelCatalog } from "../electron/providers/provider-model-catalog";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { createProviderAccountLoginSession } from "../electron/host-service/provider-account-login";
import { ClaudeGatewaySchema } from "../src/lib/providers/claude-gateway";
import { RuntimeOptionsObjectSchema } from "../electron/main/ipc/provider-runtime-schemas";

const secretId = "11111111-1111-4111-8111-111111111111";
const gateway = { baseUrl: "https://gateway.example.test/claude", secretId, models: ["anthropic/claude-sonnet-5"] };
let root: string;
let registry: ProviderAccountRegistry;
const originalRoot = process.env.STAVE_USER_DATA_PATH;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "stave-gateway-"));
  process.env.STAVE_USER_DATA_PATH = root;
  registry = new ProviderAccountRegistry(root);
});
afterEach(() => {
  if (originalRoot === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = originalRoot;
  rmSync(root, { recursive: true, force: true });
});
const create = (label = "Gateway") => registry.create({ providerId: "claude-code", label, gateway });
const inGateway = <T>(profileId: string, token: string | undefined, run: () => T) =>
  withGatewayCredential({ profileId, token }, () => withProviderAccountScope({ claudeAccountProfileId: profileId }, run));

describe("Claude Gateway connections", () => {
  test("stores immutable metadata only and rejects credentials in the URL or wrong provider", () => {
    for (const baseUrl of ["", "https:", "not-a-url", "http://gateway.example.test", "https://secret@gateway.example.test", "https://gateway.example.test?token=value", "https://gateway.example.test/#token"])
      expect(ClaudeGatewaySchema.safeParse({ ...gateway, baseUrl }).success).toBe(false);
    expect(() => registry.create({ providerId: "codex", label: "Invalid", gateway })).toThrow();
    expect(() => registry.create({ providerId: "claude-code", label: "Invalid", gateway, configDirectory: root })).toThrow();
    const profile = create();
    expect(registry.resolveGateway(profile.id)).toEqual(gateway);
    expect(JSON.parse(readFileSync(registry.filePath, "utf8")).profiles[0].gateway).toEqual(gateway);
    expect(RuntimeOptionsObjectSchema.safeParse({ gatewayCredential: { token: "fixture-secret" } }).success).toBe(false);
    registry.remove({ providerId: "claude-code", id: profile.id });
    expect(() => registry.resolveGateway(profile.id)).toThrow("no longer exists");
  });

  test("main resolves only the selected secret and missing or locked secrets fail closed", async () => {
    const profile = create();
    let calls = 0;
    const resolve = async (id: string) => { calls++; expect(id).toBe(secretId); return { id, value: "fixture-gateway-key" }; };
    expect(await resolveHostGatewayCredential({ providerId: "claude-code", runtimeOptions: { claudeAccountProfileId: profile.id } }, resolve)).toEqual({ profileId: profile.id, token: "fixture-gateway-key" });
    expect(await resolveHostGatewayCredential({ providerId: "codex", runtimeOptions: { claudeAccountProfileId: profile.id } }, resolve)).toBeUndefined();
    expect(calls).toBe(1);
    expect(await resolveHostGatewayCredential({ input: { providerId: "claude-code", runtimeHints: { claudeAccountProfileId: profile.id } } }, async () => null)).toEqual({ profileId: profile.id });
    expect(await resolveHostGatewayCredential({ claudeAccountProfileId: profile.id }, async () => { throw new Error("fixture-sensitive-error"); })).toEqual({ profileId: profile.id });
    inGateway(profile.id, undefined, () => expect(() => validateClaudeGatewayModel(gateway.models[0])).toThrow("API key is unavailable"));
    const native = registry.create({ providerId: "claude-code", label: "Native" });
    expect(await resolveHostGatewayCredential({ claudeAccountProfileId: native.id }, resolve)).toBeUndefined();
    expect(calls).toBe(1);
  });

  test("concurrent SDK requests isolate credentials, preserve tools and streaming, and restrict model fallback", async () => {
    const profiles = [create("A"), create("B")];
    const parentToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const options = await Promise.all(profiles.map((profile, i) => inGateway(profile.id, `fixture-key-${i}`, async () => {
      await Promise.resolve();
      const canUseTool = async () => ({ behavior: "deny" as const, message: "fixture" });
      const result = buildClaudeQueryOptions({ cwd: root, claudeExecutablePath: process.execPath,
        runtimeOptions: { model: gateway.models[0], claudeAccountProfileId: profile.id, claudeThinkingMode: "adaptive" },
        canUseTool, includePartialMessages: true,
        secretEnv: { ANTHROPIC_API_KEY: "fixture-wrong-key", CLAUDE_CODE_OAUTH_TOKEN: "fixture-wrong-oauth" },
      });
      expect(result.canUseTool).toBe(canUseTool);
      expect(result.includePartialMessages).toBe(true);
      expect(result.settingSources).toEqual([]);
      expect(validateClaudeGatewayModel("claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
      expect(result.env?.ANTHROPIC_API_KEY).toBe("");
      expect(result.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(result.env?.ANTHROPIC_BASE_URL).toBe(gateway.baseUrl);
      expect(result.env?.CLAUDE_CONFIG_DIR).toBe(profile.configDirectory);
      expect(() => buildClaudeQueryOptions({ cwd: root, claudeExecutablePath: process.execPath, runtimeOptions: { model: "claude-unconfigured" } })).toThrow("Choose a model");
      expect(() => buildClaudeQueryOptions({ cwd: root, claudeExecutablePath: process.execPath, runtimeOptions: { model: gateway.models[0], claudeFallbackModel: "claude-unconfigured" } })).toThrow("Choose a model");
      const abortController = new AbortController();
      const aux = buildClaudeReadOnlyPromptOptions({ cwd: root, claudeExecutablePath: process.execPath, model: gateway.models[0]!, abortController });
      abortController.abort();
      expect(aux.abortController?.signal.aborted).toBe(true);
      expect(aux.env?.ANTHROPIC_AUTH_TOKEN).toBe(`fixture-key-${i}`);
      return result;
    })));
    expect(options.map(option => option.env?.ANTHROPIC_AUTH_TOKEN)).toEqual(["fixture-key-0", "fixture-key-1"]);
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe(parentToken);
    inGateway(profiles[0]!.id, "fixture", () => expect(() => validateClaudeGatewayModel(gateway.models[0], profiles[1]!.id)).toThrow("API key is unavailable"));
  });

  test("does not query subscription usage or allow native login for Gateway profiles", async () => {
    const profile = create();
    await inGateway(profile.id, "fixture", async () => {
      const catalog = await getProviderModelCatalog({ providerId: "claude-code" });
      expect(catalog.models.map(entry => entry.model)).toEqual(gateway.models);
      let called = false;
      const snapshot = await getRateLimitsSnapshot({ providers: ["claude-code"], force: true,
        fetchers: { claude: async () => { called = true; throw new Error("must not query subscription"); } },
      });
      expect(called).toBe(false);
      expect(snapshot.claude.source).toBe("unavailable");
      expect(snapshot.claude.error).toContain("API billing");
    });
    const result = createProviderAccountLoginSession({ providerId: "claude-code", profileId: profile.id, workspaceId: "fixture", workspacePath: root }, {
      getSessionBySlotKey: () => { throw new Error("must not attach"); },
      createPtySession: () => { throw new Error("must not spawn"); },
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("saved API key");
    const env = inGateway(profile.id, "fixture", () => buildClaudeCliEnv({ executablePath: process.execPath, accountProfileId: profile.id, mcpConfigPaths: [], resolver: () => null }));
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("fixture");
  });

  test("metadata check sends a bounded authenticated GET and never exposes backend bodies", async () => {
    const request = (async (url: unknown, init: RequestInit) => {
      expect(url).toBe(`${gateway.baseUrl}/v1/models`);
      expect(init.redirect).toBe("error");
      expect(init.body).toBeUndefined();
      expect(init.headers).toEqual({ Authorization: "Bearer fixture", "anthropic-version": "2023-06-01" });
      return new Response(JSON.stringify({ data: gateway.models.map(id => ({ id })) }));
    }) as typeof fetch;
    expect(await checkClaudeGateway({ gateway, token: "fixture", request })).toMatchObject({ ok: true, models: gateway.models });
    for (const response of [new Response("fixture-sensitive-error", { status: 401 }), new Response("invalid-json"), new Response("x".repeat(1_000_001))]) {
      const result = await checkClaudeGateway({ gateway, token: "fixture", request: (async () => response) as typeof fetch });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("fixture-sensitive-error");
    }
  });
});
