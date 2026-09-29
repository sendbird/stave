import { AGENT_FILE_LOCATIONS, detectAgentFileFormat, importAgentFile, type AgentImportNote } from "./import";
import type { AgentConfig } from "./schema";

/**
 * Finds the agent files a repository already keeps for its providers and
 * reads each one into a repository agent. Read-only: files are listed and
 * read through the workspace file bridge, never written.
 *
 * The folder list comes from `AGENT_FILE_LOCATIONS`, so discovery and import
 * accept exactly the same files. A file that cannot be read is reported with
 * the reason instead of disappearing, and when two files produce the same id
 * the first one (in location order, then path order) wins and the other is
 * reported, so the list never changes with directory read order.
 */

export interface RepositoryDirectoryEntry {
  name: string;
  path: string;
  type: "file" | "folder";
}

export interface RepositoryFileAccess {
  listDirectory: (directoryPath: string) => Promise<RepositoryDirectoryEntry[] | null>;
  readFile: (filePath: string) => Promise<{ content: string } | { error: string }>;
}

export interface RepositoryAgent {
  agent: AgentConfig;
  /** Fields that were dropped, refused or changed while reading the file. */
  notes: AgentImportNote[];
}

export interface RepositoryAgentProblem {
  path: string;
  message: string;
}

export interface RepositoryAgentScan {
  agents: RepositoryAgent[];
  problems: RepositoryAgentProblem[];
}

/** Enough for any real repository; more files than this is reported, not read. */
export const MAX_REPOSITORY_AGENT_FILES = 50;
/** `.claude/agents` may be grouped in folders; the other formats are flat. */
const MAX_FOLDER_DEPTH = 3;

function folderOf(glob: string) {
  return glob.slice(0, glob.indexOf("/*"));
}

async function listAgentFiles(access: RepositoryFileAccess, folder: string, recursive: boolean, depth = 0): Promise<string[]> {
  const entries = await access.listDirectory(folder);
  if (!entries) return [];
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const files: string[] = [];
  for (const entry of sorted) {
    if (entry.type === "file") {
      files.push(entry.path);
    } else if (recursive && depth + 1 < MAX_FOLDER_DEPTH) {
      files.push(...(await listAgentFiles(access, entry.path, recursive, depth + 1)));
    }
  }
  return files;
}

export async function scanRepositoryAgents(access: RepositoryFileAccess): Promise<RepositoryAgentScan> {
  const candidates: string[] = [];
  const seenPaths = new Set<string>();
  for (const location of AGENT_FILE_LOCATIONS) {
    const files = await listAgentFiles(access, folderOf(location.glob), location.glob.includes("/**/"));
    for (const path of files) {
      // Several locations share a folder (.kiro/agents holds .json and .md); keep each file once, under its own format.
      if (seenPaths.has(path) || detectAgentFileFormat(path) !== location.format) continue;
      seenPaths.add(path);
      candidates.push(path);
    }
  }

  const problems: RepositoryAgentProblem[] = [];
  const agents: RepositoryAgent[] = [];
  const ids = new Map<string, string>();
  for (const [index, path] of candidates.entries()) {
    if (index >= MAX_REPOSITORY_AGENT_FILES) {
      problems.push({
        path,
        message: `Not read: Stave reads the first ${MAX_REPOSITORY_AGENT_FILES} agent files in a repository.`,
      });
      continue;
    }
    const read = await access.readFile(path);
    if ("error" in read) {
      problems.push({ path, message: read.error });
      continue;
    }
    const result = importAgentFile({ path, content: read.content });
    if (!result.ok) {
      problems.push({ path, message: result.message });
      continue;
    }
    const owner = ids.get(result.agent.id);
    if (owner) {
      problems.push({ path, message: `Not used: ${owner} already defines an agent with the id "${result.agent.id}".` });
      continue;
    }
    ids.set(result.agent.id, path);
    agents.push({ agent: result.agent, notes: result.notes });
  }
  return { agents, problems };
}
