import { describe, expect, test } from "bun:test";
import { buildHostServiceRequestEnvelope } from "../electron/main/host-service-client";
import { JsonMessageFrameDecoder, serializeJsonFramedMessage } from "../electron/shared/json-message-framing";
import { SecondaryProviderExecutionRequestSchema } from "../src/lib/runs/secondary-run";
import {
  HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS,
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES,
  shouldBypassOutboundQueueLimit,
  truncateHostServiceErrorMessage,
} from "../electron/shared/host-service-transport";

describe("shouldBypassOutboundQueueLimit", () => {
  test("lets an error response through so a waiting caller always settles", () => {
    // The regression this guards: a saturated outbound queue rejected the
    // success response, the replacement error response hit the same cap, the
    // failure was swallowed, and the caller's promise never settled at all.
    expect(
      shouldBypassOutboundQueueLimit({ type: "response", ok: false }),
    ).toBe(true);
  });

  test("keeps success responses and events subject to backpressure", () => {
    expect(shouldBypassOutboundQueueLimit({ type: "response", ok: true })).toBe(
      false,
    );
    expect(shouldBypassOutboundQueueLimit({ type: "event" })).toBe(false);
    expect(shouldBypassOutboundQueueLimit({ type: "ready" })).toBe(false);
  });
});

describe("truncateHostServiceErrorMessage", () => {
  test("leaves ordinary messages untouched", () => {
    expect(truncateHostServiceErrorMessage("boom")).toBe("boom");
  });

  test("bounds the payload so bypassing the queue cap stays safe", () => {
    const truncated = truncateHostServiceErrorMessage(
      "x".repeat(HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS * 2),
    );

    expect(truncated).toHaveLength(HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS + 1);
    expect(truncated.endsWith("…")).toBe(true);
  });
});

// Use the actual envelope, serializer and pipe decoder: schema acceptance alone
// does not prove an attachment can reach the executor.

function decoder(label = "host-service stdin") {
  return new JsonMessageFrameDecoder({ label, maxMessageBytes: HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
    maxBufferBytes: HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES });
}

function maximumRequest() {
  const image = (size: number, label: string) => ({ type: "image_context", label, mimeType: "image/png",
    dataUrl: "data:image/png;base64," + "A".repeat(size - "data:image/png;base64,".length) });
  return SecondaryProviderExecutionRequestSchema.parse({ runId: "r".repeat(300), stepId: "s".repeat(300), executionId: "e".repeat(300),
    input: { providerId: "codex", model: "m".repeat(200), prompt: "\u0000".repeat(100_000), cwd: "/tmp/project", toolsDisabled: true,
      attachments: [image(6_000_000, "large.png"), image(2_000_000, "second.png"),
        { type: "file_context", filePath: "notes.txt", language: "text", content: "\u0000".repeat(32_000) }] },
    policy: { maxAttempts: 3, timeoutMs: 120_000, maxTurns: 16, maxOutputBytes: 64_000, maxEvents: 256 } });
}

describe("host transport attachment boundaries", () => {
  test("delivers maximum valid images and escaped text without losing a following frame", () => {
    const request = buildHostServiceRequestEnvelope(1, "runs.execute-secondary", maximumRequest());
    const frame = serializeJsonFramedMessage(request);
    expect(frame.messageBytes).toBeGreaterThan(8_000_000);
    const formerDecoder = new JsonMessageFrameDecoder({ label: "former host limit", maxMessageBytes: 4 * 1024 * 1024, maxBufferBytes: 8 * 1024 * 1024 });
    expect(() => formerDecoder.append(`${frame.messageBytes}\n`)).toThrow("protocol overflow: message exceeded");
    expect(frame.messageBytes).toBeLessThan(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES);
    const pipe = Buffer.from(frame.serialized + serializeJsonFramedMessage({ type: "ready" }).serialized);
    const input = decoder();
    const messages: string[] = [];
    for (let offset = 0; offset < pipe.length; offset += 65_536) messages.push(...input.append(pipe.subarray(offset, offset + 65_536)));
    expect(messages).toHaveLength(2);
    expect(JSON.parse(messages[0]!)).toEqual(request);
    expect(JSON.parse(messages[1]!)).toEqual({ type: "ready" });
  });

  test("rejects attachments beyond the schema limit even when the frame would fit", () => {
    const request = maximumRequest();
    const attachments = request.input.attachments!;
    const image = attachments[1]!;
    if (image.type !== "image_context") throw new Error("Expected an image fixture");
    image.dataUrl += "A";
    expect(serializeJsonFramedMessage(request).messageBytes).toBeLessThan(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES);
    expect(SecondaryProviderExecutionRequestSchema.safeParse(request).success).toBe(false);
    const singleImage = maximumRequest();
    const first = singleImage.input.attachments![0]!;
    if (first.type !== "image_context") throw new Error("Expected an image fixture");
    singleImage.input.attachments = [{ ...first, dataUrl: first.dataUrl + "A" }];
    expect(SecondaryProviderExecutionRequestSchema.safeParse(singleImage).success).toBe(false);
  });

  for (const label of ["host-service stdin", "host-service stdout"]) {
    test(`${label} accepts the exact frame cap and rejects one byte above before buffering a body`, () => {
      const frame = serializeJsonFramedMessage("x".repeat(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES - 2));
      expect(frame.messageBytes).toBe(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES);
      expect(decoder(label).append(frame.serialized)).toEqual([frame.json]);
      expect(() => decoder(label).append(`${HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES + 1}\n`)).toThrow("protocol overflow: message exceeded");
      expect(() => decoder(label).append(Buffer.alloc(HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES + 1))).toThrow("protocol overflow: buffer exceeded");
    });
  }
});
