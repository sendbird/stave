import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReportArtifact } from "../../../src/lib/agent-runs/artifacts";
import { REPORT_FILE_ARTIFACT_MAX_BYTES, isReportFileArtifactPath } from "../../../src/lib/agent-runs/report-file-artifacts";

/**
 * Durable copies of the non-HTML files a report cites (screenshots, logs,
 * JSON, PDFs), so the report keeps working after the workspace that held
 * them is archived. HTML pages are bundled into the inline-render store
 * instead (`report-artifacts.ts`).
 *
 * `<user data>/report-files/<run key>/<content hash>/<file name>`: the run
 * key is a hash, so run ids never become path segments, and the content
 * hash folder means reporting the same file twice reuses one copy while a
 * changed file gets its own.
 *
 * Only regular files inside the reporting workspace are copied, at most
 * `REPORT_FILE_ARTIFACT_MAX_BYTES` each; anything else throws and the caller
 * keeps the original link.
 */

export const REPORT_FILE_ARCHIVE_DIRECTORY = "report-files";

/** `<user data>/report-files`, the same directory in main and the host service. */
export function resolveReportFileArchiveRoot(env: NodeJS.ProcessEnv = process.env): string {
  const userData = env.STAVE_USER_DATA_PATH?.trim();
  return path.join(userData ? path.resolve(userData) : path.join(tmpdir(), "stave-host-service"), REPORT_FILE_ARCHIVE_DIRECTORY);
}

export function reportFileArchiveRunKey(agentRunId: string) {
  return createHash("sha256").update(`stave-report-files:${agentRunId}`).digest("hex").slice(0, 16);
}

function insideFolder(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeFileName(name: string) {
  const base = path.basename(name).replace(/[\u0000-\u001f/\\]/g, "").trim();
  return base && base !== "." && base !== ".." ? base : "artifact";
}

export interface ArchivedReportFile {
  /** `file://` URL of the copy. */
  url: string;
  savedAt: string;
  /** The copy's folder when this call made it, so a failed batch can remove it; null when reused. */
  allocatedDirectory: string | null;
}

export async function archiveReportFileArtifact(args: {
  url: string;
  workspacePath: string;
  archiveRoot: string;
  agentRunId: string;
}): Promise<ArchivedReportFile> {
  const sourcePath = fileURLToPath(args.url);
  if (!isReportFileArtifactPath(sourcePath)) throw new Error("Only image, text, JSON and PDF files are copied.");
  const [workspaceRoot, resolved] = await Promise.all([fs.realpath(args.workspacePath), fs.realpath(sourcePath)]);
  if (!insideFolder(workspaceRoot, resolved)) throw new Error("The file is outside the reporting workspace.");
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error("The artifact is not a regular file.");
  if (stat.size > REPORT_FILE_ARTIFACT_MAX_BYTES) throw new Error("The file is larger than the 20 MB copy limit.");
  const bytes = await fs.readFile(resolved);
  if (bytes.byteLength > REPORT_FILE_ARTIFACT_MAX_BYTES) throw new Error("The file is larger than the 20 MB copy limit.");

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  const directory = path.join(args.archiveRoot, reportFileArchiveRunKey(args.agentRunId), hash);
  const target = path.join(directory, safeFileName(sourcePath));
  try {
    const existing = await fs.lstat(target);
    if (existing.isFile() && existing.size === bytes.byteLength) {
      return { url: pathToFileURL(target).href, savedAt: existing.mtime.toISOString(), allocatedDirectory: null };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(directory), { recursive: true });
  let created = false;
  try {
    await fs.mkdir(directory);
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    if (created) await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
  const savedAt = new Date().toISOString();
  return { url: pathToFileURL(target).href, savedAt, allocatedDirectory: created ? directory : null };
}

/**
 * One non-HTML report artifact as the report should record it: pointing at a
 * saved copy when it can be copied (or already is one), else unchanged.
 * Never throws: a file that cannot be copied keeps its original link.
 */
export async function saveReportFileLink(args: {
  artifact: ReportArtifact;
  /** Earlier artifacts of this run: a copy re-reported by its own URL keeps its provenance. */
  previousArtifacts: readonly ReportArtifact[];
  workspacePath: string | null;
  archiveRoot: string;
  agentRunId: string;
}): Promise<{ artifact: ReportArtifact; allocatedDirectory: string | null }> {
  const unchanged = { artifact: args.artifact, allocatedDirectory: null };
  let protocol: string;
  try {
    protocol = new URL(args.artifact.url).protocol;
  } catch {
    return unchanged;
  }
  if (protocol !== "file:") return unchanged;
  const previous = args.previousArtifacts.find((entry) => entry.url === args.artifact.url && entry.savedAt && entry.sourceUrl);
  if (previous && (await resolveArchivedReportFile(previous.url, args.archiveRoot))) {
    return { artifact: { ...args.artifact, sourceUrl: previous.sourceUrl, savedAt: previous.savedAt }, allocatedDirectory: null };
  }
  if (!args.workspacePath) return unchanged;
  try {
    const copy = await archiveReportFileArtifact({
      url: args.artifact.url,
      workspacePath: args.workspacePath,
      archiveRoot: args.archiveRoot,
      agentRunId: args.agentRunId,
    });
    return {
      artifact: { ...args.artifact, url: copy.url, sourceUrl: args.artifact.url, savedAt: copy.savedAt },
      allocatedDirectory: copy.allocatedDirectory,
    };
  } catch {
    return unchanged;
  }
}

/**
 * The archived copy a `file://` URL names, when it is a regular file inside
 * `archiveRoot`; null otherwise. Main opens only these.
 */
export async function resolveArchivedReportFile(url: string, archiveRoot: string): Promise<string | null> {
  let filePath: string;
  try {
    if (new URL(url).protocol !== "file:") return null;
    filePath = fileURLToPath(url);
  } catch {
    return null;
  }
  try {
    const [root, resolved] = await Promise.all([fs.realpath(archiveRoot), fs.realpath(filePath)]);
    if (!insideFolder(root, resolved)) return null;
    return (await fs.stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}
