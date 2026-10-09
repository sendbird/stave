import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SecretVault } from "../electron/main/browser/secret-vault";
import {
  SecretRequestBroker,
  SecretRequestError,
  uniqueSecretName,
} from "../electron/main/browser/secret-request-broker";
import {
  runSecretRequestTool,
  SECRET_REQUEST_TOOL_CONFIG,
  SECRET_REQUEST_TOOL_NAME,
} from "../electron/main/browser/secret-request-tool";
import { SecretRequestRespondArgsSchema } from "../electron/main/ipc/secret-request-schemas";
import { sanitizeMcpLogValue } from "../electron/main/stave-mcp-log-sanitizer";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import type { StaveMcpCaller } from "../electron/main/stave-mcp-caller";
import {
  nextBoundSecretIds,
  previewSecretBinding,
  type PendingSecretRequest,
} from "../src/lib/secrets/secret-request";
import { MAX_BOUND_SECRETS } from "../src/lib/secrets/secrets";
import {
  CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS,
  DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS,
} from "../src/lib/runs/read-only-delegation";
import { toToolDisplayName } from "../src/lib/tool-display-name";

const VALUE = "sk-live-DO-NOT-LEAK-0123456789";
const CALLER = {
  taskId: "task-1",
  workspaceId: "workspace-1",
  turnId: "turn-1",
  providerId: "claude-code" as const,
};
const TURN_CALLER: StaveMcpCaller = {
  kind: "turn",
  grant: { ...CALLER, autonomy: "ask" },
};

const tempDirs: string[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createHarness(options?: { timeoutMs?: number }) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-secret-request-"));
  tempDirs.push(directory);
  const filePath = path.join(directory, "secrets.v1.json");
  let id = 0;
  const vault = new SecretVault({
    filePath,
    crypto: {
      isEncryptionAvailable: () => true,
      isInsecureBackend: () => false,
      encryptString: (value) => Buffer.from(`sealed:${Buffer.from(value).toString("base64")}`),
      decryptString: (value) =>
        Buffer.from(value.toString().slice("sealed:".length), "base64").toString(),
    },
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  });
  const published: PendingSecretRequest[][] = [];
  let requestId = 0;
  const broker = new SecretRequestBroker({
    listSecrets: () => vault.list(),
    upsertSecret: (input) => vault.upsert(input),
    publish: (requests) => published.push(requests),
    timeoutMs: options?.timeoutMs ?? 60_000,
    now: () => Date.parse("2026-10-09T12:00:00.000Z"),
    createId: () => `11111111-1111-4111-8111-${String(++requestId).padStart(12, "0")}`,
  });
  return { broker, vault, filePath, published };
}

/** Resolves once the broker has published a card, so a test can answer it. */
async function waitForCard(broker: SecretRequestBroker) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [card] = broker.list();
    if (card) return card;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("no card was published");
}

