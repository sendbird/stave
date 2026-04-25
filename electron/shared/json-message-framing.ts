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

export class JsonMessageFrameDecoder {
  private buffer = Buffer.alloc(0);
  private expectedMessageBytes: number | null = null;

  constructor(private readonly options: JsonMessageFrameDecoderOptions) {}

  append(chunk: Buffer | string) {
    const chunkBuffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, "utf8");

    if (this.buffer.length + chunkBuffer.length > this.options.maxBufferBytes) {
      throw new Error(
        `[${this.options.label}] protocol overflow: buffer exceeded ${this.options.maxBufferBytes} bytes`,
      );
    }

    this.buffer = Buffer.concat([this.buffer, chunkBuffer]);
    const messages: string[] = [];

    for (;;) {
      if (this.expectedMessageBytes == null) {
        const headerEnd = this.buffer.indexOf(FRAME_HEADER_SEPARATOR);
        if (headerEnd === -1) {
          break;
        }

        const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
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
        this.buffer = this.buffer.slice(headerEnd + 1);
      }

      if (this.expectedMessageBytes == null) {
        break;
      }
      if (this.buffer.length < this.expectedMessageBytes) {
        break;
      }

      const messageBuffer = this.buffer.slice(0, this.expectedMessageBytes);
      messages.push(messageBuffer.toString("utf8"));
      this.buffer = this.buffer.slice(this.expectedMessageBytes);
      this.expectedMessageBytes = null;
    }

    return messages;
  }
}
