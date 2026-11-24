/**
 * Presentation rules for the Scratch panel: how a listing is compared, which
 * preview a file gets, and when a file counts as just written.
 */
import {
  WORKSPACE_SCRATCH_DIRECTORY,
  type WorkspaceScratchFile,
  type WorkspaceScratchListing,
} from "@/lib/workspace-scratch";

/** The panel polls this often while it is open and the window is visible. */
export const SCRATCH_PANEL_POLL_MS = 1_500;

/** The rail checks for new files this often while a turn runs. */
export const SCRATCH_RAIL_POLL_MS = 5_000;

/** A file written this recently is marked new. */
export const SCRATCH_FRESH_MS = 15_000;

export type ScratchPreviewKind = "image" | "json" | "log" | "text" | "other";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico"]);
const LOG_EXTENSIONS = new Set(["log", "out", "err"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "yaml", "yml", "toml", "xml", "html", "htm",
  "diff", "patch", "ini", "sql", "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "sh", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "graphql",
]);

function extensionOf(filePath: string) {
  const name = filePath.slice(filePath.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

/** How the panel previews a file, by its extension. */
export function scratchPreviewKind(filePath: string): ScratchPreviewKind {
  const extension = extensionOf(filePath);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "json" || extension === "jsonl" || extension === "ndjson") return "json";
  if (LOG_EXTENSIONS.has(extension)) return "log";
  if (TEXT_EXTENSIONS.has(extension) || extension === "") return "text";
  return "other";
}

/** The file's path inside the scratch folder, e.g. `lens/<name>.png`. */
export function scratchDisplayName(filePath: string): string {
  const prefix = `${WORKSPACE_SCRATCH_DIRECTORY}/`;
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function isScratchFileFresh(file: Pick<WorkspaceScratchFile, "mtimeMs">, now: number) {
  return now - file.mtimeMs < SCRATCH_FRESH_MS;
}

/** Equal for two listings the panel would draw the same. */
export function scratchListingSignature(listing: WorkspaceScratchListing): string {
  return [
    listing.fileCount,
    listing.totalBytes,
    listing.truncated ? 1 : 0,
    ...listing.files.map((file) => `${file.path}\u0000${file.sizeBytes}\u0000${file.mtimeMs}`),
  ].join("\n");
}

/** JSON pretty-printed with two spaces; JSON Lines and invalid JSON stay as written. */
export function formatScratchJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
