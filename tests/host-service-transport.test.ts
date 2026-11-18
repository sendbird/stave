import { describe, expect, test } from "bun:test";
import { buildHostServiceRequestEnvelope } from "../electron/main/host-service-client";
import { JsonMessageFrameDecoder, serializeJsonFramedMessage } from "../electron/shared/json-message-framing";
import { SecondaryProviderExecutionRequestSchema } from "../src/lib/runs/secondary-run";
import {
  HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS,
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES,
  HOST_SERVICE_EVENT_QUEUE_MAX_BYTES,
  HOST_SERVICE_CHANGE_SIGNAL_MAX_BYTES,
  HOST_SERVICE_QUEUE_REJECTED_PREFIX,
  OutboundBacklog,
  outboundBacklogKind,
  outboundQueueLimitBytes,
  selectHostQueueRejections,
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

describe("outboundQueueLimitBytes", () => {
  test("an event backlog cannot reject a success response a caller waits for", () => {
    // Reported: `tars:get` failed with "protocol overflow: outbound queue exceeded 2097152 bytes"
    // when a ~120 KB snapshot response met a backlog of events from parallel runs.
    const backlog = HOST_SERVICE_EVENT_QUEUE_MAX_BYTES - 1_000;
    const snapshotResponse = 120 * 1024;
    expect(backlog + snapshotResponse).toBeGreaterThan(HOST_SERVICE_EVENT_QUEUE_MAX_BYTES);
    expect(backlog + snapshotResponse).toBeLessThanOrEqual(outboundQueueLimitBytes({ type: "response", ok: true }));
    // Responses still share the receiver's finite buffer budget.
    expect(outboundQueueLimitBytes({ type: "response", ok: true })).toBe(HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES);
  });

  test("events keep the small backlog cap and error responses always pass", () => {
    expect(outboundQueueLimitBytes({ type: "event" })).toBe(HOST_SERVICE_EVENT_QUEUE_MAX_BYTES);
    expect(outboundQueueLimitBytes({ type: "ready" })).toBe(HOST_SERVICE_EVENT_QUEUE_MAX_BYTES);
    expect(outboundQueueLimitBytes({ type: "response", ok: false })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("outbound change signals and backlog diagnostics", () => {
  test("a small change signal is not shed with bulk events; a large one is", () => {
    // Dropping `tars.changed` left the Tars tray stale until something else changed.
    expect(outboundQueueLimitBytes({ type: "event", event: "tars.changed" }, 200)).toBe(HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES);
    expect(outboundQueueLimitBytes({ type: "event", event: "agent-run.changed" }, 200)).toBe(HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES);
    expect(outboundQueueLimitBytes({ type: "event", event: "tars.changed" }, HOST_SERVICE_CHANGE_SIGNAL_MAX_BYTES + 1)).toBe(HOST_SERVICE_EVENT_QUEUE_MAX_BYTES);
    expect(outboundQueueLimitBytes({ type: "event", event: "provider.stream-event" }, 200)).toBe(HOST_SERVICE_EVENT_QUEUE_MAX_BYTES);
  });

  test("the backlog names what holds the most pending bytes and forgets what was written", () => {
    const backlog = new OutboundBacklog();
    backlog.add(outboundBacklogKind({ type: "event", event: "provider.stream-event" }), 1_500_000);
    backlog.add(outboundBacklogKind({ type: "event", event: "agent-run.changed" }), 2_000);
    backlog.add(outboundBacklogKind({ type: "response" }), 120_000);
    expect(backlog.bytes).toBe(1_622_000);
    expect(backlog.describeTop(2)).toBe("provider.stream-event=1500000 response=120000");
    backlog.remove("provider.stream-event", 1_500_000);
    expect(backlog.describeTop()).toBe("response=120000 agent-run.changed=2000");
    expect(backlog.bytes).toBe(122_000);
  });

  test("only queue-rejection lines from host stderr are kept, bounded", () => {
    const line = `${HOST_SERVICE_QUEUE_REJECTED_PREFIX} label=response:7 bytes=120000 top=provider.stream-event=2000000`;
    expect(selectHostQueueRejections(`noise\n${line}\n[host-service] other\n`)).toEqual([line]);
    expect(selectHostQueueRejections(Array.from({ length: 9 }, () => line).join("\n"))).toHaveLength(4);
    expect(selectHostQueueRejections(`${HOST_SERVICE_QUEUE_REJECTED_PREFIX}${"x".repeat(5_000)}`)[0]).toHaveLength(1_000);
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
