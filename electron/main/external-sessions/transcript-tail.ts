import type { ExternalSessionsFs } from "./fs-port";

/** How much of a transcript's end the first read takes. */
export const TAIL_FIRST_BYTES = 2 * 1024 * 1024;
/** The most one later read takes; a bigger jump skips to the newest part. */
export const TAIL_MAX_BYTES = 8 * 1024 * 1024;
const NEWLINE = 0x0a;

/**
 * Follows an append-only JSONL file: the first read takes only the end, each
 * later read only what was appended. Only whole lines are returned; an
 * unfinished last line waits for the next read. A file that shrank (replaced
 * or truncated) is read again from its end. Never throws.
 */
export class TranscriptTail {
  /** Byte offset where the next whole line starts; -1 before the first read. */
  private offset = -1;
  private seenSize = -1;
  mtimeMs = 0;

  constructor(
    readonly file: string,
    private readonly fs: ExternalSessionsFs,
    private readonly limits: { firstBytes?: number; maxBytes?: number } = {},
  ) {}

  /** The offset the next read starts from (tests). */
  get nextOffset() {
    return this.offset;
  }

  async read(): Promise<string[]> {
    const info = await this.fs.stat(this.file);
    if (!info || info.isDirectory) return [];
    this.mtimeMs = info.mtimeMs;
    if (info.size === this.seenSize) return [];
    this.seenSize = info.size;
    const first = this.offset < 0 || info.size < this.offset;
    const limit = first
      ? (this.limits.firstBytes ?? TAIL_FIRST_BYTES)
      : (this.limits.maxBytes ?? TAIL_MAX_BYTES);
    let start = first ? 0 : this.offset;
    // Starting mid-file (first read of a big file, or a jump past the limit):
    // the first line is partial and is dropped.
    let partial = info.size - start > limit;
    if (partial) start = info.size - limit;
    const buffer = await this.fs.readRange(this.file, start, info.size - start);
    if (partial && start > 0) {
      // A line that starts exactly at the cut is whole: keep it.
      const before = await this.fs.readRange(this.file, start - 1, 1);
      if (before[0] === NEWLINE) partial = false;
    }
    const last = buffer.length > 0 ? buffer.lastIndexOf(NEWLINE) : -1;
    if (last < 0) {
      // No whole line yet: wait for it. A partial start has no line start to
      // wait at, so it moves past this oversized line; its rest, when it
      // ends, is not valid JSON and the parsers skip it.
      this.offset = partial ? info.size : start;
      return [];
    }
    this.offset = start + last + 1;
    let text = buffer.subarray(0, last + 1).toString("utf8");
    if (partial) text = text.slice(text.indexOf("\n") + 1);
    return splitLines(text);
  }
}

/** The whole lines in the first `maxBytes` of a file: where a transcript starts. */
export async function readHeadLines(fs: ExternalSessionsFs, file: string, maxBytes: number): Promise<string[]> {
  const buffer = await fs.readRange(file, 0, maxBytes);
  const last = buffer.length > 0 ? buffer.lastIndexOf(NEWLINE) : -1;
  return last > 0 ? splitLines(buffer.subarray(0, last).toString("utf8")) : [];
}

/** The whole lines in the last `maxBytes` of a file (its first, partial line dropped). */
export async function readEndLines(fs: ExternalSessionsFs, file: string, size: number, maxBytes: number): Promise<string[]> {
  const start = Math.max(0, size - maxBytes);
  const buffer = await fs.readRange(file, start, size - start);
  const last = buffer.length > 0 ? buffer.lastIndexOf(NEWLINE) : -1;
  if (last < 0) return [];
  let text = buffer.subarray(0, last + 1).toString("utf8");
  if (start > 0) text = text.slice(text.indexOf("\n") + 1);
  return splitLines(text);
}

function splitLines(text: string) {
  return text.split("\n").filter((line) => line.trim().length > 0);
}
