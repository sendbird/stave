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

export class ElectronFsAdapter implements WorkspaceFsAdapter {
  private rootPath: string | null = null;
  private knownFiles: string[] = [];

  isAvailable() {
    return Boolean(window.api?.fs?.pickRoot && window.api?.fs?.readFile && window.api?.fs?.writeFile);
  }

  async pickRoot(): Promise<WorkspaceRootInfo | null> {
    const picker = window.api?.fs?.pickRoot;
    if (!picker) {
      return null;
    }

    const result = await picker();
    if (!result.ok || !result.rootPath || !result.rootName) {
      return null;
    }

    this.rootPath = result.rootPath;
    this.knownFiles = result.files;
    return {
      rootName: result.rootName,
      rootPath: result.rootPath,
      files: result.files,
    };
  }

  async listFiles(): Promise<string[]> {
    if (!this.rootPath) {
      return this.knownFiles;
    }
    const listFiles = window.api?.fs?.listFiles;
    if (!listFiles) {
      return this.knownFiles;
    }

    const result = await listFiles({ rootPath: this.rootPath });
    if (!result.ok) {
      return this.knownFiles;
    }
    this.knownFiles = result.files;
    return result.files;
  }

  async getRepoMap(args: { refresh?: boolean } = {}): Promise<RepoMapSnapshot | null> {
    if (!this.rootPath) {
      return null;
    }
    const getRepoMap = window.api?.fs?.getRepoMap;
    if (!getRepoMap) {
      return null;
    }

    const result = await getRepoMap({ rootPath: this.rootPath, refresh: args.refresh });
    if (!result.ok || !result.repoMap) {
      return null;
    }
    return result.repoMap;
  }

  async listDirectory(args: { directoryPath?: string }): Promise<WorkspaceDirectoryEntry[] | null> {
    if (!this.rootPath) {
      return null;
    }
    const listDirectory = window.api?.fs?.listDirectory;
    if (!listDirectory) {
      return null;
    }

    const result = await listDirectory({
      rootPath: this.rootPath,
      directoryPath: args.directoryPath,
    });
    if (!result.ok) {
      return null;
    }
    return result.entries;
  }

  async readFile(args: { filePath: string }): Promise<WorkspaceFileData | null> {
    if (!this.rootPath) {
      return null;
    }
    const readFile = window.api?.fs?.readFile;
    if (!readFile) {
      return null;
    }

    const result = await readFile({ rootPath: this.rootPath, filePath: args.filePath });
    if (!result.ok) {
      return null;
    }

    return {
      content: result.content,
      revision: result.revision,
    };
  }

  async readFileDataUrl(args: { filePath: string }): Promise<WorkspaceImageData | null> {
    if (!this.rootPath) {
      return null;
    }
    const readFileDataUrl = window.api?.fs?.readFileDataUrl;
    if (!readFileDataUrl) {
      return null;
    }
    const result = await readFileDataUrl({ rootPath: this.rootPath, filePath: args.filePath });
    if (!result.ok) {
      return null;
    }
    return {
      dataUrl: result.dataUrl,
      revision: result.revision,
    };
  }

  async writeFile(args: { filePath: string; content: string; expectedRevision?: string | null }): Promise<WorkspaceWriteResult> {
    if (!this.rootPath) {
      return { ok: false };
    }
    const writeFile = window.api?.fs?.writeFile;
    if (!writeFile) {
      return { ok: false };
    }

    const result = await writeFile({
      rootPath: this.rootPath,
      filePath: args.filePath,
      content: args.content,
      expectedRevision: args.expectedRevision,
    });

    return {
      ok: result.ok,
      revision: result.revision,
      conflict: result.conflict,
    };
  }

  async createFile(args: { filePath: string }): Promise<WorkspaceCreateEntryResult> {
    if (!this.rootPath) {
      return { ok: false, stderr: "Workspace root unavailable." };
    }
    const createFile = window.api?.fs?.createFile;
    if (!createFile) {
      return { ok: false, stderr: "Filesystem bridge unavailable." };
    }

    const result = await createFile({
      rootPath: this.rootPath,
      filePath: args.filePath,
    });
    if (result.ok || result.alreadyExists) {
      this.rememberKnownFile(args.filePath);
    }
    return {
      ok: result.ok,
      revision: result.revision,
      alreadyExists: result.alreadyExists,
      stderr: result.stderr,
    };
  }

  async createDirectory(args: { directoryPath: string }): Promise<WorkspaceCreateEntryResult> {
    if (!this.rootPath) {
      return { ok: false, stderr: "Workspace root unavailable." };
    }
    const createDirectory = window.api?.fs?.createDirectory;
    if (!createDirectory) {
      return { ok: false, stderr: "Filesystem bridge unavailable." };
    }

    const result = await createDirectory({
      rootPath: this.rootPath,
      directoryPath: args.directoryPath,
    });
    return {
      ok: result.ok,
      alreadyExists: result.alreadyExists,
      stderr: result.stderr,
    };
  }

  async deleteFile(args: { filePath: string }): Promise<WorkspaceDeleteEntryResult> {
    if (!this.rootPath) {
      return { ok: false, stderr: "Workspace root unavailable." };
    }
    const deleteFile = window.api?.fs?.deleteFile;
    if (!deleteFile) {
      return { ok: false, stderr: "Filesystem bridge unavailable." };
    }

    const result = await deleteFile({
      rootPath: this.rootPath,
      filePath: args.filePath,
    });
    if (result.ok) {
      this.forgetKnownFile(args.filePath);
    }
    return {
      ok: result.ok,
      stderr: result.stderr,
    };
  }

  async deleteDirectory(args: { directoryPath: string }): Promise<WorkspaceDeleteEntryResult> {
    if (!this.rootPath) {
      return { ok: false, stderr: "Workspace root unavailable." };
    }
    const deleteDirectory = window.api?.fs?.deleteDirectory;
    if (!deleteDirectory) {
      return { ok: false, stderr: "Filesystem bridge unavailable." };
    }

    const result = await deleteDirectory({
      rootPath: this.rootPath,
      directoryPath: args.directoryPath,
    });
    if (result.ok) {
      this.forgetKnownDirectory(args.directoryPath);
    }
    return {
      ok: result.ok,
      stderr: result.stderr,
    };
  }

  getKnownFiles(): string[] {
    return this.knownFiles;
  }

  setRoot(args: { rootPath: string; rootName: string; files?: string[] }) {
    this.rootPath = args.rootPath;
    this.knownFiles = args.files ?? this.knownFiles;
  }

  getRootPath() {
    return this.rootPath;
  }

  private rememberKnownFile(filePath: string) {
    if (this.knownFiles.includes(filePath)) {
      return;
    }
    this.knownFiles = [...this.knownFiles, filePath].sort();
  }

  private forgetKnownFile(filePath: string) {
    this.knownFiles = this.knownFiles.filter((knownFilePath) => knownFilePath !== filePath);
  }

  private forgetKnownDirectory(directoryPath: string) {
    const normalizedDirectoryPath = directoryPath.replace(/\/+$/, "");
    const directoryPrefix = `${normalizedDirectoryPath}/`;
    this.knownFiles = this.knownFiles.filter((knownFilePath) => !knownFilePath.startsWith(directoryPrefix));
  }
}
