import { StringDecoder } from "node:string_decoder";

export class AcpLineTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`ACP message exceeded the ${maxBytes}-byte line limit.`);
    this.name = "AcpLineTooLargeError";
  }
}

export class AcpNdjsonDecoder {
  private readonly decoder = new StringDecoder("utf8");
  private buffered = "";

  constructor(private readonly maxLineBytes: number) {}

  push(chunk: Buffer | string): string[] {
    this.buffered +=
      typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    return this.drainLines();
  }

  finish(): string[] {
    this.buffered += this.decoder.end();
    const lines = this.drainLines();
    if (this.buffered.length > 0) {
      this.assertWithinLimit(this.buffered);
      lines.push(this.buffered.replace(/\r$/, ""));
      this.buffered = "";
    }
    return lines;
  }

  private drainLines() {
    const lines: string[] = [];
    let lineBreak = this.buffered.indexOf("\n");
    while (lineBreak >= 0) {
      const line = this.buffered.slice(0, lineBreak).replace(/\r$/, "");
      this.assertWithinLimit(line);
      lines.push(line);
      this.buffered = this.buffered.slice(lineBreak + 1);
      lineBreak = this.buffered.indexOf("\n");
    }
    this.assertWithinLimit(this.buffered);
    return lines;
  }

  private assertWithinLimit(line: string) {
    if (Buffer.byteLength(line, "utf8") > this.maxLineBytes) {
      throw new AcpLineTooLargeError(this.maxLineBytes);
    }
  }
}
