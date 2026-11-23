import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceExplorerPanel } from "@/components/layout/WorkspaceExplorerPanel";
import { applyAppLocale } from "@/i18n";
import type {
  FilesystemSearchRequest,
  FilesystemSearchResponse,
  FilesystemSearchScope,
} from "@/lib/fs/content-search";
import "@/globals.css";

const requests: FilesystemSearchRequest[] = [];
const cancellations: FilesystemSearchScope[] = [];
const pending = new Map<string, (response: FilesystemSearchResponse) => void>();
window.api = {
  fs: {
    searchContent: (args: FilesystemSearchRequest) => {
      requests.push(args);
      return new Promise<FilesystemSearchResponse>((resolve) => pending.set(args.query, resolve));
    },
    cancelContentSearch: async (args: FilesystemSearchScope) => {
      cancellations.push(args);
    },
  },
} as unknown as typeof window.api;

const root = createRoot(document.getElementById("root")!);
const createInputRef = createRef<HTMLInputElement>();
const noop = () => {};
const asyncNoop = async () => {};
function showWorkspace(workspaceId: string) {
  root.render(
    <div style={{ height: "100vh", width: 520 }}>
      <WorkspaceExplorerPanel
        workspaceId={workspaceId}
        workspaceCwd="/workspace"
        searchRequestNonce={1}
        repositoryName="Workspace"
        explorerError=""
        pendingExplorerCreate={null}
        pendingExplorerCreateInputRef={createInputRef}
        pendingExplorerCreatePath=""
        onPendingExplorerCreatePathChange={noop}
        isCreatingExplorerEntry={false}
        onStartExplorerCreate={noop}
        onCancelExplorerCreate={noop}
        onSubmitExplorerCreate={asyncNoop}
        isExplorerLoading={false}
        explorerTree={[]}
        expandedFolders={new Set()}
        onCollapseAllFolders={noop}
        onExpandAllFolders={asyncNoop}
        explorerDirectoryStateByPath={{}}
        onToggleExplorerFolder={noop}
        onOpenExplorerFile={noop}
        onStartExplorerFileCreate={noop}
        onStartExplorerFolderCreate={noop}
        onCopyExplorerRelativePath={noop}
        onCopyExplorerAbsolutePath={noop}
        onOpenExplorerInFinder={noop}
        onOpenExplorerInVSCode={noop}
        onOpenExplorerInTerminal={noop}
        onOpenExplorerInGhostty={noop}
        onRefreshExplorerDirectory={noop}
        onRequestDeleteExplorerFile={noop}
        onRequestDeleteExplorerFolder={noop}
      />
    </div>,
  );
}

export const workspaceFileSearch = {
  requests,
  cancellations,
  reply(query: string, response: FilesystemSearchResponse) {
    const resolve = pending.get(query);
    if (!resolve) throw new Error(`No pending request for ${query}`);
    pending.delete(query);
    resolve(response);
    return new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  },
  showWorkspace,
};

declare global {
  interface Window {
    workspaceFileSearch: typeof workspaceFileSearch;
  }
}

await applyAppLocale("en");
window.workspaceFileSearch = workspaceFileSearch;
showWorkspace("workspace-a");
