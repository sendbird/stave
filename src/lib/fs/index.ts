import { ElectronFsAdapter } from "@/lib/fs/electron-fs.adapter";
import { BrowserFsAdapter } from "@/lib/fs/browser-fs.adapter";
import { UnavailableFsAdapter } from "@/lib/fs/unavailable-fs.adapter";
import type { WorkspaceFsAdapter } from "@/lib/fs/fs.types";

class DynamicWorkspaceFsAdapter implements WorkspaceFsAdapter {
  private readonly electronAdapter = new ElectronFsAdapter();
  private readonly browserAdapter = new BrowserFsAdapter();
  private readonly unavailableAdapter = new UnavailableFsAdapter();
  private delegate: WorkspaceFsAdapter = this.unavailableAdapter;
  private rootState: {
    rootPath: string | null;
    rootName: string;
    files: string[];
  } = {
    rootPath: null,
    rootName: "project",
    files: [],
  };

  isAvailable() {
    return this.electronAdapter.isAvailable() || this.browserAdapter.isAvailable();
  }

  async pickRoot() {
    const delegate = this.resolveDelegate();
    const root = await delegate.pickRoot();
    if (!root) {
      return null;
    }

    this.rootState = {
      rootPath: root.rootPath ?? null,
      rootName: root.rootName,
      files: root.files,
    };
    return root;
  }

  async listFiles() {
    const delegate = await this.prepareDelegate();
    const files = await delegate.listFiles();
    if (files.length > 0) {
      this.rootState.files = files;
    }
    return files;
  }

  async getRepoMap(args: { refresh?: boolean } = {}) {
    const delegate = await this.prepareDelegate();
    return delegate.getRepoMap?.(args) ?? null;
  }

  async listDirectory(args: Parameters<WorkspaceFsAdapter["listDirectory"]>[0]) {
    const delegate = await this.prepareDelegate();
    return delegate.listDirectory(args);
  }

  async readFile(args: Parameters<WorkspaceFsAdapter["readFile"]>[0]) {
    const delegate = await this.prepareDelegate();
    return delegate.readFile(args);
  }

  async readFileDataUrl(args: Parameters<WorkspaceFsAdapter["readFileDataUrl"]>[0]) {
    const delegate = await this.prepareDelegate();
    return delegate.readFileDataUrl(args);
  }

  async writeFile(args: Parameters<WorkspaceFsAdapter["writeFile"]>[0]) {
    const delegate = await this.prepareDelegate();
    return delegate.writeFile(args);
  }

  async createFile(args: Parameters<WorkspaceFsAdapter["createFile"]>[0]) {
    const delegate = await this.prepareDelegate();
    const result = await delegate.createFile(args);
    if (result.ok || result.alreadyExists) {
      this.rootState.files = delegate.getKnownFiles();
    }
    return result;
  }

  async createDirectory(args: Parameters<WorkspaceFsAdapter["createDirectory"]>[0]) {
    const delegate = await this.prepareDelegate();
    return delegate.createDirectory(args);
  }

  async deleteFile(args: Parameters<WorkspaceFsAdapter["deleteFile"]>[0]) {
    const delegate = await this.prepareDelegate();
    const result = await delegate.deleteFile(args);
    if (result.ok) {
      this.rootState.files = delegate.getKnownFiles();
    }
    return result;
  }

  async deleteDirectory(args: Parameters<WorkspaceFsAdapter["deleteDirectory"]>[0]) {
    const delegate = await this.prepareDelegate();
    const result = await delegate.deleteDirectory(args);
    if (result.ok) {
      this.rootState.files = delegate.getKnownFiles();
    }
    return result;
  }

  getKnownFiles() {
    const delegateFiles = this.resolveDelegate().getKnownFiles();
    return delegateFiles.length > 0 ? delegateFiles : this.rootState.files;
  }

  async setRoot(args: { rootPath: string; rootName: string; files?: string[] }) {
    this.rootState = {
      rootPath: args.rootPath,
      rootName: args.rootName,
      files: args.files ?? this.rootState.files,
    };
    const delegate = this.resolveDelegate();
    if (delegate.setRoot) {
      await delegate.setRoot(args);
    }
  }

  getRootPath() {
    return this.resolveDelegate().getRootPath?.() ?? this.rootState.rootPath;
  }

  private resolveDelegate() {
    const nextDelegate: WorkspaceFsAdapter = this.electronAdapter.isAvailable()
      ? this.electronAdapter
      : this.browserAdapter.isAvailable()
      ? this.browserAdapter
      : this.unavailableAdapter;

    this.delegate = nextDelegate;
    return nextDelegate;
  }

  private async prepareDelegate() {
    const delegate = this.resolveDelegate();
    const rootPath = this.rootState.rootPath;
    if (rootPath && delegate.setRoot && delegate.getRootPath?.() !== rootPath) {
      await delegate.setRoot({
        rootPath,
        rootName: this.rootState.rootName,
        files: this.rootState.files,
      });
    }
    return delegate;
  }
}

export const workspaceFsAdapter = new DynamicWorkspaceFsAdapter();
