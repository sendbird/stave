import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { createHostGatewayCredentialBroker } from "../electron/provider-accounts/host-gateway-credentials";
import { resolveHostGatewayCredentialRequest } from "../electron/main/host-gateway-credentials";
import { JsonMessageFrameDecoder, serializeJsonFramedMessage } from "../electron/shared/json-message-framing";
import { withGatewayCredential, validateClaudeGatewayModel } from "../electron/provider-accounts/gateway-runtime";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";

const priorRoot = process.env.STAVE_USER_DATA_PATH;
let root: string;
let registry: ProviderAccountRegistry;
const secretId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "stave-gateway-credentials-"));
  process.env.STAVE_USER_DATA_PATH = root;
  registry = new ProviderAccountRegistry(root);
});
afterEach(() => {
  if (priorRoot === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = priorRoot;
  rmSync(root, { force: true, recursive: true });
});

test("host-started turns resolve their captured connection across fresh brokers and key rotation", async () => {
  const connection = registry.createApiConnection({ label: "Gateway fixture", kind: "vercel-ai-gateway", secretId, models: [{ id: "anthropic/claude-sonnet-5" }] });
  let key = "first-fixture-key";
  for (const expected of ["first-fixture-key", "second-fixture-key"]) {
    const broker = createHostGatewayCredentialBroker(async (request) => {
      const framed = serializeJsonFramedMessage(request);
      expect(framed.json).not.toContain("fixture-key");
      const decoder = new JsonMessageFrameDecoder({ label: "test", maxBufferBytes: 100_000, maxMessageBytes: 100_000 });
      const received = JSON.parse(decoder.append(Buffer.from(framed.serialized))[0]!);
      const response = await resolveHostGatewayCredentialRequest(received, async () => ({ value: key }));
      expect(response?.credentials?.["claude-code"]?.token).toBe(expected);
      broker.receive(response!);
    });
    const response = await broker.request({ claudeAccountProfileId: connection.id, codexAccountProfileId: connection.id, model: "claude-sonnet-5", boundSecretIds: ["primary-only"] } as never);
    const selected = withGatewayCredential(response?.credentials, () => withProviderAccountScope({ claudeAccountProfileId: connection.id }, () => validateClaudeGatewayModel("claude-sonnet-5")));
    expect(selected).toBe("anthropic/claude-sonnet-5");
    expect(response?.credentials?.codex?.profileId).toBe(connection.id);
    key = "second-fixture-key"; broker.close();
  }
});

test("decision tokens are resolved only for an existing preset connection, never custom endpoints", async () => {
  const preset = registry.createApiConnection({ label: "Preset", kind: "vercel-ai-gateway", secretId, models: [{ id: "openai/gpt-6-luna" }] });
  const custom = registry.createApiConnection({ label: "Custom", kind: "custom", secretId, endpoints: { codex: "https://gateway.example.test/v1" }, models: [{ id: "fixture/coder" }] });
  const request = (decisionConnectionId: string) => ({ type: "gateway-credential-request", id: crypto.randomUUID(), accounts: {}, decisionConnectionId });
  let reveals = 0;
  const resolve = async () => { reveals++; return { value: "decision-fixture-key" }; };
  expect((await resolveHostGatewayCredentialRequest(request(custom.id), resolve))?.decisionToken).toBeUndefined();
  expect((await resolveHostGatewayCredentialRequest(request(crypto.randomUUID()), resolve))?.decisionToken).toBeUndefined();
  expect(reveals).toBe(0);
  expect((await resolveHostGatewayCredentialRequest(request(preset.id), resolve))?.decisionToken).toBe("decision-fixture-key");
  expect(reveals).toBe(1);
  expect(await resolveHostGatewayCredentialRequest({ ...request(preset.id), token: "injected" }, resolve)).toBeUndefined();
});

test("missing keys fail closed and main exception text never reaches the private response", async () => {
  const preset = registry.createApiConnection({ label: "Preset", kind: "vercel-ai-gateway", secretId, models: [{ id: "openai/gpt-6-luna" }] });
  const request = { type: "gateway-credential-request", id: crypto.randomUUID(), accounts: { codexAccountProfileId: preset.id }, decisionConnectionId: preset.id };
  const response = await resolveHostGatewayCredentialRequest(request, async () => { throw new Error("sensitive-fixture-value"); });
  expect(response?.decisionToken).toBeUndefined();
  expect(response?.credentials?.codex?.token).toBeUndefined();
  expect(JSON.stringify(response)).not.toContain("sensitive-fixture-value");
});

test("concurrent requests remain isolated; aborted or closed brokers discard late credentials", async () => {
  const requests: Array<Parameters<Parameters<typeof createHostGatewayCredentialBroker>[0]>[0]> = [];
  const broker = createHostGatewayCredentialBroker(async (request) => { requests.push(request); });
  const first = broker.request({}, crypto.randomUUID());
  const second = broker.request({}, crypto.randomUUID());
  broker.receive({ type: "gateway-credential-response", id: requests[1]!.id, decisionToken: "second-fixture" });
  broker.receive({ type: "gateway-credential-response", id: requests[0]!.id, decisionToken: "first-fixture" });
  expect((await first)?.decisionToken).toBe("first-fixture");
  expect((await second)?.decisionToken).toBe("second-fixture");
  const controller = new AbortController();
  const aborted = broker.request({}, undefined, controller.signal); controller.abort();
  expect(await aborted).toBeUndefined();
  const closed = broker.request({}); broker.close();
  expect(await closed).toBeUndefined();
  broker.receive({ type: "gateway-credential-response", id: requests.at(-1)!.id, decisionToken: "late-fixture" });
});
