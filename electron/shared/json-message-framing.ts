import { byteLengthUtf8 } from "./bounded-text";

const FRAME_HEADER_SEPARATOR = 0x0a; // "\n"

export interface JsonMessageFrameDecoderOptions {
  label: string;
  maxBufferBytes: number;
  maxMessageBytes: number;
}

export function serializeJsonFramedMessage(message: unknown) {
  const json = JSON.stringify(message);
  const messageBytes = byteLengthUtf8(json);
  return {
    json,
    messageBytes,
    serialized: `${messageBytes}\n${json}`,
    serializedBytes: messageBytes + byteLengthUtf8(String(messageBytes)) + 1,
  };
}

/**
 * Decodes `<byteLength>\n<json>` frames from a chunked byte stream.
 *
 * Incoming chunks are kept in a list and only copied once, when a complete
 * frame is extracted. Re-concatenating the whole pending buffer on every
 * chunk made a multi-megabyte frame arriving in 64 KiB pipe reads cost
 * O(frame² / chunk) bytes of copying and garbage per frame, which showed up
 * as main-process CPU and native-memory spikes under bursty host-service
 * traffic.
 */
export class JsonMessageFrameDecoder {
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private expectedMessageBytes: number | null = null;

  constructor(private readonly options: JsonMessageFrameDecoderOptions) {}

  append(chunk: Buffer | string) {
    const chunkBuffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, "utf8");

    if (this.bufferedBytes + chunkBuffer.length > this.options.maxBufferBytes) {
      throw new Error(
        `[${this.options.label}] protocol overflow: buffer exceeded ${this.options.maxBufferBytes} bytes`,
      );
    }

    if (chunkBuffer.length > 0) {
      this.chunks.push(chunkBuffer);
      this.bufferedBytes += chunkBuffer.length;
    }
    const messages: string[] = [];

    for (;;) {
      if (this.expectedMessageBytes == null) {
        const headerEnd = this.indexOfSeparator();
        if (headerEnd === -1) {
          break;
        }

        const headerText = this.take(headerEnd).toString("utf8");
        this.take(1);
        const nextMessageBytes = Number.parseInt(headerText, 10);
        if (
          !Number.isFinite(nextMessageBytes) ||
          nextMessageBytes < 0 ||
          `${nextMessageBytes}` !== headerText.trim()
        ) {
          throw new Error(
            `[${this.options.label}] invalid message frame header: ${headerText || "<empty>"}`,
          );
        }
        if (nextMessageBytes > this.options.maxMessageBytes) {
          throw new Error(
            `[${this.options.label}] protocol overflow: message exceeded ${this.options.maxMessageBytes} bytes`,
          );
        }

        this.expectedMessageBytes = nextMessageBytes;
      }

      if (this.bufferedBytes < this.expectedMessageBytes) {
        break;
      }

      messages.push(this.take(this.expectedMessageBytes).toString("utf8"));
      this.expectedMessageBytes = null;
    }

    return messages;
  }

  /** Byte offset of the first frame-header separator, or -1 when incomplete. */
  private indexOfSeparator() {
    let offset = 0;
    for (const chunk of this.chunks) {
      const index = chunk.indexOf(FRAME_HEADER_SEPARATOR);
      if (index !== -1) {
        return offset + index;
      }
      offset += chunk.length;
    }
    return -1;
  }

  /** Remove and return the first `byteCount` buffered bytes (single copy). */
  private take(byteCount: number): Buffer {
    if (byteCount === 0) {
      return Buffer.alloc(0);
    }
    const head = this.chunks[0]!;
    if (head.length >= byteCount) {
      const result = head.subarray(0, byteCount);
      if (head.length === byteCount) {
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(byteCount);
      }
      this.bufferedBytes -= byteCount;
      return result;
    }

    const result = Buffer.allocUnsafe(byteCount);
    let copied = 0;
    while (copied < byteCount) {
      const chunk = this.chunks[0]!;
      const remaining = byteCount - copied;
      if (chunk.length <= remaining) {
        chunk.copy(result, copied);
        copied += chunk.length;
        this.chunks.shift();
      } else {
        chunk.copy(result, copied, 0, remaining);
        this.chunks[0] = chunk.subarray(remaining);
        copied += remaining;
      }
    }
    this.bufferedBytes -= byteCount;
    return result;
  }
}
