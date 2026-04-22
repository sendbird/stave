import { byteLengthUtf8 } from "../../shared/bounded-text";

const HEADER_SEPARATOR = "\r\n\r\n";
const JSONRPC_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const JSONRPC_MESSAGE_MAX_BYTES = 1 * 1024 * 1024;

export function encodeJsonRpcMessage(message: unknown) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

export class JsonRpcMessageBuffer {
  private buffer = "";

  append(chunk: string | Buffer) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (byteLengthUtf8(this.buffer) > JSONRPC_BUFFER_MAX_BYTES) {
      throw new Error(
        `LSP JSON-RPC buffer exceeded ${JSONRPC_BUFFER_MAX_BYTES} bytes`,
      );
    }
    const messages: unknown[] = [];

    while (true) {
      const headerEndIndex = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEndIndex < 0) {
        break;
      }

      const headerText = this.buffer.slice(0, headerEndIndex);
      const headers = headerText
        .split("\r\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const contentLengthHeader = headers.find((line) => line.toLowerCase().startsWith("content-length:"));
      if (!contentLengthHeader) {
        this.buffer = this.buffer.slice(headerEndIndex + HEADER_SEPARATOR.length);
        continue;
      }

      const contentLength = Number.parseInt(contentLengthHeader.split(":")[1]?.trim() ?? "", 10);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        this.buffer = this.buffer.slice(headerEndIndex + HEADER_SEPARATOR.length);
        continue;
      }
      if (contentLength > JSONRPC_MESSAGE_MAX_BYTES) {
        throw new Error(
          `LSP JSON-RPC message exceeded ${JSONRPC_MESSAGE_MAX_BYTES} bytes`,
        );
      }

      const bodyStartIndex = headerEndIndex + HEADER_SEPARATOR.length;
      const bodyEndIndex = bodyStartIndex + contentLength;
      if (this.buffer.length < bodyEndIndex) {
        break;
      }

      const body = this.buffer.slice(bodyStartIndex, bodyEndIndex);
      this.buffer = this.buffer.slice(bodyEndIndex);

      try {
        messages.push(JSON.parse(body));
      } catch {
        // Skip invalid JSON payloads from the stream.
      }
    }

    return messages;
  }
}
