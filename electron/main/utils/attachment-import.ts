import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Where files from outside the workspace are copied so the composer can
 * attach them. Inside `.stave/`, which Stave already keeps out of turn diffs;
 * a local `.gitignore` keeps the copies out of `git status` in any repository.
 */
export const ATTACHMENT_IMPORT_DIRECTORY = ".stave/attachments";

/** The largest file the composer copies into the workspace. */
export const ATTACHMENT_IMPORT_MAX_BYTES = 100 * 1024 * 1024;

export type AttachmentImportEntry =
  | { absolutePath: string }
  | { name: string; data: Uint8Array };

export type AttachmentImportFailure = {
  name: string;
  reason: "not-a-file" | "too-large" | "unreadable";
};

export type AttachmentImportResult = {
  /** Workspace-relative paths, in input order, without duplicates. */
  filePaths: string[];
  failures: AttachmentImportFailure[];
};

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function insideRoot(rootRealPath: string, candidateRealPath: string) {
  const relative = path.relative(rootRealPath, candidateRealPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** A file name safe to write: no directory parts, no empty or dot-only names. */
export function safeAttachmentFileName(name: string) {
  const base = path.basename(name.replaceAll("\\", "/")).replace(/[\u0000-\u001f]/g, "").trim();
  return base && base !== "." && base !== ".." ? base : "attachment";
}

async function ensureImportDirectory(rootPath: string) {
  const importRoot = path.join(rootPath, ATTACHMENT_IMPORT_DIRECTORY);
  await fs.mkdir(importRoot, { recursive: true });
  const ignorePath = path.join(importRoot, ".gitignore");
  try {
    await fs.writeFile(ignorePath, "*\n", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  // One folder per file keeps the original name and never overwrites an earlier attachment.
  const target = path.join(importRoot, randomUUID().slice(0, 8));
  await fs.mkdir(target, { recursive: true });
  return target;
}

/**
 * Turns pasted, dropped or picked files into workspace-relative paths the
 * composer can attach. A file inside the workspace keeps its own path; any
 * other file, or file bytes without a disk path, is copied into
 * `.stave/attachments/` first.
 */
export async function importAttachmentFiles(args: {
  rootPath: string;
  entries: readonly AttachmentImportEntry[];
}): Promise<AttachmentImportResult> {
  const rootPath = path.resolve(args.rootPath);
  const rootRealPath = await fs.realpath(rootPath);
  const filePaths: string[] = [];
  const failures: AttachmentImportFailure[] = [];
  const add = (absolutePath: string) => {
    const relative = toPosix(path.relative(rootPath, absolutePath));
    if (!filePaths.includes(relative)) filePaths.push(relative);
  };

  for (const entry of args.entries) {
    if ("data" in entry) {
      const name = safeAttachmentFileName(entry.name);
      if (entry.data.byteLength > ATTACHMENT_IMPORT_MAX_BYTES) {
        failures.push({ name, reason: "too-large" });
        continue;
      }
      try {
        const target = path.join(await ensureImportDirectory(rootPath), name);
        await fs.writeFile(target, entry.data);
        add(target);
      } catch {
        failures.push({ name, reason: "unreadable" });
      }
      continue;
    }

    const absolutePath = path.resolve(entry.absolutePath);
    const name = path.basename(absolutePath);
    try {
      const realPath = await fs.realpath(absolutePath);
      const stat = await fs.stat(realPath);
      if (!stat.isFile()) {
        failures.push({ name, reason: "not-a-file" });
        continue;
      }
      if (insideRoot(rootRealPath, realPath)) {
        // Keep the path the user sees when it is inside the root; fall back to the real path for symlinked roots.
        add(insideRoot(rootPath, absolutePath) ? absolutePath : path.join(rootPath, path.relative(rootRealPath, realPath)));
        continue;
      }
      if (stat.size > ATTACHMENT_IMPORT_MAX_BYTES) {
        failures.push({ name, reason: "too-large" });
        continue;
      }
      const target = path.join(await ensureImportDirectory(rootPath), safeAttachmentFileName(name));
      await fs.copyFile(realPath, target);
      add(target);
    } catch {
      failures.push({ name, reason: "unreadable" });
    }
  }

  return { filePaths, failures };
}
