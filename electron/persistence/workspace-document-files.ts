import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  WORKSPACE_PLANS_DIRECTORY,
} from "../../src/lib/plans";
import {
  MAX_WORKSPACE_DOCUMENT_CHARS,
  MAX_WORKSPACE_DOCUMENTS_PER_SYNC,
} from "../../src/lib/documents/workspace-document-schemas";

/**
 * Main-side twin of the renderer's `readWorkspaceDocuments`: every Markdown
 * file directly inside the workspace's document directories, sorted by path.
 * Oversized, unreadable and non-regular files and missing directories are
 * skipped. Turns that run outside the renderer (Local MCP, agent runs,
 * automations) record their documents with this at turn end.
 */
export async function readWorkspaceDocumentFiles(
  rootPath: string,
): Promise<{ filePath: string; content: string }[]> {
  const directories = [WORKSPACE_PLANS_DIRECTORY, LEGACY_WORKSPACE_PLANS_DIRECTORY];
  const listings = await Promise.all(
    directories.map(async (directoryPath) => {
      const entries = await readdir(path.join(rootPath, directoryPath), {
        withFileTypes: true,
      }).catch(() => []);
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => `${directoryPath}/${entry.name}`);
    }),
  );
  const filePaths = listings
    .flat()
    .sort()
    .slice(0, MAX_WORKSPACE_DOCUMENTS_PER_SYNC);
  const files = await Promise.all(
    filePaths.map(async (filePath) => {
      const absolutePath = path.join(rootPath, filePath);
      try {
        // A UTF-8 character is at most four bytes; skip clearly oversized files unread.
        if ((await stat(absolutePath)).size > MAX_WORKSPACE_DOCUMENT_CHARS * 4) {
          return null;
        }
        const content = await readFile(absolutePath, "utf8");
        return content.length > MAX_WORKSPACE_DOCUMENT_CHARS
          ? null
          : { filePath, content };
      } catch {
        return null;
      }
    }),
  );
  return files.filter(
    (file): file is { filePath: string; content: string } => file !== null,
  );
}
