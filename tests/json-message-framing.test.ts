import { describe, expect, test } from "bun:test";
import {
  JsonMessageFrameDecoder,
  serializeJsonFramedMessage,
} from "../electron/shared/json-message-framing";

describe("JsonMessageFrameDecoder", () => {
  test("decodes concatenated framed messages across chunk boundaries", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "test-frame",
      maxBufferBytes: 256,
      maxMessageBytes: 128,
    });

    const first = serializeJsonFramedMessage({ type: "ready" }).serialized;
    const second = serializeJsonFramedMessage({
      type: "event",
      payload: { text: "hello" },
    }).serialized;
    const joined = first + second;

    const firstChunk = joined.slice(0, 10);
    const secondChunk = joined.slice(10);

    expect(decoder.append(Buffer.from(firstChunk, "utf8"))).toEqual([]);
    expect(decoder.append(Buffer.from(secondChunk, "utf8"))).toEqual([
      JSON.stringify({ type: "ready" }),
      JSON.stringify({ type: "event", payload: { text: "hello" } }),
    ]);
  });

  test("rejects framed messages that exceed the message limit", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "test-frame",
      maxBufferBytes: 1024,
      maxMessageBytes: 8,
    });

    expect(() =>
      decoder.append(Buffer.from("12\n{\"ok\":true}", "utf8")),
    ).toThrow(
      "[test-frame] protocol overflow: message exceeded 8 bytes",
    );
  });

  test("rejects invalid frame headers", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "test-frame",
      maxBufferBytes: 1024,
      maxMessageBytes: 128,
    });

    expect(() =>
      decoder.append(Buffer.from("abc\n{}", "utf8")),
    ).toThrow(
      "[test-frame] invalid message frame header: abc",
    );
  });
});
