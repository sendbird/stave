import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";

const workspaceId = "preview-pr";
const workspacePath = "/tmp/stave-project/.stave/workspaces/feature-pr";
const params = new URLSearchParams(window.location.search);
const state = useAppStore.getState();
const previewWindow = window as typeof window & { __prHarness?: unknown };

applyThemeClass({ enabled: params.get("theme") !== "light" });

// The direct preview route must never inherit executable dev-bridge methods.
// Playwright provides an explicit in-memory bridge before this module loads.
if (!previewWindow.__prHarness) {
  previewWindow.api = {
    sourceControl: {
      getPrStatus: async () => ({ ok: true, pr: null, stderr: "" }),
      getStatus: async () => ({
        ok: true,
        branch: "feature-pr",
        items: [
          { path: "src/a.ts", code: "M" },
          { path: "src/b.ts", code: "M" },
        ],
        hasConflicts: false,
        stderr: "",
      }),
    },
    provider: {},
    terminal: {},
    scripts: {},
    shell: {},
  } as typeof window.api;
}

useAppStore.setState({
  projectPath: "/tmp/stave-project",
  defaultBranch: "main",
  workspaces: [
    {
      id: workspaceId,
      name: "feature-pr",
      updatedAt: "2026-09-24T00:00:00.000Z",
    },
  ],
  activeWorkspaceId: workspaceId,
  workspaceBranchById: { [workspaceId]: "feature-pr" },
  workspacePathById: { [workspaceId]: workspacePath },
  workspaceDefaultById: { [workspaceId]: false },
  workspacePrInfoById: {},
  activeTaskId: undefined,
  tasks: [],
  activeTurnIdsByTask: {},
  settings: {
    ...state.settings,
    prePrReviewEnabled: params.get("review") === "1",
    promptPrDescription: "",
    createPrAutoMergeEnabled: false,
  },
});

export function CreatePrPreview() {
  return (
    <main data-testid="create-pr-preview">
      <TopBarOpenPR noDragStyle={{}} />
    </main>
  );
}
