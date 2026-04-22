import type { RepoMapSnapshot } from "@/lib/fs/repo-map.types";

export interface WorkspaceRootInfo {
  rootName: string;
  rootPath?: string;
  files: string[];
}

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  type: "file" | "folder";
}

export interface WorkspaceFileData {
  content: string;
  revision: string;
}

export interface WorkspaceImageData {
  dataUrl: string;
  revision: string;
}

export interface WorkspaceWriteResult {
  ok: boolean;
  revision?: string;
  conflict?: boolean;
}

export interface WorkspaceCreateEntryResult {
  ok: boolean;
  revision?: string;
  alreadyExists?: boolean;
  stderr?: string;
}

export interface WorkspaceDeleteEntryResult {
  ok: boolean;
  stderr?: string;
}

export interface WorkspaceFsAdapter {
  isAvailable: () => boolean;
  pickRoot: () => Promise<WorkspaceRootInfo | null>;
  listFiles: () => Promise<string[]>;
  getRepoMap?: (args?: { refresh?: boolean }) => Promise<RepoMapSnapshot | null>;
  listDirectory: (args: { directoryPath?: string }) => Promise<WorkspaceDirectoryEntry[] | null>;
  readFile: (args: { filePath: string }) => Promise<WorkspaceFileData | null>;
  readFileDataUrl: (args: { filePath: string }) => Promise<WorkspaceImageData | null>;
  writeFile: (args: { filePath: string; content: string; expectedRevision?: string | null }) => Promise<WorkspaceWriteResult>;
  createFile: (args: { filePath: string }) => Promise<WorkspaceCreateEntryResult>;
  createDirectory: (args: { directoryPath: string }) => Promise<WorkspaceCreateEntryResult>;
  deleteFile: (args: { filePath: string }) => Promise<WorkspaceDeleteEntryResult>;
  deleteDirectory: (args: { directoryPath: string }) => Promise<WorkspaceDeleteEntryResult>;
  getKnownFiles: () => string[];
  setRoot?: (args: { rootPath: string; rootName: string; files?: string[] }) => Promise<void> | void;
  getRootPath?: () => string | null;
}
