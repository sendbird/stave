import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  FilesystemSearchFileResult,
  FilesystemSearchRequest,
  FilesystemSearchResponse,
} from "../../../src/lib/fs/content-search";
import { toAsarUnpackedPath } from "../../providers/executable-path";

const MAX_MATCHES = 20_000;
const MAX_MATCHES_PER_FILE = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BYTES_PER_FILE = 128 * 1024;
const MAX_BYTES_PER_MATCH = 8 * 1024;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;

const RipgrepJsonMatchSchema = z.object({
  type: z.literal("match"),
  data: z.object({ line_number: z.number().int().positive(), lines: z.object({ text: z.string() }), path: z.object({ text: z.string() }) }),
});

export function buildFilesystemSearchRgArgs(query: string) {
  const args = [
    "--json",
    "--line-number",
    "--no-heading",
    "--fixed-strings",
    "--color=never",
  ];

  if (query.includes("\n")) {
    args.push("--multiline");
  }

  args.push("--", query, ".");
  return args;
}

export function parseFilesystemSearchMatchLine(rawLine: string) {
  let event: z.infer<typeof RipgrepJsonMatchSchema>;

  try {
    const parsed = RipgrepJsonMatchSchema.safeParse(JSON.parse(rawLine));
    if (!parsed.success) return null;
    event = parsed.data;
  } catch {
    return null;
  }

  const filePath = event.data?.path?.text?.replace(/^\.[\\/]/, "");
  const lineNumber = event.data?.line_number;
  const matchText = event.data?.lines?.text
    ?.replace(/\r\n?/g, "\n")
    .replace(/\n$/, "");

  if (!filePath || !lineNumber || matchText == null) {
    return null;
  }

  return {
    file: filePath,
    match: {
      line: lineNumber,
      text: matchText,
    },
  };
}

function truncateUtf8(buffer: Buffer, maxBytes: number) {
  if (buffer.length <= maxBytes) return buffer;
  let end = maxBytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end);
}

export async function searchFilesystemContent(
  request: FilesystemSearchRequest,
  signal: AbortSignal,
  executable?: string,
): Promise<FilesystemSearchResponse> {
  const cancelled = { ok: false, cancelled: true } as const;
  const cwd = path.resolve(request.rootPath);
  try {
    await access(cwd);
  } catch {
    return signal.aborted
      ? cancelled
      : { ok: false, stderr: "Root path not accessible." };
  }
  if (signal.aborted) return cancelled;

  try {
    const rgPath = executable ?? toAsarUnpackedPath(
      (require("@vscode/ripgrep") as { rgPath: string }).rgPath,
    );
    return await new Promise<FilesystemSearchResponse>((resolve) => {
      const child = spawn(rgPath, buildFilesystemSearchRgArgs(request.query), {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stop = () => { child.kill("SIGKILL"); };
      signal.addEventListener("abort", stop, { once: true });

      const files = new Map<string, { matches: FilesystemSearchFileResult["matches"]; bytes: number }>();
      let matchCount = 0;
      let resultBytes = 0;
      let stdoutBytes = 0;
      let limitHit = false;
      let stoppedAtLimit = false;
      let stderr = Buffer.alloc(0);
      let recordParts: Buffer[] = [];
      let recordBytes = 0;
      let oversizedRecord = false;

      const stopAtLimit = () => {
        limitHit = true;
        stoppedAtLimit = true;
        stop();
      };

      const finishRecord = () => {
        // Decode whole JSON records so UTF-8 sequences can span pipe chunks.
        const parsed = oversizedRecord
          ? null
          : parseFilesystemSearchMatchLine(Buffer.concat(recordParts, recordBytes).toString("utf8"));
        recordParts = [];
        recordBytes = 0;
        oversizedRecord = false;
        if (!parsed) return;

        const file = files.get(parsed.file) ?? { matches: [], bytes: 0 };
        if (file.matches.length >= MAX_MATCHES_PER_FILE || file.bytes >= MAX_BYTES_PER_FILE) {
          limitHit = true;
          return;
        }
        const pathBytes = file.matches.length === 0 ? Buffer.byteLength(parsed.file) : 0;
        const remainingBytes = MAX_BYTES - resultBytes - pathBytes;
        if (matchCount >= MAX_MATCHES || remainingBytes <= 0) {
          stopAtLimit();
          return;
        }
        const text = Buffer.from(parsed.match.text);
        const filePreviewBudget = Math.min(
          MAX_BYTES_PER_MATCH,
          MAX_BYTES_PER_FILE - file.bytes,
        );
        const preview = truncateUtf8(text, Math.min(filePreviewBudget, remainingBytes));
        if (preview.length < text.length) limitHit = true;
        if (preview.length > 0 || text.length === 0) {
          file.matches.push({ line: parsed.match.line, text: preview.toString("utf8") });
          file.bytes += preview.length;
          resultBytes += pathBytes + preview.length;
          matchCount++;
          files.set(parsed.file, file);
        }
        if (text.length > remainingBytes && remainingBytes <= filePreviewBudget) {
          stopAtLimit();
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        if (signal.aborted || stoppedAtLimit) return;
        const length = Math.min(chunk.length, MAX_STDOUT_BYTES - stdoutBytes);
        stdoutBytes += length;
        for (let offset = 0; offset < length && !stoppedAtLimit;) {
          const newline = chunk.indexOf(0x0a, offset);
          const hasNewline = newline !== -1 && newline < length;
          const end = hasNewline ? newline : length;
          if (!oversizedRecord) {
            if (recordBytes + end - offset > MAX_RECORD_BYTES) {
              oversizedRecord = true;
              limitHit = true;
              recordParts = [];
              recordBytes = 0;
            } else {
              recordParts.push(chunk.subarray(offset, end));
              recordBytes += end - offset;
            }
          }
          if (hasNewline) finishRecord();
          offset = end + 1;
        }
        if (length < chunk.length && !stoppedAtLimit) stopAtLimit();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const remaining = MAX_STDERR_BYTES - stderr.length;
        if (remaining > 0) stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)]);
      });
      child.once("error", (error) => {
        resolve(signal.aborted ? cancelled : { ok: false, stderr: String(error) });
      });
      child.once("close", (code) => {
        signal.removeEventListener("abort", stop);
        if (signal.aborted) {
          resolve(cancelled);
          return;
        }
        if (recordBytes && !stoppedAtLimit) finishRecord();
        const results = Array.from(files, ([file, { matches }]) => ({ file, matches }));
        if (!limitHit && results.length === 0 && (code === null || code > 1)) {
          const message = new TextDecoder().decode(stderr, { stream: true }).trim();
          resolve({ ok: false, stderr: message || "Search failed." });
          return;
        }
        resolve({ ok: true, results, limitHit });
      });
    });
  } catch (error) {
    return { ok: false, stderr: String(error) };
  }
}
