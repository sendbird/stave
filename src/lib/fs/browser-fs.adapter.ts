import type { RepoMapSnapshot } from "@/lib/fs/repo-map.types";
import type {
  WorkspaceCreateEntryResult,
  WorkspaceDeleteEntryResult,
  WorkspaceDirectoryEntry,
  WorkspaceFileData,
  WorkspaceFsAdapter,
  WorkspaceImageData,
  WorkspaceRootInfo,
  WorkspaceWriteResult,
} from "@/lib/fs/fs.types";

interface WindowWithPicker extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

const IGNORED_BROWSER_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
  ".nuxt",
]);

function buildRevision(args: { size: number; lastModified: number }) {
  return `browser:${args.size}:${args.lastModified}`;
}

function normalizeHandlePath(args: { value?: string; allowEmpty?: boolean }) {
  const normalized = (args.value ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    return args.allowEmpty ? "" : null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return args.allowEmpty ? "" : null;
  }
  if (parts.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return parts.join("/");
}

function isDomException(error: unknown, name: string) {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === name;
}

function toBase64(args: { bytes: Uint8Array }) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < args.bytes.length; index += chunkSize) {
    const chunk = args.bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export class BrowserFsAdapter implements WorkspaceFsAdapter {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private directoryHandleMap = new Map<string, FileSystemDirectoryHandle>();
  private fileHandleMap = new Map<string, FileSystemFileHandle>();

  isAvailable() {
    return typeof (window as WindowWithPicker).showDirectoryPicker === "function";
  }

  async pickRoot(): Promise<WorkspaceRootInfo | null> {
    const picker = (window as WindowWithPicker).showDirectoryPicker;
    if (!picker) {
      return null;
    }

    this.rootHandle = await picker();
    this.directoryHandleMap.clear();
    this.directoryHandleMap.set("", this.rootHandle);
    this.fileHandleMap.clear();
    await this.walkDirectory({
      handle: this.rootHandle,
      prefix: "",
      depth: 0,
      maxDepth: 32,
      maxFiles: 25_000,
    });

    return {
      rootName: this.rootHandle.name,
      files: this.getKnownFiles(),
    };
  }

  async listFiles(): Promise<string[]> {
    return this.getKnownFiles();
  }

  async getRepoMap(_args: { refresh?: boolean } = {}): Promise<RepoMapSnapshot | null> {
    return null;
  }

  async listDirectory(args: { directoryPath?: string }): Promise<WorkspaceDirectoryEntry[] | null> {
    const normalizedDirectoryPath = normalizeHandlePath({ value: args.directoryPath, allowEmpty: true });
    if (normalizedDirectoryPath === null) {
      return null;
    }
    const directoryHandle = await this.resolveDirectoryHandle({ directoryPath: normalizedDirectoryPath });
    if (!directoryHandle) {
      return null;
    }

    const entries: WorkspaceDirectoryEntry[] = [];
    const iterableHandle = directoryHandle as unknown as {
      entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
      values?: () => AsyncIterableIterator<FileSystemHandle>;
    };

    if (iterableHandle.entries) {
      for await (const [name, handle] of iterableHandle.entries()) {
        if (handle.kind === "directory" && isIgnoredBrowserDirectory(name)) {
          continue;
        }
        entries.push({
          name,
          path: normalizedDirectoryPath ? `${normalizedDirectoryPath}/${name}` : name,
          type: handle.kind === "directory" ? "folder" : "file",
        });
      }
    } else if (iterableHandle.values) {
      for await (const handle of iterableHandle.values()) {
        const name = handle.name;
        if (handle.kind === "directory" && isIgnoredBrowserDirectory(name)) {
          continue;
        }
        entries.push({
          name,
          path: normalizedDirectoryPath ? `${normalizedDirectoryPath}/${name}` : name,
          type: handle.kind === "directory" ? "folder" : "file",
        });
      }
    }

    return entries.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  async readFile(args: { filePath: string }): Promise<WorkspaceFileData | null> {
    const handle = this.fileHandleMap.get(args.filePath);
    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    return {
      content: await file.text(),
      revision: buildRevision({ size: file.size, lastModified: file.lastModified }),
    };
  }

  async readFileDataUrl(args: { filePath: string }): Promise<WorkspaceImageData | null> {
    const handle = this.fileHandleMap.get(args.filePath);
    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    return {
      dataUrl: `data:${mimeType};base64,${toBase64({ bytes })}`,
      revision: buildRevision({ size: file.size, lastModified: file.lastModified }),
    };
  }

  async writeFile(args: { filePath: string; content: string; expectedRevision?: string | null }): Promise<WorkspaceWriteResult> {
    const handle = this.fileHandleMap.get(args.filePath);
    if (!handle) {
      return { ok: false };
    }

    const current = await this.readFile({ filePath: args.filePath });
    if (args.expectedRevision && current && current.revision !== args.expectedRevision) {
      return { ok: false, conflict: true, revision: current.revision };
    }

    const writable = await handle.createWritable();
    await writable.write(args.content);
    await writable.close();

    const next = await this.readFile({ filePath: args.filePath });
    return {
      ok: true,
      revision: next?.revision,
    };
  }

  async createFile(args: { filePath: string }): Promise<WorkspaceCreateEntryResult> {
    const normalizedFilePath = normalizeHandlePath({ value: args.filePath });
    if (!normalizedFilePath || !this.rootHandle) {
      return { ok: false, stderr: "Invalid file path." };
    }

    const pathSegments = normalizedFilePath.split("/");
    const fileName = pathSegments[pathSegments.length - 1];
    if (!fileName) {
      return { ok: false, stderr: "Invalid file path." };
    }

    const parentPath = pathSegments.slice(0, -1).join("/");

    try {
      const parentHandle = await this.resolveDirectoryHandle({ directoryPath: parentPath, create: true });
      if (!parentHandle) {
        return { ok: false, stderr: "Failed to create parent folder." };
      }

      try {
        const existingHandle = await parentHandle.getFileHandle(fileName);
        this.fileHandleMap.set(normalizedFilePath, existingHandle);
        return { ok: false, alreadyExists: true };
      } catch (error) {
        if (isDomException(error, "TypeMismatchError")) {
          return { ok: false, stderr: "A folder already exists at this path." };
        }
        if (!isDomException(error, "NotFoundError")) {
          return { ok: false, stderr: String(error) };
        }
      }

      const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.close();
      this.fileHandleMap.set(normalizedFilePath, fileHandle);

      const next = await this.readFile({ filePath: normalizedFilePath });
      return {
        ok: true,
        revision: next?.revision,
      };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  }

  async createDirectory(args: { directoryPath: string }): Promise<WorkspaceCreateEntryResult> {
    const normalizedDirectoryPath = normalizeHandlePath({ value: args.directoryPath });
    if (!normalizedDirectoryPath || !this.rootHandle) {
      return { ok: false, stderr: "Invalid folder path." };
    }

    const pathSegments = normalizedDirectoryPath.split("/");
    const directoryName = pathSegments[pathSegments.length - 1];
    if (!directoryName) {
      return { ok: false, stderr: "Invalid folder path." };
    }

    const parentPath = pathSegments.slice(0, -1).join("/");

    try {
      const parentHandle = await this.resolveDirectoryHandle({ directoryPath: parentPath, create: true });
      if (!parentHandle) {
        return { ok: false, stderr: "Failed to create parent folder." };
      }

      try {
        const existingHandle = await parentHandle.getDirectoryHandle(directoryName);
        this.directoryHandleMap.set(normalizedDirectoryPath, existingHandle);
        return { ok: false, alreadyExists: true };
      } catch (error) {
        if (isDomException(error, "TypeMismatchError")) {
          return { ok: false, stderr: "A file already exists at this path." };
        }
        if (!isDomException(error, "NotFoundError")) {
          return { ok: false, stderr: String(error) };
        }
      }

      const directoryHandle = await parentHandle.getDirectoryHandle(directoryName, { create: true });
      this.directoryHandleMap.set(normalizedDirectoryPath, directoryHandle);
      return { ok: true };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  }

  async deleteFile(args: { filePath: string }): Promise<WorkspaceDeleteEntryResult> {
    const normalizedFilePath = normalizeHandlePath({ value: args.filePath });
    if (!normalizedFilePath || !this.rootHandle) {
      return { ok: false, stderr: "Invalid file path." };
    }

    const pathSegments = normalizedFilePath.split("/");
    const fileName = pathSegments[pathSegments.length - 1];
    if (!fileName) {
      return { ok: false, stderr: "Invalid file path." };
    }

    const parentPath = pathSegments.slice(0, -1).join("/");

    try {
      const parentHandle = await this.resolveDirectoryHandle({ directoryPath: parentPath });
      if (!parentHandle) {
        return { ok: false, stderr: "Parent folder not found." };
      }

      try {
        await parentHandle.getFileHandle(fileName);
      } catch (error) {
        if (isDomException(error, "TypeMismatchError")) {
          return { ok: false, stderr: "A folder exists at this path." };
        }
        if (isDomException(error, "NotFoundError")) {
          return { ok: false, stderr: "File not found." };
        }
        return { ok: false, stderr: String(error) };
      }

      await parentHandle.removeEntry(fileName);
      this.forgetFilePath(normalizedFilePath);
      return { ok: true };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  }

  async deleteDirectory(args: { directoryPath: string }): Promise<WorkspaceDeleteEntryResult> {
    const normalizedDirectoryPath = normalizeHandlePath({ value: args.directoryPath });
    if (!normalizedDirectoryPath || !this.rootHandle) {
      return { ok: false, stderr: "Invalid folder path." };
    }

    const pathSegments = normalizedDirectoryPath.split("/");
    const directoryName = pathSegments[pathSegments.length - 1];
    if (!directoryName) {
      return { ok: false, stderr: "Invalid folder path." };
    }

    const parentPath = pathSegments.slice(0, -1).join("/");

    try {
      const parentHandle = await this.resolveDirectoryHandle({ directoryPath: parentPath });
      if (!parentHandle) {
        return { ok: false, stderr: "Parent folder not found." };
      }

      try {
        await parentHandle.getDirectoryHandle(directoryName);
      } catch (error) {
        if (isDomException(error, "TypeMismatchError")) {
          return { ok: false, stderr: "A file exists at this path." };
        }
        if (isDomException(error, "NotFoundError")) {
          return { ok: false, stderr: "Folder not found." };
        }
        return { ok: false, stderr: String(error) };
      }

      await parentHandle.removeEntry(directoryName, { recursive: true });
      this.forgetDirectoryPath(normalizedDirectoryPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  }

  getKnownFiles(): string[] {
    return [...this.fileHandleMap.keys()].sort();
  }

  getRootPath() {
    return null;
  }

  private async resolveDirectoryHandle(args: { directoryPath?: string; create?: boolean }) {
    const normalizedDirectoryPath = normalizeHandlePath({ value: args.directoryPath, allowEmpty: true });
    if (normalizedDirectoryPath === null || !this.rootHandle) {
      return null;
    }
    if (!normalizedDirectoryPath) {
      this.directoryHandleMap.set("", this.rootHandle);
      return this.rootHandle;
    }

    const cachedHandle = this.directoryHandleMap.get(normalizedDirectoryPath);
    if (cachedHandle) {
      return cachedHandle;
    }

    let currentHandle = this.rootHandle;
    let currentPath = "";

    for (const segment of normalizedDirectoryPath.split("/")) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const cachedChild = this.directoryHandleMap.get(currentPath);
      if (cachedChild) {
        currentHandle = cachedChild;
        continue;
      }

      currentHandle = args.create
        ? await currentHandle.getDirectoryHandle(segment, { create: true })
        : await currentHandle.getDirectoryHandle(segment);

      this.directoryHandleMap.set(currentPath, currentHandle);
    }

    return currentHandle;
  }

  private async walkDirectory(args: {
    handle: FileSystemDirectoryHandle;
    prefix: string;
    depth: number;
    maxDepth: number;
    maxFiles: number;
  }) {
    if (args.depth > args.maxDepth || this.fileHandleMap.size >= args.maxFiles) {
      return;
    }

    const iterableHandle = args.handle as unknown as {
      entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
      values?: () => AsyncIterableIterator<FileSystemHandle>;
    };

    if (iterableHandle.entries) {
      for await (const [name, handle] of iterableHandle.entries()) {
        const nextPath = args.prefix ? `${args.prefix}/${name}` : name;
        if (handle.kind === "file") {
          this.fileHandleMap.set(nextPath, handle as FileSystemFileHandle);
        } else if (!isIgnoredBrowserDirectory(name)) {
          this.directoryHandleMap.set(nextPath, handle as FileSystemDirectoryHandle);
          await this.walkDirectory({
            handle: handle as FileSystemDirectoryHandle,
            prefix: nextPath,
            depth: args.depth + 1,
            maxDepth: args.maxDepth,
            maxFiles: args.maxFiles,
          });
        }
        if (this.fileHandleMap.size >= args.maxFiles) {
          break;
        }
      }
      return;
    }

    if (iterableHandle.values) {
      for await (const handle of iterableHandle.values()) {
        const name = handle.name;
        const nextPath = args.prefix ? `${args.prefix}/${name}` : name;
        if (handle.kind === "file") {
          this.fileHandleMap.set(nextPath, handle as FileSystemFileHandle);
        } else if (!isIgnoredBrowserDirectory(name)) {
          this.directoryHandleMap.set(nextPath, handle as FileSystemDirectoryHandle);
          await this.walkDirectory({
            handle: handle as FileSystemDirectoryHandle,
            prefix: nextPath,
            depth: args.depth + 1,
            maxDepth: args.maxDepth,
            maxFiles: args.maxFiles,
          });
        }
        if (this.fileHandleMap.size >= args.maxFiles) {
          break;
        }
      }
    }
  }

  private forgetFilePath(filePath: string) {
    this.fileHandleMap.delete(filePath);
  }

  private forgetDirectoryPath(directoryPath: string) {
    const directoryPrefix = `${directoryPath}/`;

    for (const filePath of [...this.fileHandleMap.keys()]) {
      if (filePath.startsWith(directoryPrefix)) {
        this.fileHandleMap.delete(filePath);
      }
    }

    for (const knownDirectoryPath of [...this.directoryHandleMap.keys()]) {
      if (knownDirectoryPath === directoryPath || knownDirectoryPath.startsWith(directoryPrefix)) {
        this.directoryHandleMap.delete(knownDirectoryPath);
      }
    }

    if (this.rootHandle) {
      this.directoryHandleMap.set("", this.rootHandle);
    }
  }
}

function isIgnoredBrowserDirectory(name: string) {
  return IGNORED_BROWSER_DIRECTORY_NAMES.has(name);
}
