/**
 * Presentation rules for the Scratch panel: how a listing is compared, which
 * preview a file gets, and when a file counts as just written.
 */
import {
  WORKSPACE_SCRATCH_AGENTS_DIRECTORY,
  WORKSPACE_SCRATCH_DIRECTORY,
  type WorkspaceScratchFile,
  type WorkspaceScratchListing,
} from "@/lib/workspace-scratch";

/**
 * While it is open and the window is visible, the panel lists the folder
 * this often when change notices are unavailable (no recursive file watching).
 */
export const SCRATCH_PANEL_POLL_MS = 1_500;

/** While the folder is watched, the panel still lists it this often in case a change notice was missed. */
export const SCRATCH_PANEL_SAFETY_POLL_MS = 15_000;

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

/** One line of the panel's list: a file on its own, or a sub-agent's folder with its files. */
export type ScratchListItem =
  | { kind: "file"; file: WorkspaceScratchFile }
  | { kind: "agent"; agentId: string; files: WorkspaceScratchFile[] };

const AGENTS_PREFIX = `${WORKSPACE_SCRATCH_DIRECTORY}/${WORKSPACE_SCRATCH_AGENTS_DIRECTORY}/`;

/** The sub-agent a file belongs to (`agents/<id>/…`), or null. */
export function scratchAgentId(filePath: string): string | null {
  if (!filePath.startsWith(AGENTS_PREFIX)) return null;
  const rest = filePath.slice(AGENTS_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash > 0 ? rest.slice(0, slash) : null;
}

/** A file's name inside its sub-agent's folder, or its scratch-relative name. */
export function scratchItemName(filePath: string): string {
  const agentId = scratchAgentId(filePath);
  return agentId ? filePath.slice(AGENTS_PREFIX.length + agentId.length + 1) : scratchDisplayName(filePath);
}

/**
 * Groups a newest-first listing: each sub-agent's files gather under one
 * group, placed where its newest file falls; other files stay single.
 */
export function groupScratchFiles(files: readonly WorkspaceScratchFile[]): ScratchListItem[] {
  const items: ScratchListItem[] = [];
  const groups = new Map<string, WorkspaceScratchFile[]>();
  for (const file of files) {
    const agentId = scratchAgentId(file.path);
    if (!agentId) {
      items.push({ kind: "file", file });
      continue;
    }
    const group = groups.get(agentId);
    if (group) {
      group.push(file);
      continue;
    }
    const created: WorkspaceScratchFile[] = [file];
    groups.set(agentId, created);
    items.push({ kind: "agent", agentId, files: created });
  }
  return items;
}

/** JSON pretty-printed with two spaces; JSON Lines and invalid JSON stay as written. */
export function formatScratchJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
