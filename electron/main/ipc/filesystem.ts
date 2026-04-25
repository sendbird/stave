import { dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FilesystemCreateDirectoryArgsSchema,
  FilesystemCreateFileArgsSchema,
  FilesystemDeleteDirectoryArgsSchema,
  FilesystemDeleteFileArgsSchema,
  FilesystemDirectoryArgsSchema,
  FilesystemFileArgsSchema,
  FilesystemInspectArgsSchema,
  FilesystemPickFilesArgsSchema,
  FilesystemRepoMapArgsSchema,
  FilesystemRootArgsSchema,
  FilesystemWriteFileArgsSchema,
  OpenExternalArgsSchema,
  OpenPathArgsSchema,
} from "./schemas";
import { openExternalWithFallback } from "../utils/external-url";
import { toAsarUnpackedPath } from "../../providers/executable-path";
import {
  listDirectoryEntries,
  listFilesRecursive,
  mimeTypeFromFilePath,
  resolveRootDirectoryPath,
  resolveRootFilePath,
  revisionFromStat,
  writeFileWithExpectedRevision,
} from "../utils/filesystem";
import { getOrCreateRepoMap } from "../utils/repo-map";
import {
  buildFilesystemSearchRgArgs,
  normalizeFilesystemSearchQuery,
  parseFilesystemSearchMatchLine,
} from "./filesystem-search";
import { readWorkspaceSourceFiles } from "./filesystem-source-files";
import { readWorkspaceTypeDefinitionFiles } from "./filesystem-type-libs";

