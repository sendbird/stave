import { stripAnsiControlSequences } from "@/lib/workspace-scripts/ansi";
import { FilePreviewReadError, readPreviewRange, type FilePreviewReader } from "./file-preview-reader";

const LOG_PAGE_BYTES = 128 * 1024;
const BOUNDARY_LOOKAHEAD = 512;
export const LOG_SEARCH_MAX_LENGTH = 256;

type Revision = { revision: string; size: number };
export type LogPage = {
  index: number;
  previousIndex: number;
  revision: string;
  size: number;
  text: string;
  eof: boolean;
};
export type LogLocation = {
  page: LogPage;
  prefix?: string;
  highlight?: [start: number, end: number];
  matchEnd?: number;
};

async function readLogRevision(reader: FilePreviewReader, signal: AbortSignal) {
  signal.throwIfAborted();
  const { revision, size, bytes } = await readPreviewRange(reader, { offset: 0, length: 4096 });
  signal.throwIfAborted();
  // The existing text opener treats unknown extensions as text. Probe content
  // here so large binary artifacts do not appear as logs full of control bytes.
  if (bytes.includes(0)) {
    throw new FilePreviewReadError("binary");
  }
  return { revision, size };
}

function boundary(bytes: Uint8Array, offset: number) {
  if (offset >= bytes.length || bytes[offset - 1] === 10) {
    return Math.min(offset, bytes.length);
  }
  const newline = bytes.indexOf(10, offset);
  if (newline >= 0 && newline - offset < BOUNDARY_LOOKAHEAD) {
    return newline + 1;
  }
  // On a long line, keep a CSI sequence (including color changes) together
  // so the ANSI stripper on either side sees a complete escape.
  const escape = bytes.lastIndexOf(27, offset - 1);
  if (escape >= Math.max(0, offset - BOUNDARY_LOOKAHEAD) && bytes[escape + 1] === 91) {
    const limit = Math.min(bytes.length, offset + BOUNDARY_LOOKAHEAD);
    for (let cursor = escape + 2; cursor < limit; cursor += 1) {
      const byte = bytes[cursor]!;
      if (byte >= 64 || byte < 32) {
        if (cursor >= offset && byte >= 64 && byte <= 126) return cursor + 1;
        break;
      }
    }
  }
  // Keep UTF-8 characters whole when there is no nearby line break.
  const continuationLimit = Math.min(bytes.length, offset + 3);
  while (offset < continuationLimit && (bytes[offset]! & 0xc0) === 0x80) {
    offset += 1;
  }
  return offset;
}

export async function readLogPage(
  reader: FilePreviewReader,
  index: number,
  signal: AbortSignal,
  snapshot?: Revision,
  tail = false,
): Promise<LogPage> {
  const { revision, size } = snapshot ?? await readLogRevision(reader, signal);
  const offset = tail ? Math.max(0, size - LOG_PAGE_BYTES) : index * LOG_PAGE_BYTES;
  // Both sides of a cut must see the same nearby newline and escape bytes.
  const start = Math.max(0, offset - BOUNDARY_LOOKAHEAD);
  const cut = offset - start;
  signal.throwIfAborted();
  const { bytes } = await readPreviewRange(reader, {
    offset: start,
    length: cut + LOG_PAGE_BYTES + BOUNDARY_LOOKAHEAD,
    revision,
  });
  signal.throwIfAborted();
  const from = offset === 0 ? 0 : boundary(bytes, cut);
  const to = boundary(bytes, cut + LOG_PAGE_BYTES);
  // Strip terminal formatting per line to preserve physical line numbering
  // even if an OSC escape sequence in the source is incomplete.
  const text = new TextDecoder("utf-8", { ignoreBOM: offset !== 0 })
    .decode(bytes.subarray(from, to))
    .split("\n")
    .map(stripAnsiControlSequences)
    .join("\n");
  return {
    index: Math.floor(offset / LOG_PAGE_BYTES),
    previousIndex: Math.ceil(offset / LOG_PAGE_BYTES) - 1,
    revision,
    size,
    text,
    eof: start + to >= size,
  };
}

export async function readLogTail(
  reader: FilePreviewReader,
  previousRevision: string | undefined,
  signal: AbortSignal,
): Promise<LogPage | null> {
  const latest = await readLogRevision(reader, signal);
  if (latest.revision === previousRevision) {
    return null;
  }
  return readLogPage(reader, 0, signal, latest, true);
}

export async function locateLogLine(
  reader: FilePreviewReader,
  line: number,
  signal: AbortSignal,
): Promise<LogLocation> {
  let currentLine = 1;
  let atLineStart = true;
  let page = await readLogPage(reader, 0, signal);
  for (;;) {
    let start = 0;
    while (start <= page.text.length) {
      const newline = page.text.indexOf("\n", start);
      if (atLineStart && currentLine === line && (start < page.text.length || page.eof)) {
        return {
          page,
          highlight: [start, newline < 0 ? page.text.length : newline],
        };
      }
      if (newline < 0) {
        atLineStart = start === page.text.length && atLineStart;
        break;
      }
      currentLine += 1;
      atLineStart = true;
      start = newline + 1;
    }
    if (page.eof) {
      return { page, highlight: [page.text.length, page.text.length] };
    }
    page = await readLogPage(reader, page.index + 1, signal, page);
  }
}

export async function findInLog(
  reader: FilePreviewReader,
  query: string,
  signal: AbortSignal,
  previous?: LogLocation,
  snapshot?: Revision,
): Promise<LogLocation | null> {
  if (!query || query.length > LOG_SEARCH_MAX_LENGTH) {
    return null;
  }

  let page = await readLogPage(reader, previous?.page.index ?? 0, signal, previous?.page ?? snapshot);
  let from = previous?.matchEnd ?? 0;
  let prefix = "";
  for (;;) {
    const text = prefix + page.text;
    const match = text.indexOf(query, from);
    if (match >= 0) {
      const end = match + query.length;
      return { page, prefix, highlight: [match, end], matchEnd: end - prefix.length };
    }
    if (page.eof) {
      return null;
    }
    const suffixStart = Math.max(from, text.length - query.length + 1);
    prefix = text.slice(suffixStart);
    from = 0;
    page = await readLogPage(reader, page.index + 1, signal, page);
  }
}
