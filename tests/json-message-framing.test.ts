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

  test("reassembles a multi-megabyte frame streamed in pipe-sized chunks", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "test-frame",
      maxBufferBytes: 8 * 1024 * 1024,
      maxMessageBytes: 4 * 1024 * 1024,
    });
    const payload = { type: "event", text: "한".repeat(1_000_000) };
    const framed = Buffer.from(
      serializeJsonFramedMessage(payload).serialized +
        serializeJsonFramedMessage({ type: "tail" }).serialized,
      "utf8",
    );

    const decoded: string[] = [];
    for (let offset = 0; offset < framed.length; offset += 65_536) {
      decoded.push(...decoder.append(framed.subarray(offset, offset + 65_536)));
    }

    expect(decoded).toHaveLength(2);
    expect(JSON.parse(decoded[0]!)).toEqual(payload);
    expect(decoded[1]).toBe(JSON.stringify({ type: "tail" }));
  });

  test("handles a header split across chunks and a zero-length frame", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "test-frame",
      maxBufferBytes: 256,
      maxMessageBytes: 128,
    });

    expect(decoder.append(Buffer.from("1", "utf8"))).toEqual([]);
    expect(decoder.append(Buffer.from("0\n{\"a", "utf8"))).toEqual([]);
    expect(decoder.append(Buffer.from("\":true}0\n2\n{}", "utf8"))).toEqual([
      "{\"a\":true}",
      "",
      "{}",
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