async function statIfExists(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function registerFilesystemHandlers() {
  ipcMain.handle("fs:pick-root", async () => {
    const selected = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (selected.canceled || selected.filePaths.length === 0) {
      return { ok: false, files: [], stderr: "No folder selected." };
    }
    const rootPath = selected.filePaths[0];
    if (!rootPath) {
      return { ok: false, files: [], stderr: "No folder selected." };
    }
    try {
      const files = await listFilesRecursive({ rootPath });
      return { ok: true, rootPath, rootName: path.basename(rootPath), files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:pick-files", async (_event, args: unknown) => {
    const parsed = FilesystemPickFilesArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, filePaths: [], stderr: "Invalid file picker request." };
    }
    try {
      const rootPath = path.resolve(parsed.data.rootPath);
      const rootRealPath = await fs.realpath(rootPath);
      const selected = await dialog.showOpenDialog({
        defaultPath: rootPath,
        properties: ["openFile", "multiSelections"],
      });
      if (selected.canceled || selected.filePaths.length === 0) {
        return { ok: false as const, filePaths: [], stderr: "No file selected." };
      }

      const filePaths: string[] = [];
      for (const selectedPath of selected.filePaths) {
        const absolutePath = path.resolve(selectedPath);
        const candidateRealPath = await fs.realpath(absolutePath);
        const relativeRealPath = path.relative(rootRealPath, candidateRealPath);
        if (!relativeRealPath || relativeRealPath.startsWith("..") || path.isAbsolute(relativeRealPath)) {
          continue;
        }

        const relativePath = path.relative(rootPath, absolutePath);
        if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
          continue;
        }

        filePaths.push(relativePath.replaceAll("\\", "/"));
      }

      return { ok: true as const, filePaths: [...new Set(filePaths)] };
    } catch (error) {
      return { ok: false as const, filePaths: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:resolve-path", async (_event, args: { inputPath: string }) => {
    try {
      let resolved = (args.inputPath ?? "").trim();
      if (!resolved) {
        return { ok: false, stderr: "Empty path." };
      }
      // Expand ~ to home directory.
      if (resolved === "~" || resolved.startsWith("~/")) {
        resolved = path.join(os.homedir(), resolved.slice(1));
      }
      resolved = path.resolve(resolved);
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        return { ok: false, stderr: "Path is not a directory." };
      }
      const files = await listFilesRecursive({ rootPath: resolved });
      return { ok: true, rootPath: resolved, rootName: path.basename(resolved), files };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  });

  ipcMain.handle("shell:open-external", async (_event, args: unknown) => {
    const parsed = OpenExternalArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid external URL request." };
    }
    return openExternalWithFallback({ url: parsed.data.url });
  });

  ipcMain.handle("shell:show-in-finder", async (_event, args: unknown) => {
    const parsed = OpenPathArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid path request." };
    }
    try {
      shell.showItemInFolder(parsed.data.path);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, stderr: String(error) };
    }
  });

  ipcMain.handle("shell:open-in-vscode", async (_event, args: unknown) => {
    const parsed = OpenPathArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid path request." };
    }
    return new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
      const child = spawn("code", [parsed.data.path], {
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
      });
    });
  });

  ipcMain.handle("shell:open-in-ghostty", async (_event, args: unknown) => {
    const parsed = OpenPathArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid path request." };
    }
    const targetPath = parsed.data.path;
    if (process.platform === "darwin") {
      return new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
        const child = spawn("open", ["-a", "Ghostty", targetPath], { detached: true, stdio: "ignore" });
        child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
        child.once("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      });
    }
    // Non-macOS: try launching ghostty directly
    return new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
      const child = spawn("ghostty", [], { detached: true, stdio: "ignore", cwd: targetPath });
      child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
      });
    });
  });

  ipcMain.handle("shell:open-in-terminal", async (_event, args: unknown) => {
    const parsed = OpenPathArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid path request." };
    }
    const targetPath = parsed.data.path;
    if (process.platform === "darwin") {
      // Terminal.app is always present on macOS — no fallback chain needed.
      return new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
        const child = spawn("open", ["-a", "Terminal", targetPath], { detached: true, stdio: "ignore" });
        child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
        child.once("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      });
    }
    if (process.platform === "win32") {
      return new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
        const child = spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", `cd /d "${targetPath}"`], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
        child.once("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      });
    }
    // Linux
    const launchers: Array<{ command: string; commandArgs: string[] }> = [
      { command: "xterm", commandArgs: [] },
      { command: "gnome-terminal", commandArgs: [`--working-directory=${targetPath}`] },
      { command: "xfce4-terminal", commandArgs: [`--working-directory=${targetPath}`] },
    ];
    let lastError = "Failed to open terminal.";
    for (const launcher of launchers) {
      const result = await new Promise<{ ok: boolean; stderr?: string }>((resolve) => {
        const child = spawn(launcher.command, launcher.commandArgs, { detached: true, stdio: "ignore" });
        child.once("error", (error) => resolve({ ok: false, stderr: String(error) }));
        child.once("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      });
      if (result.ok) return { ok: true as const };
      lastError = result.stderr ?? lastError;
    }
    return { ok: false as const, stderr: lastError };
  });

  ipcMain.handle("fs:list-files", async (_event, args: unknown) => {
    const parsed = FilesystemRootArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, files: [], stderr: "Invalid file listing request." };
    }
    try {
      const files = await listFilesRecursive({ rootPath: parsed.data.rootPath });
      return { ok: true, files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:get-repo-map", async (_event, args: unknown) => {
    const parsed = FilesystemRepoMapArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid repo map request." };
    }
    try {
      const result = await getOrCreateRepoMap({
        rootPath: parsed.data.rootPath,
        refresh: parsed.data.refresh,
      });
      return { ok: true, repoMap: result.repoMap, source: result.source };
    } catch (error) {
      const message = error instanceof Error
        ? `${error.message}\n${error.stack ?? ""}`
        : String(error);
      console.error("[repo-map] generation failed:", message);
      return { ok: false, stderr: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("fs:list-directory", async (_event, args: unknown) => {
    const parsed = FilesystemDirectoryArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, entries: [], stderr: "Invalid directory listing request." };
    }
    try {
      const entries = await listDirectoryEntries({
        rootPath: parsed.data.rootPath,
        directoryPath: parsed.data.directoryPath,
      });
      return { ok: true, entries };
    } catch (error) {
      return { ok: false, entries: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:create-directory", async (_event, args: unknown) => {
    const parsed = FilesystemCreateDirectoryArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid directory create request." };
    }

    const absolutePath = resolveRootDirectoryPath(parsed.data);
    if (!absolutePath) {
      return { ok: false, stderr: "Invalid directory path." };
    }

    try {
      const existingStat = await statIfExists(absolutePath);
      if (existingStat) {
        return existingStat.isDirectory()
          ? { ok: false, alreadyExists: true as const }
          : { ok: false, stderr: "A file already exists at this path." };
      }

      await fs.mkdir(absolutePath, { recursive: true });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:create-file", async (_event, args: unknown) => {
    const parsed = FilesystemCreateFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid file create request." };
    }

    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, stderr: "Invalid file path." };
    }

    try {
      const existingStat = await statIfExists(absolutePath);
      if (existingStat) {
        if (!existingStat.isFile()) {
          return { ok: false, stderr: "A folder already exists at this path." };
        }
        return {
          ok: false as const,
          alreadyExists: true as const,
          revision: revisionFromStat({ size: existingStat.size, mtimeMs: existingStat.mtimeMs }),
        };
      }

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, "", { encoding: "utf8", flag: "wx" });
      const nextStat = await fs.stat(absolutePath);
      return {
        ok: true as const,
        revision: revisionFromStat({ size: nextStat.size, mtimeMs: nextStat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false as const, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:delete-file", async (_event, args: unknown) => {
    const parsed = FilesystemDeleteFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid file delete request." };
    }

    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, stderr: "Invalid file path." };
    }

    try {
      const existingStat = await statIfExists(absolutePath);
      if (!existingStat) {
        return { ok: false as const, stderr: "File does not exist." };
      }
      if (!existingStat.isFile()) {
        return { ok: false as const, stderr: "A folder exists at this path." };
      }

      await fs.unlink(absolutePath);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:delete-directory", async (_event, args: unknown) => {
    const parsed = FilesystemDeleteDirectoryArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid directory delete request." };
    }

    const absolutePath = resolveRootDirectoryPath(parsed.data);
    const rootPath = path.resolve(parsed.data.rootPath);
    if (!absolutePath || path.resolve(absolutePath) === rootPath) {
      return { ok: false, stderr: "Invalid directory path." };
    }

    try {
      const existingStat = await statIfExists(absolutePath);
      if (!existingStat) {
        return { ok: false as const, stderr: "Folder does not exist." };
      }
      if (!existingStat.isDirectory()) {
        return { ok: false as const, stderr: "A file exists at this path." };
      }

      await fs.rm(absolutePath, { recursive: true, force: false });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-file", async (_event, args: unknown) => {
    const parsed = FilesystemFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, content: "", revision: "", stderr: "Invalid file read request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, content: "", revision: "", stderr: "Invalid file path." };
    }
    try {
      const [content, stat] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);
      return {
        ok: true,
        content,
        revision: revisionFromStat({ size: stat.size, mtimeMs: stat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false, content: "", revision: "", stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-file-data-url", async (_event, args: unknown) => {
    const parsed = FilesystemFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, dataUrl: "", revision: "", stderr: "Invalid file read request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, dataUrl: "", revision: "", stderr: "Invalid file path." };
    }
    try {
      const [buffer, stat] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);
      const mimeType = mimeTypeFromFilePath({ filePath: parsed.data.filePath });
      return {
        ok: true,
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        revision: revisionFromStat({ size: stat.size, mtimeMs: stat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false, dataUrl: "", revision: "", stderr: String(error) };
    }
  });

  ipcMain.handle("fs:write-file", async (_event, args: unknown) => {
    const parsed = FilesystemWriteFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid file write request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, stderr: "Invalid file path." };
    }
    try {
      return await writeFileWithExpectedRevision({
        filePath: absolutePath,
        content: parsed.data.content,
        expectedRevision: parsed.data.expectedRevision,
      });
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-type-defs", async (_event, args: unknown) => {
    const parsed = FilesystemInspectArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, libs: [], stderr: "Invalid type definition request." };
    }
    try {
      const libs = await readWorkspaceTypeDefinitionFiles({
        rootPath: parsed.data.rootPath,
        entryFilePath: parsed.data.entryFilePath,
      });
      return { ok: true, libs };
    } catch (error) {
      return { ok: false, libs: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-source-files", async (_event, args: unknown) => {
    const parsed = FilesystemInspectArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, files: [], stderr: "Invalid source file request." };
    }
    try {
      const files = await readWorkspaceSourceFiles({
        rootPath: parsed.data.rootPath,
        entryFilePath: parsed.data.entryFilePath,
      });
      return { ok: true, files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:search-content", async (_event, args: { rootPath: string; query: string }) => {
    const normalizedQuery = normalizeFilesystemSearchQuery(args.query ?? "");
    if (!normalizedQuery || !args.rootPath) {
      return { ok: false, results: [], stderr: "Missing query or rootPath.", limitHit: false };
    }
    const resolvedRoot = path.resolve(args.rootPath);
    try {
      await fs.access(resolvedRoot);
    } catch {
      return { ok: false, results: [], stderr: "Root path not accessible.", limitHit: false };
    }

    const MAX_MATCHES = 20_000;

    return new Promise<{
      ok: boolean;
      results: Array<{ file: string; matches: Array<{ line: number; text: string }> }>;
      limitHit: boolean;
      stderr?: string;
    }>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { rgPath: rawRgPath } = require("@vscode/ripgrep") as { rgPath: string };
      const rgPath = toAsarUnpackedPath(rawRgPath);
      const rgArgs = buildFilesystemSearchRgArgs(normalizedQuery);
      const child = spawn(rgPath, rgArgs, { cwd: resolvedRoot });

      const fileMap = new Map<string, Array<{ line: number; text: string }>>();
      let remainder = "";
      let matchCount = 0;
      let limitHit = false;
      let stderr = "";

      const parseLine = (raw: string) => {
        if (limitHit) return;
        const parsed = parseFilesystemSearchMatchLine(raw);
        if (!parsed) return;
        let entries = fileMap.get(parsed.file);
        if (!entries) {
          entries = [];
          fileMap.set(parsed.file, entries);
        }
        entries.push(parsed.match);
        matchCount += 1;
        if (matchCount >= MAX_MATCHES) {
          limitHit = true;
          child.kill("SIGTERM");
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        if (limitHit) return;
        const data = remainder + chunk.toString();
        const lines = data.split("\n");
        remainder = lines.pop() ?? "";
        for (const line of lines) {
          parseLine(line);
          if (limitHit) break;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        resolve({ ok: false, results: [], stderr: String(error), limitHit: false });
      });
      child.on("close", (code) => {
        if (remainder && !limitHit) {
          parseLine(remainder);
        }
        const results = Array.from(fileMap.entries()).map(([file, matches]) => ({ file, matches }));
        if (!limitHit && results.length === 0 && code != null && code > 1) {
          resolve({
            ok: false,
            results: [],
            stderr: stderr.trim() || "Search failed.",
            limitHit: false,
          });
          return;
        }
        resolve({ ok: true, results, limitHit });
      });
    });
  });
}