describe("secret request lifecycle", () => {
  test("save stores the value in the vault and returns metadata only", async () => {
    const { broker, vault, filePath, published } = createHarness();
    const pending = broker.request({
      caller: CALLER,
      envVar: " OPENAI_API_KEY ",
      reason: "Run the embedding script.",
      label: "OpenAI API key",
    });
    const card = await waitForCard(broker);
    expect(card).toMatchObject({
      taskId: "task-1",
      workspaceId: "workspace-1",
      envVarName: "OPENAI_API_KEY",
      reason: "Run the embedding script.",
      label: "OpenAI API key",
      existingSecret: null,
      createdAt: "2026-10-09T12:00:00.000Z",
      expiresAt: "2026-10-09T12:01:00.000Z",
    });

    const answer = await broker.respond({ requestId: card.id, action: "save", value: VALUE });
    expect(answer.ok).toBe(true);
    const result = await pending;
    expect(result).toEqual({ status: "saved", envVar: "OPENAI_API_KEY", availableFrom: "next-turn" });

    const [saved] = await vault.list();
    expect(saved).toMatchObject({
      id: answer.secretId,
      name: "OpenAI API key",
      description: "Run the embedding script.",
      envVarName: "OPENAI_API_KEY",
    });
    expect((await vault.resolveEnvForIds([answer.secretId!])).env).toEqual({ OPENAI_API_KEY: VALUE });
    // The value is never in what the model, the renderer or the file in clear sees.
    for (const surface of [result, answer, published, broker.list()]) {
      expect(JSON.stringify(surface)).not.toContain(VALUE);
    }
    expect(readFileSync(filePath, "utf8")).not.toContain(VALUE);
    expect(broker.list()).toEqual([]);
    expect(published.at(-1)).toEqual([]);
  });

  test("decline returns declined and leaves the vault untouched", async () => {
    const { broker, vault } = createHarness();
    const pending = broker.request({ caller: CALLER, envVar: "GITHUB_TOKEN", reason: "Open a PR." });
    const card = await waitForCard(broker);
    expect(await broker.respond({ requestId: card.id, action: "decline" })).toEqual({ ok: true });
    expect(await pending).toEqual({ status: "declined", envVar: "GITHUB_TOKEN" });
    expect(await vault.list()).toEqual([]);
    expect(broker.list()).toEqual([]);
  });

  test("an unanswered request times out and its card goes away", async () => {
    const { broker } = createHarness({ timeoutMs: 15 });
    const result = await broker.request({ caller: CALLER, envVar: "SLOW_TOKEN", reason: "Later." });
    expect(result).toEqual({ status: "timed_out", envVar: "SLOW_TOKEN" });
    expect(broker.list()).toEqual([]);
  });

  test("a cancelled tool call removes the card", async () => {
    const { broker } = createHarness();
    const controller = new AbortController();
    const pending = broker.request({
      caller: CALLER,
      envVar: "CANCELLED_TOKEN",
      reason: "Turn stopped.",
      signal: controller.signal,
    });
    await waitForCard(broker);
    controller.abort();
    expect(await pending).toEqual({ status: "cancelled", envVar: "CANCELLED_TOKEN" });
    expect(broker.list()).toEqual([]);
  });

  test("reserved and malformed names are refused before any card is shown", async () => {
    const { broker, published } = createHarness();
    for (const envVar of ["PATH", "STAVE_LOCAL_MCP_TOKEN", "ANTHROPIC_API_KEY", "1BAD", "has-dash"]) {
      await expect(broker.request({ caller: CALLER, envVar, reason: "x" })).rejects.toBeInstanceOf(
        SecretRequestError,
      );
    }
    await expect(
      broker.request({ caller: CALLER, envVar: "FINE_NAME", reason: "   " }),
    ).rejects.toBeInstanceOf(SecretRequestError);
    expect(published).toEqual([]);
  });

  test("an existing secret for the variable is offered and can be bound as is", async () => {
    const { broker, vault } = createHarness();
    const existing = await vault.upsert({ name: "Stripe", envVarName: "STRIPE_KEY", value: VALUE });
    const pending = broker.request({ caller: CALLER, envVar: "STRIPE_KEY", reason: "Charge a test card." });
    const card = await waitForCard(broker);
    expect(card.existingSecret).toEqual({ id: existing.id, name: "Stripe", valuePreview: "••••6789" });

    const answer = await broker.respond({ requestId: card.id, action: "use-existing" });
    expect(answer).toEqual({ ok: true, secretId: existing.id });
    expect(await pending).toEqual({
      status: "saved",
      envVar: "STRIPE_KEY",
      availableFrom: "next-turn",
      reusedExisting: true,
    });
    expect(await vault.list()).toHaveLength(1);
  });

  test("a new value for an existing variable replaces that secret in place", async () => {
    const { broker, vault } = createHarness();
    const existing = await vault.upsert({
      name: "Stripe",
      description: "Billing sandbox",
      envVarName: "STRIPE_KEY",
      value: "old-value",
    });
    const pending = broker.request({ caller: CALLER, envVar: "STRIPE_KEY", reason: "Rotate." });
    const card = await waitForCard(broker);
    const answer = await broker.respond({ requestId: card.id, action: "save", value: VALUE });
    expect(answer).toEqual({ ok: true, secretId: existing.id });
    expect((await pending).status).toBe("saved");
    const [secret] = await vault.list();
    expect(secret).toMatchObject({ id: existing.id, name: "Stripe", description: "Billing sandbox" });
    expect((await vault.resolveEnvForIds([existing.id])).env.STRIPE_KEY).toBe(VALUE);
  });

  test("a removed existing secret is reported and the card keeps waiting", async () => {
    const { broker, vault } = createHarness();
    const existing = await vault.upsert({ name: "Gone", envVarName: "GONE_KEY", value: VALUE });
    const pending = broker.request({ caller: CALLER, envVar: "GONE_KEY", reason: "x" });
    const card = await waitForCard(broker);
    await vault.delete(existing.id);
    expect(await broker.respond({ requestId: card.id, action: "use-existing" })).toEqual({
      ok: false,
      reason: "existing-missing",
    });
    expect(broker.list()).toHaveLength(1);
    await broker.respond({ requestId: card.id, action: "decline" });
    expect((await pending).status).toBe("declined");
  });

  test("a second request for the same variable in a task is refused, and answers are single-use", async () => {
    const { broker } = createHarness();
    const pending = broker.request({ caller: CALLER, envVar: "ONE_KEY", reason: "x" });
    const card = await waitForCard(broker);
    await expect(
      broker.request({ caller: CALLER, envVar: "ONE_KEY", reason: "again" }),
    ).rejects.toBeInstanceOf(SecretRequestError);
    await broker.respond({ requestId: card.id, action: "decline" });
    await pending;
    expect(await broker.respond({ requestId: card.id, action: "save", value: VALUE })).toEqual({
      ok: false,
      reason: "not-pending",
    });
  });

  test("two concurrent calls for one variable open a single card", async () => {
    const { broker } = createHarness();
    const results = await Promise.allSettled([
      broker.request({ caller: CALLER, envVar: "RACE_KEY", reason: "first" }),
      broker.request({ caller: CALLER, envVar: "RACE_KEY", reason: "second" }),
      (async () => {
        const card = await waitForCard(broker);
        expect(broker.list()).toHaveLength(1);
        await broker.respond({ requestId: card.id, action: "decline" });
      })(),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "fulfilled", "rejected"]);
  });

  test("a vault name already in use gets a qualified one", () => {
    const secrets = [
      { id: "a", name: "OpenAI", description: "", valuePreview: "", createdAt: "", updatedAt: "" },
      { id: "b", name: "openai (OPENAI_KEY)", description: "", valuePreview: "", createdAt: "", updatedAt: "" },
    ];
    expect(uniqueSecretName("Fresh", "OPENAI_KEY", secrets)).toBe("Fresh");
    expect(uniqueSecretName("OpenAI", "OPENAI_KEY", secrets)).toBe("OpenAI (OPENAI_KEY) 2");
  });
});

