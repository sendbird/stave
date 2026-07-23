import { byteLengthUtf8 } from "./bounded-text";

const OVERSIZED_LINE_PREFIX_MAX_CHARS = 2048;

export interface OversizedLineInfo {
  /** Total UTF-8 byte size of the dropped line (excluding the newline). */
  lineBytes: number;
  /** Leading characters of the dropped line, for diagnostics only. */
  linePrefix: string;
}

export interface Utf8LineBufferOptions {
  label: string;
  maxBufferBytes: number;
  maxLineBytes: number;
  /**
   * When provided, a line exceeding `maxLineBytes` is dropped and reported
   * through this callback, and parsing resynchronizes at the next newline
   * instead of throwing (which would tear down the whole stream consumer).
   */
  onOversizedLine?: (info: OversizedLineInfo) => void;
}

export class Utf8LineBuffer {
  private buffer = "";
  /** >= 0 while discarding an oversized line until its terminating newline. */
  private discardedLineBytes = -1;
  private discardedLinePrefix = "";

  constructor(private readonly options: Utf8LineBufferOptions) {}

  append(chunk: string | Buffer) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    const lines: string[] = [];
    while (true) {
      if (this.discardedLineBytes >= 0) {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex < 0) {
          this.discardedLineBytes += byteLengthUtf8(this.buffer);
          this.buffer = "";
          break;
        }
        const droppedTail = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.reportOversizedLine(
          this.discardedLineBytes + byteLengthUtf8(droppedTail),
          this.discardedLinePrefix,
        );
        this.discardedLineBytes = -1;
        this.discardedLinePrefix = "";
        continue;
      }

      if (byteLengthUtf8(this.buffer) > this.options.maxBufferBytes) {
        throw new Error(
          `[${this.options.label}] protocol overflow: buffer exceeded ${this.options.maxBufferBytes} bytes`,
        );
      }

      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex < 0) {
        if (byteLengthUtf8(this.buffer) > this.options.maxLineBytes) {
          this.requireDropMode();
          this.discardedLineBytes = byteLengthUtf8(this.buffer);
          this.discardedLinePrefix = this.buffer.slice(
            0,
            OVERSIZED_LINE_PREFIX_MAX_CHARS,
          );
          this.buffer = "";
        }
        break;
      }

      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      const lineBytes = byteLengthUtf8(line);
      if (lineBytes > this.options.maxLineBytes) {
        this.requireDropMode();
        this.reportOversizedLine(
          lineBytes,
          line.slice(0, OVERSIZED_LINE_PREFIX_MAX_CHARS),
        );
        continue;
      }
      lines.push(line);
    }

    return lines;
  }

  clear() {
    this.buffer = "";
    this.discardedLineBytes = -1;
    this.discardedLinePrefix = "";
  }

  private requireDropMode() {
    if (!this.options.onOversizedLine) {
      throw new Error(
        `[${this.options.label}] protocol overflow: line exceeded ${this.options.maxLineBytes} bytes`,
      );
    }
  }

  private reportOversizedLine(lineBytes: number, linePrefix: string) {
    this.options.onOversizedLine?.({ lineBytes, linePrefix });
  }
}
