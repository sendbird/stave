import type {
  CodexAppServerSnapshot,
  CodexAppServerSnapshotResponse,
  CodexPluginDetailSnapshot,
  CodexThreadSnapshot,
} from "@/lib/providers/provider.types";
import { CodexSection } from "@/components/layout/settings-dialog-codex-section";
import { Toaster } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

const threads: CodexThreadSnapshot[] = ["alpha", "beta"].map((name) => ({
  id: `thread-${name}`,
  forkedFromId: null,
  preview: `${name} preview`,
  modelProvider: "codex",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  status: "idle",
  cwd: "/tmp/codex-settings-preview",
  cliVersion: "preview",
  source: "preview",
  agentNickname: null,
  agentRole: null,
  name: `${name} thread`,
  archived: false,
}));

function snapshot(label: string): CodexAppServerSnapshot {
  return {
    account: null,
    rateLimits: [],
    skills: [],
    hooks: [],
    pluginMarketplaces: [],
    plugins: ["alpha", "beta"].map((name) => ({
      id: `plugin-${name}`,
      name: `${name} plugin`,
      marketplaceName: "preview",
      marketplacePath: "/tmp/codex-settings-preview",
      marketplaceDisplayName: "Preview",
      source: "preview",
      installed: true,
      enabled: true,
      installPolicy: "default",
      authPolicy: "default",
    })),
    pluginMarketplaceLoadErrors: [],
    apps: [],
    experimentalFeatures: [],
    mcpServers: [],
    threads,
    archivedThreads: [],
    config: { config: { snapshotLabel: label }, origins: {}, layers: [] },
    configRequirements: null,
    externalAgentConfigItems: [],
  };
}

function response(label: string): CodexAppServerSnapshotResponse {
  return {
    ok: true,
    detail: `snapshot ${label}`,
    sectionErrors: label === "partial" ? { apps: "apps unavailable" } : {},
    snapshot: snapshot(label),
  };
}

const queuedResponses: Array<Promise<CodexAppServerSnapshotResponse>> = [];
const heldResponses = new Map<
  string,
  (value: CodexAppServerSnapshotResponse) => void
>();
let completedSnapshotRequests = 0;

const previewControls = {
  holdNext(label: string) {
    queuedResponses.push(
      new Promise((resolve) => {
        heldResponses.set(label, resolve);
      }),
    );
  },
  queueNext(label: string) {
    queuedResponses.push(Promise.resolve(response(label)));
  },
  release(label: string, snapshotLabel: string) {
    heldResponses.get(label)?.(response(snapshotLabel));
    heldResponses.delete(label);
  },
  getCompletedCount() {
    return completedSnapshotRequests;
  },
};

const pluginDetail = (name: string): CodexPluginDetailSnapshot => ({
  marketplaceName: "preview",
  marketplacePath: "/tmp/codex-settings-preview",
  id: `plugin-${name}`,
  name: `${name} plugin`,
  source: "preview",
  installed: true,
  enabled: true,
  installPolicy: "default",
  authPolicy: "default",
  description: `${name} detail`,
  skills: [],
  apps: [],
  mcpServers: [],
});

const previewWindow = window as typeof window & {
  __codexSettingsPreview?: typeof previewControls;
};
previewWindow.__codexSettingsPreview = previewControls;
const initialMode = new URLSearchParams(window.location.search).get(
  "codexInitial",
);
if (initialMode === "held") {
  previewControls.holdNext("initial");
} else if (initialMode === "error") {
  queuedResponses.push(
    Promise.resolve({
      ok: false,
      detail: "Preview snapshot rejected",
      sectionErrors: {},
    }),
  );
}
const unavailable = async () => ({
  ok: false,
  detail: "Preview action blocked",
});
previewWindow.api = {
  ...previewWindow.api,
  provider: {
    getCodexAppServerSnapshot: async () => {
      const result = await (queuedResponses.shift() ??
        Promise.resolve(response("initial")));
      completedSnapshotRequests += 1;
      return result;
    },
    getCodexModelCatalog: async () => ({
      ok: true,
      detail: "Preview model catalog",
      models: [],
    }),
    getCodexPluginDetail: async ({ pluginName }) => ({
      ok: true,
      detail: "Preview plugin detail",
      plugin: pluginDetail(pluginName.split(" ")[0] ?? "alpha"),
    }),
    readCodexThread: async ({ threadId }) => ({
      ok: true,
      detail: "Preview thread detail",
      thread: {
        ...threads.find((thread) => thread.id === threadId)!,
        turnCount: 2,
        raw: { threadId },
      },
    }),
    writeCodexConfigValue: async () => ({
      ok: false,
      detail: "Preview write rejected",
    }),
    batchWriteCodexConfig: async () => ({
      ok: false,
      detail: "Preview batch rejected",
    }),
    installCodexPlugin: async () => ({
      ok: false,
      detail: "Preview action blocked",
      authPolicy: null,
      appsNeedingAuth: [],
    }),
    uninstallCodexPlugin: unavailable,
    setCodexExperimentalFeatureEnablement: unavailable,
    startCodexMcpOauthLogin: unavailable,
    readCodexMcpResource: async () => ({
      ok: false,
      detail: "Preview action blocked",
      contents: [],
    }),
    renameCodexThread: unavailable,
    forkCodexThread: unavailable,
    archiveCodexThread: unavailable,
    compactCodexThread: unavailable,
    rollbackCodexThread: unavailable,
    importCodexExternalConfig: unavailable,
  },
} as typeof window.api;

useAppStore.setState({
  activeTaskId: undefined,
  projectPath: "/tmp/codex-settings-preview",
  activeWorkspaceId: "preview",
  workspacePathById: { preview: "/tmp/codex-settings-preview" },
});

export function CodexSettingsPreview() {
  return (
    <main>
      <CodexSection />
      <Toaster />
    </main>
  );
}
