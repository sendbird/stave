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

export class UnavailableFsAdapter implements WorkspaceFsAdapter {
  isAvailable() {
    return true;
  }

  async pickRoot(): Promise<WorkspaceRootInfo | null> {
    return null;
  }

  async listFiles(): Promise<string[]> {
    return [];
  }

  async getRepoMap(_args: { refresh?: boolean } = {}): Promise<RepoMapSnapshot | null> {
    return null;
  }

  async listDirectory(_args: { directoryPath?: string }): Promise<WorkspaceDirectoryEntry[] | null> {
    return null;
  }

  async readFile(_args: { filePath: string }): Promise<WorkspaceFileData | null> {
    return null;
  }

  async readFileDataUrl(_args: { filePath: string }): Promise<WorkspaceImageData | null> {
    return null;
  }

  async writeFile(_args: { filePath: string; content: string; expectedRevision?: string | null }): Promise<WorkspaceWriteResult> {
    return { ok: false };
  }

  async createFile(_args: { filePath: string }): Promise<WorkspaceCreateEntryResult> {
    return { ok: false, stderr: "Filesystem unavailable." };
  }

  async createDirectory(_args: { directoryPath: string }): Promise<WorkspaceCreateEntryResult> {
    return { ok: false, stderr: "Filesystem unavailable." };
  }

  async deleteFile(_args: { filePath: string }): Promise<WorkspaceDeleteEntryResult> {
    return { ok: false, stderr: "Filesystem unavailable." };
  }

  async deleteDirectory(_args: { directoryPath: string }): Promise<WorkspaceDeleteEntryResult> {
    return { ok: false, stderr: "Filesystem unavailable." };
  }

  getKnownFiles(): string[] {
    return [];
  }

  getRootPath() {
    return null;
  }
}
