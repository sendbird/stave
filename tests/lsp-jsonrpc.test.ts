import { describe, expect, test } from "bun:test";
import { encodeJsonRpcMessage, JsonRpcMessageBuffer } from "../electron/main/lsp/jsonrpc";

describe("encodeJsonRpcMessage", () => {
  test("frames a JSON-RPC payload with a content-length header", () => {
    const message = { jsonrpc: "2.0", id: 1, method: "initialize" };
    const encoded = encodeJsonRpcMessage(message);

    expect(encoded).toContain("\r\n\r\n");
    expect(encoded).toContain("\"method\":\"initialize\"");
    expect(encoded.startsWith("Content-Length: ")).toBe(true);
  });
});

describe("JsonRpcMessageBuffer", () => {
  test("parses a single message across split chunks", () => {
    const buffer = new JsonRpcMessageBuffer();
    const encoded = encodeJsonRpcMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const halfway = Math.floor(encoded.length / 2);

    expect(buffer.append(encoded.slice(0, halfway))).toEqual([]);
    expect(buffer.append(encoded.slice(halfway))).toEqual([
      { jsonrpc: "2.0", id: 1, result: { ok: true } },
    ]);
  });

  test("parses multiple back-to-back messages", () => {
    const buffer = new JsonRpcMessageBuffer();
    const encoded = [
      encodeJsonRpcMessage({ jsonrpc: "2.0", id: 1, result: "a" }),
      encodeJsonRpcMessage({ jsonrpc: "2.0", id: 2, result: "b" }),
    ].join("");

    expect(buffer.append(encoded)).toEqual([
      { jsonrpc: "2.0", id: 1, result: "a" },
      { jsonrpc: "2.0", id: 2, result: "b" },
    ]);
  });

  test("throws when the buffered transport stream exceeds the byte cap", () => {
    const buffer = new JsonRpcMessageBuffer();

    expect(() => buffer.append("x".repeat(2 * 1024 * 1024 + 1))).toThrow(
      "LSP JSON-RPC buffer exceeded 2097152 bytes",
    );
  });

  test("throws when a declared message body exceeds the byte cap", () => {
    const buffer = new JsonRpcMessageBuffer();
    const tooLarge = 1 * 1024 * 1024 + 1;

    expect(() =>
      buffer.append(`Content-Length: ${tooLarge}\r\n\r\n`),
    ).toThrow("LSP JSON-RPC message exceeded 1048576 bytes");
  });
});
