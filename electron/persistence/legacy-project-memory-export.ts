// temporary-migration: project-memory-export
/**
 * One-time export of what retired projects remembered.
 *
 * Projects (a coordinator task that started agent runs toward a goal) were
 * removed. Their accepted decisions and notes lived only in the
 * `project_memories` SQLite table, which nothing reads any more. So a user
 * does not lose them, the host writes one markdown file per project to
 * `<user data>/exports/project-memory/<project id>.md` on start.
 *
 * Idempotent: a file that already exists is never rewritten, and a database
 * without the table (or without rows) writes nothing. The tables themselves
 * are left untouched.
 *
 * Used by: `electron/host-service.ts`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

interface ExportStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

/** The part of a SQLite connection the export reads with. */
export interface LegacyProjectMemoryDatabase {
  prepare: (sql: string) => ExportStatement;
}

interface MemoryRow {
  id: string;
  project_id: string;
  status: string;
  body_json: string;
  created_at: string;
}

interface ExportedMemory {
  kind: string | null;
  content: string;
  accepted: boolean;
  createdAt: string | null;
}

interface ExportedProject {
  id: string;
  name: string | null;
  goal: string | null;
  repositoryPath: string | null;
}

export function legacyProjectMemoryExportDir(userDataPath: string) {
  return path.join(userDataPath, "exports", "project-memory");
}

function tableExists(database: LegacyProjectMemoryDatabase, table: string) {
  return Boolean(
    database.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readProject(database: LegacyProjectMemoryDatabase, projectId: string, hasProjects: boolean): ExportedProject {
  const row = hasProjects
    ? (database.prepare("SELECT body_json FROM projects WHERE id = ?").get(projectId) as { body_json: string } | undefined)
    : undefined;
  const body = row ? parseObject(row.body_json) : {};
  return {
    id: projectId,
    name: text(body.name),
    goal: text(body.goal),
    repositoryPath: text(body.repositoryPath),
  };
}

function readMemory(row: MemoryRow): ExportedMemory | null {
  const body = parseObject(row.body_json);
  const content = text(body.content);
  if (!content) return null;
  return {
    kind: text(body.kind),
    content,
    accepted: (text(body.status) ?? row.status) === "accepted",
    createdAt: text(body.createdAt) ?? text(row.created_at),
  };
}

/** A file name that cannot leave the export folder. */
function fileNameFor(projectId: string) {
  const safe = projectId.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return `${safe || "project"}.md`;
}

function bullet(memory: ExportedMemory) {
  const meta = [memory.kind, memory.createdAt?.slice(0, 10)].filter(Boolean).join(", ");
  const [first = "", ...rest] = memory.content.split(/\r?\n/);
  const lines = [`- ${meta ? `(${meta}) ` : ""}${first}`, ...rest.map((line) => (line ? `  ${line}` : ""))];
  return lines.join("\n");
}

export function renderLegacyProjectMemoryMarkdown(project: ExportedProject, memories: readonly ExportedMemory[]) {
  const accepted = memories.filter((memory) => memory.accepted);
  const candidates = memories.filter((memory) => !memory.accepted);
  const lines = [
    `# ${project.name ?? `Project ${project.id}`}`,
    "",
    "Stave no longer has projects. These are the decisions and notes this project recorded, exported so they are not lost.",
    "",
  ];
  if (project.goal) lines.push(`- Goal: ${project.goal.replace(/\s*\r?\n\s*/g, " ")}`);
  if (project.repositoryPath) lines.push(`- Repository: ${project.repositoryPath}`);
  lines.push(`- Project id: ${project.id}`, "");
  lines.push("## Accepted", "", ...(accepted.length ? accepted.map(bullet) : ["None."]), "");
  if (candidates.length) {
    lines.push("## Candidates (never accepted)", "", ...candidates.map(bullet), "");
  }
  return lines.join("\n");
}

/**
 * Writes one markdown file per project that has memories, skipping a file that
 * already exists. Returns the files it wrote.
 */
export function exportLegacyProjectMemories(args: {
  database: LegacyProjectMemoryDatabase;
  exportDir: string;
  log?: (message: string) => void;
}): { written: string[] } {
  const { database } = args;
  if (!tableExists(database, "project_memories")) return { written: [] };
  const rows = database
    .prepare("SELECT id, project_id, status, body_json, created_at FROM project_memories ORDER BY project_id, created_at ASC, id ASC")
    .all() as MemoryRow[];
  if (rows.length === 0) return { written: [] };

  const byProject = new Map<string, ExportedMemory[]>();
  for (const row of rows) {
    const memory = readMemory(row);
    if (!memory) continue;
    const list = byProject.get(row.project_id) ?? [];
    list.push(memory);
    byProject.set(row.project_id, list);
  }

  const hasProjects = tableExists(database, "projects");
  const written: string[] = [];
  for (const [projectId, memories] of byProject) {
    const filePath = path.join(args.exportDir, fileNameFor(projectId));
    if (existsSync(filePath)) continue;
    mkdirSync(args.exportDir, { recursive: true });
    const markdown = renderLegacyProjectMemoryMarkdown(readProject(database, projectId, hasProjects), memories);
    try {
      // `wx` refuses to overwrite a file another start wrote in the meantime.
      writeFileSync(filePath, markdown, { encoding: "utf8", flag: "wx" });
      written.push(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  if (written.length > 0) {
    args.log?.(
      `[projects] exported the memories of ${written.length} retired project${written.length === 1 ? "" : "s"} to ${args.exportDir}`,
    );
  }
  return { written };
}

/** Opens the host's database read-only and runs the export. Never throws. */
export function runLegacyProjectMemoryExport(args: { userDataPath: string; log?: (message: string) => void }) {
  const dbPath = path.join(args.userDataPath, "stave.sqlite");
  if (!existsSync(dbPath)) return { written: [] };
  let database: Database.Database | null = null;
  try {
    database = new Database(dbPath, { readonly: true, fileMustExist: true });
    return exportLegacyProjectMemories({
      database,
      exportDir: legacyProjectMemoryExportDir(args.userDataPath),
      log: args.log,
    });
  } catch (error) {
    console.warn("[projects] could not export the memories of retired projects", error);
    return { written: [] };
  } finally {
    database?.close();
  }
}
// end temporary-migration: project-memory-export
