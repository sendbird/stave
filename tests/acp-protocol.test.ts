import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { z } from "zod";
import {
  AcpProtocolClient,
  AcpProtocolError,
} from "../electron/providers/acp/acp-protocol";
import {
  AcpLineTooLargeError,
  AcpNdjsonDecoder,
} from "../electron/providers/acp/acp-ndjson";

const fixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-acp-agent.ts",
);
const clients: AcpProtocolClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close("ACP protocol test cleanup.");
  }
});

function createClient(
  scenario = "standard",
  options: Partial<ConstructorParameters<typeof AcpProtocolClient>[0]> = {},
) {
  const client = new AcpProtocolClient({
    command: process.execPath,
    args: [fixturePath, scenario],
    cwd: import.meta.dir,
    env: { ...process.env },
    ...options,
  });
  clients.push(client);
  return client;
}

async function initialize(client: AcpProtocolClient) {
  return client.initialize({
    clientName: "stave-test",
    clientVersion: "0.0.0",
  });
}

describe("ACP NDJSON framing", () => {
  test("decodes fragmented UTF-8 and multiple messages in one chunk", () => {
    const decoder = new AcpNdjsonDecoder(1024);
    const payload = Buffer.from('{"text":"한😀"}\n{"value":2}\n', "utf8");
    const split = payload.indexOf(Buffer.from("😀")) + 2;
    expect(decoder.push(payload.subarray(0, split))).toEqual([]);
    expect(decoder.push(payload.subarray(split))).toEqual([
      '{"text":"한😀"}',
      '{"value":2}',
    ]);
  });

  test("rejects oversized lines before a newline arrives", () => {
    const decoder = new AcpNdjsonDecoder(8);
    expect(() => decoder.push("123456789")).toThrow(AcpLineTooLargeError);
  });
});

describe("ACP protocol client", () => {
  test("matches out-of-order responses to their requests", async () => {
    const client = createClient();
    await initialize(client);
    const schema = z.object({ value: z.string() });
    const [slow, fast] = await Promise.all([
      client.request("fixture/slow", {}, schema),
      client.request("fixture/fast", {}, schema),
    ]);
    expect(slow.value).toBe("slow");
    expect(fast.value).toBe("fast");
  });

  test("surfaces JSON-RPC errors with their code", async () => {
    const client = createClient();
    await initialize(client);
    await expect(
      client.request("fixture/error", {}, z.unknown()),
    ).rejects.toMatchObject({
      name: "AcpProtocolError",
      code: -32001,
      message: "fixture failure",
    });
  });

  test("times out unanswered requests", async () => {
    const client = createClient();
    await initialize(client);
    await expect(
      client.request("fixture/timeout", {}, z.unknown(), { timeoutMs: 20 }),
    ).rejects.toThrow("timed out");
  });

  test("rejects pending requests when the process exits", async () => {
    const client = createClient();
    await initialize(client);
    await expect(
      client.request("fixture/exit", {}, z.unknown()),
    ).rejects.toThrow("exited (7/none)");
  });

  test("ignores malformed JSON and continues with the next response", async () => {
    const diagnostics: string[] = [];
    const client = createClient("standard", {
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await initialize(client);
    await expect(
      client.request("fixture/malformed", {}, z.object({ ok: z.literal(true) })),
    ).resolves.toEqual({ ok: true });
    expect(diagnostics).toContain("Ignored malformed ACP JSON message.");
  });

  test("reports unknown notifications without parsing their payload", async () => {
    const methods: string[] = [];
    const client = createClient("unknown-notification", {
      onUnknownNotification: (method) => methods.push(method),
    });
    await initialize(client);
    await Bun.sleep(10);
    expect(methods).toEqual(["fixture/unknown_notification"]);
  });

  test("answers unknown blocking requests with method-not-found", async () => {
    const response = new Promise<unknown>((resolve) => {
      createClient("unknown-request", {
        onNotification: (method, params) => {
          if (method === "fixture/server_response") {
            resolve(params);
            return true;
          }
          return false;
        },
      });
    });
    const client = clients.at(-1)!;
    await initialize(client);
    await expect(response).resolves.toEqual({
      error: {
        code: -32601,
        message: "Method not found: fixture/unknown_request",
      },
    });
  });

  test("bounds stderr retained for diagnostics", async () => {
    const client = createClient("standard", { maxStderrBytes: 16 });
    await initialize(client);
    await client.request(
      "fixture/stderr",
      {},
      z.object({ ok: z.literal(true) }),
    );
    await Bun.sleep(10);
    expect(Buffer.byteLength(client.stderr, "utf8")).toBe(16);
  });

  test("fails closed when stdout exceeds the configured line bound", async () => {
    const client = createClient("standard", { maxLineBytes: 512 });
    await initialize(client);
    await expect(
      client.request("fixture/oversized", {}, z.unknown()),
    ).rejects.toBeInstanceOf(AcpLineTooLargeError);
  });

  test("sends cancellation and accepts the cancelled stop reason", async () => {
    const client = createClient("cancel");
    await initialize(client);
    const session = await client.openSession({ cwd: import.meta.dir });
    const prompt = client.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "cancel me" }],
    });
    await client.cancel(session.sessionId);
    await expect(prompt).resolves.toMatchObject({ stopReason: "cancelled" });
  });

  test("preserves protocol error identity", () => {
    expect(new AcpProtocolError("demo")).toBeInstanceOf(Error);
  });
});
