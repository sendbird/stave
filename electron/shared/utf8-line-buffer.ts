import { byteLengthUtf8 } from "./bounded-text";

export interface Utf8LineBufferOptions {
  label: string;
  maxBufferBytes: number;
  maxLineBytes: number;
}

export class Utf8LineBuffer {
  private buffer = "";

  constructor(private readonly options: Utf8LineBufferOptions) {}

  append(chunk: string | Buffer) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (byteLengthUtf8(this.buffer) > this.options.maxBufferBytes) {
      throw new Error(
        `[${this.options.label}] protocol overflow: buffer exceeded ${this.options.maxBufferBytes} bytes`,
      );
    }

    const lines: string[] = [];
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (byteLengthUtf8(line) > this.options.maxLineBytes) {
        throw new Error(
          `[${this.options.label}] protocol overflow: line exceeded ${this.options.maxLineBytes} bytes`,
        );
      }
      lines.push(line);
      newlineIndex = this.buffer.indexOf("\n");
    }

    if (byteLengthUtf8(this.buffer) > this.options.maxLineBytes) {
      throw new Error(
        `[${this.options.label}] protocol overflow: line exceeded ${this.options.maxLineBytes} bytes`,
      );
    }

    return lines;
  }

  clear() {
    this.buffer = "";
  }
}
