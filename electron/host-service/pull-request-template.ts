import { open, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The pull request template a generated PR description follows, found where
 * GitHub looks for one. GitHub matches the file name case-insensitively in the
 * repository root, `.github/` and `docs/`; a repository with several templates
 * keeps them in a `PULL_REQUEST_TEMPLATE/` folder in one of those places.
 *
 * A single-file template wins, searched `.github/`, root, then `docs/`. With
 * only a folder of templates, the first Markdown file by name is used, so the
 * description still follows the repository's shape. Undefined when there is
 * none or none can be read.
 *
 * Used by: `electron/host-service.ts` (PR draft context).
 */
const TEMPLATE_DIRECTORIES = [".github", "", "docs"] as const;
const TEMPLATE_FILE = "pull_request_template.md";
const TEMPLATE_FOLDER = "pull_request_template";
/** A template is a short document; a larger match is not one. */
const MAX_TEMPLATE_BYTES = 64 * 1024;

async function listEntries(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Reads at most one byte past the limit, so an oversized file (or one that
 * grows while it is read) is never loaded whole.
 */
async function readTemplate(file: string) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(file, "r");
    const buffer = Buffer.alloc(MAX_TEMPLATE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead <= MAX_TEMPLATE_BYTES ? buffer.toString("utf8", 0, bytesRead).trim() || undefined : undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function readPullRequestTemplate(cwd: string): Promise<string | undefined> {
  const listed = await Promise.all(
    TEMPLATE_DIRECTORIES.map(async (directory) => ({
      directory: path.join(cwd, directory),
      entries: await listEntries(path.join(cwd, directory)),
    })),
  );
  for (const { directory, entries } of listed) {
    const file = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === TEMPLATE_FILE);
    const content = file ? await readTemplate(path.join(directory, file.name)) : undefined;
    if (content) return content;
  }
  for (const { directory, entries } of listed) {
    const folder = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === TEMPLATE_FOLDER);
    if (!folder) continue;
    const templates = (await listEntries(path.join(directory, folder.name)))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const name of templates) {
      const content = await readTemplate(path.join(directory, folder.name, name));
      if (content) return content;
    }
  }
  return undefined;
}