describe("stave_request_secret tool", () => {
  test("refuses external callers and read-only tasks", async () => {
    const { broker } = createHarness();
    const input = { envVar: "TOKEN", reason: "x" };
    await expect(
      runSecretRequestTool({ caller: { kind: "external" }, input, broker }),
    ).rejects.toThrow("only inside a Stave task turn");
    await expect(
      runSecretRequestTool({
        caller: { kind: "turn", grant: { ...CALLER, autonomy: "read-only" } },
        input,
        broker,
      }),
    ).rejects.toThrow("read-only task");
    expect(broker.list()).toEqual([]);
  });

  async function connect(broker: SecretRequestBroker) {
    const server = new McpServer({ name: "test-stave", version: "1" });
    server.registerTool(SECRET_REQUEST_TOOL_NAME, SECRET_REQUEST_TOOL_CONFIG, async (input, extra) => {
      const result = await runSecretRequestTool({
        caller: TURN_CALLER,
        input,
        broker,
        signal: extra.signal,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    });
    const client = new Client({ name: "test-client", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    clients.push(client);
    return client;
  }

  test("the schema takes no value and the result never carries one", async () => {
    const { broker } = createHarness();
    const client = await connect(broker);
    const { tools } = await client.listTools();
    const tool = tools.find((entry) => entry.name === "stave_request_secret");
    expect(tool?.inputSchema).toMatchObject({ additionalProperties: false, required: ["envVar", "reason"] });
    expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual(["envVar", "label", "reason"]);
    expect(tool?.description).toContain("NEXT turn");

    const smuggled = await client.callTool({
      name: "stave_request_secret",
      arguments: { envVar: "TOKEN", reason: "x", value: VALUE },
    });
    expect(smuggled.isError).toBe(true);
    expect(broker.list()).toEqual([]);

    const call = client.callTool({
      name: "stave_request_secret",
      arguments: { envVar: "TOKEN", reason: "Deploy preview." },
    });
    const card = await waitForCard(broker);
    await broker.respond({ requestId: card.id, action: "save", value: VALUE });
    const result = await call;
    expect(result.structuredContent).toEqual({ status: "saved", envVar: "TOKEN", availableFrom: "next-turn" });
    expect(JSON.stringify(result)).not.toContain(VALUE);
  });

  test("the request log keeps only the declared arguments", () => {
    const body = {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "stave_request_secret",
        arguments: { envVar: "TOKEN", reason: "Deploy.", label: "Deploy token", value: VALUE, note: VALUE },
      },
    };
    const logged = sanitizeMcpLogValue([body]);
    expect(JSON.stringify(logged)).not.toContain(VALUE);
    expect(logged).toEqual([
      {
        ...body,
        params: {
          name: "stave_request_secret",
          arguments: { envVar: "TOKEN", reason: "Deploy.", label: "Deploy token", value: "[redacted]", note: "[redacted]" },
        },
      },
    ]);
  });

  test("is always allowed, denied to read-only tasks, and has a display name", () => {
    expect(isAlwaysAllowedStaveLocalMcpTool("mcp__stave-local-mcp__stave_request_secret")).toBe(true);
    expect(DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS).toContain("stave_request_secret");
    expect(CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS).toContain("mcp__stave-local-mcp__stave_request_secret");
    expect(toToolDisplayName("mcp__stave-local-mcp__stave_request_secret")).toBe("Request secret");
    const server = readFileSync(path.join(import.meta.dir, "../electron/main/stave-mcp-server.ts"), "utf8");
    expect(server).toMatch(/registerTool\(\s*"stave_request_secret",\s*SECRET_REQUEST_TOOL_CONFIG/);
  });
});

describe("secret request IPC and binding", () => {
  const requestId = "11111111-1111-4111-8111-000000000001";

  test("the answer schema carries a bounded value only for save", () => {
    expect(SecretRequestRespondArgsSchema.safeParse({ requestId, action: "save", value: VALUE }).success).toBe(true);
    expect(SecretRequestRespondArgsSchema.safeParse({ requestId, action: "decline" }).success).toBe(true);
    expect(SecretRequestRespondArgsSchema.safeParse({ requestId, action: "use-existing" }).success).toBe(true);
    for (const invalid of [
      { requestId, action: "save", value: "" },
      { requestId, action: "save", value: "x".repeat(8193) },
      { requestId, action: "decline", value: VALUE },
      { requestId: "not-a-uuid", action: "decline" },
      { requestId, action: "reveal" },
    ]) {
      expect(SecretRequestRespondArgsSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("the bridge is wired end to end and exposes no reader for a value", () => {
    const read = (relativePath: string) => readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
    const main = read("electron/main/ipc/secret-requests.ts");
    expect(main).toMatch(/ipcMain\.handle\(\s*SECRET_REQUEST_IPC\.list/);
    expect(main).toMatch(/ipcMain\.handle\(\s*SECRET_REQUEST_IPC\.respond/);
    expect(read("electron/main/ipc/index.ts")).toContain("registerSecretRequestHandlers();");
    const preload = read("electron/preload.ts");
    const start = preload.indexOf("const secretRequestsApi");
    const bridge = preload.slice(start, preload.indexOf("\n};", start));
    expect([...bridge.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1])).toEqual([
      "list",
      "respond",
      "subscribeChanged",
    ]);
    expect(preload).toContain("secretRequests: secretRequestsApi,");
    expect(preload).not.toContain("resolveBoundSecretEnv");
    expect(read("src/types/window-api.d.ts")).toContain("secretRequests?: SecretRequestsBridgeApi;");
  });

  test("binding adds the id once and never exceeds the cap", () => {
    expect(nextBoundSecretIds(undefined, "a")).toEqual({ ids: ["a"], outcome: "bound" });
    expect(nextBoundSecretIds(["a"], "a")).toEqual({ ids: ["a"], outcome: "already-bound" });
    const full = Array.from({ length: MAX_BOUND_SECRETS }, (_, index) => `id-${index}`);
    expect(nextBoundSecretIds(full, "new")).toEqual({ ids: full, outcome: "at-cap" });
    expect(previewSecretBinding(full, null)).toBe("at-cap");
    expect(previewSecretBinding(full, "id-3")).toBe("already-bound");
    expect(previewSecretBinding(["a"], null)).toBe("bound");
  });
});
