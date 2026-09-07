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

/**
 * Splits a chunked text stream into newline-delimited lines with byte caps.
 *
 * Partial-line pieces are kept in a list and joined only once a newline
 * arrives, and the pending byte size is tracked incrementally. Re-measuring
 * and re-scanning the whole pending text on every chunk made a long line
 * (for example a multi-megabyte JSON-RPC notification) cost O(line² / chunk)
 * work and allocation while it streamed in.
 */
export class Utf8LineBuffer {
  /** Text after the last newline seen, as unjoined pieces. */
  private pending: string[] = [];
  private pendingBytes = 0;
  /** >= 0 while discarding an oversized line until its terminating newline. */
  private discardedLineBytes = -1;
  private discardedLinePrefix = "";

  constructor(private readonly options: Utf8LineBufferOptions) {}

  append(chunk: string | Buffer) {
    let text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines: string[] = [];

    if (this.discardedLineBytes >= 0) {
      const newlineIndex = text.indexOf("\n");
      if (newlineIndex < 0) {
        this.discardedLineBytes += byteLengthUtf8(text);
        return lines;
      }
      const droppedTail = text.slice(0, newlineIndex);
      text = text.slice(newlineIndex + 1);
      this.reportOversizedLine(
        this.discardedLineBytes + byteLengthUtf8(droppedTail),
        this.discardedLinePrefix,
      );
      this.discardedLineBytes = -1;
      this.discardedLinePrefix = "";
    }

    if (text.length === 0) {
      return lines;
    }

    const textBytes = byteLengthUtf8(text);
    if (this.pendingBytes + textBytes > this.options.maxBufferBytes) {
      throw new Error(
        `[${this.options.label}] protocol overflow: buffer exceeded ${this.options.maxBufferBytes} bytes`,
      );
    }

    const lastNewlineIndex = text.lastIndexOf("\n");
    if (lastNewlineIndex < 0) {
      this.pending.push(text);
      this.pendingBytes += textBytes;
      this.enforcePendingLineCap();
      return lines;
    }

    const complete = this.pending.join("") + text.slice(0, lastNewlineIndex);
    const remainder = text.slice(lastNewlineIndex + 1);
    this.pending = [];
    this.pendingBytes = 0;

    for (const rawLine of complete.split("\n")) {
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

    if (remainder.length > 0) {
      this.pending.push(remainder);
      this.pendingBytes = byteLengthUtf8(remainder);
      this.enforcePendingLineCap();
    }

    return lines;
  }

  clear() {
    this.pending = [];
    this.pendingBytes = 0;
    this.discardedLineBytes = -1;
    this.discardedLinePrefix = "";
  }

  /** Enter drop mode (or throw) when the unfinished line already exceeds the cap. */
  private enforcePendingLineCap() {
    if (this.pendingBytes <= this.options.maxLineBytes) {
      return;
    }
    this.requireDropMode();
    this.discardedLineBytes = this.pendingBytes;
    this.discardedLinePrefix = this.pending
      .join("")
      .slice(0, OVERSIZED_LINE_PREFIX_MAX_CHARS);
    this.pending = [];
    this.pendingBytes = 0;
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
