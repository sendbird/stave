import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { RightRailPanelShell } from "@/components/layout/RightRailPanelShell";
import { WorkspaceScratchPanel } from "@/components/layout/WorkspaceScratchPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { Toaster } from "@/components/ui";
import { applyThemeClass } from "@/lib/themes/apply";
import {
  WORKSPACE_SCRATCH_TAIL_BYTES,
  type WorkspaceScratchChangedEvent,
  type WorkspaceScratchFile,
} from "@/lib/workspace-scratch";
import { useAppStore } from "@/store/app.store";
import "@/components/aui/styles.css";
import "@/globals.css";

/**
 * The Scratch panel at right-rail width over a mocked scratch folder: a Lens
 * screenshot written just now, a test log and an API response
 * (`?empty=1` starts empty, `?agents=1` adds two sub-agents' folders and a
 * 3 MB build log, `?watch=0` refuses the folder watch so the panel polls,
 * `?worktree=1` opens a worktree instead of the main checkout,
 * `?theme=dark`, `?locale=ko`). `scratchFixture` appends to the log and adds
 * files (sending the change notice main would send while watching) so a test
 * can watch the panel update.
 */
const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "workspace-scratch-fixture" });

const ROOT = "/tmp/scratch-fixture-workspace";
const WORKTREE = "/tmp/scratch-fixture-workspace-worktree";
const ROOT_PATH = params.get("worktree") === "1" ? WORKTREE : ROOT;
const WATCHING = params.get("watch") !== "0";
const NOW = Date.now();
/** A page-shaped screenshot stand-in, drawn once. */
function screenshotDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f4f4f5";
  context.fillRect(0, 0, 640, 400);
  context.fillStyle = "#2563eb";
  context.fillRect(0, 0, 640, 56);
  context.fillStyle = "#d4d4d8";
  for (let row = 0; row < 5; row += 1) context.fillRect(32, 88 + row * 56, 576, 36);
  return canvas.toDataURL("image/png");
}

const contents = new Map<string, string>();
const files: WorkspaceScratchFile[] = [];
const listeners = new Set<(event: WorkspaceScratchChangedEvent) => void>();
const attachCalls: unknown[] = [];
let listCalls = 0;

function notify() {
  if (!WATCHING) return;
  for (const listener of listeners) listener({ rootPath: ROOT_PATH, watching: true });
}

function put(path: string, content: string, mtimeMs: number, sizeBytes = new TextEncoder().encode(content).length) {
  contents.set(path, content);
  const existing = files.find((file) => file.path === path);
  if (existing) Object.assign(existing, { sizeBytes, mtimeMs });
  else files.push({ path, sizeBytes, mtimeMs });
}

if (params.get("empty") !== "1") {
  put(".stave/scratch/api/response.json", '{"items":[{"id":1,"name":"Ada"},{"id":2,"name":"Lin"}],"total":2}', NOW - 6 * 60_000);
  put(
    ".stave/scratch/tests.log",
    Array.from({ length: 80 }, (_, index) => `ok ${index + 1} - renders row ${index + 1}`).join("\n"),
    NOW - 2 * 60_000,
  );
  put(".stave/scratch/lens/20261124-153012-1.png", "png", NOW - 2_000);
}
if (params.get("agents") === "1") {
  put(".stave/scratch/agents/run-ui-tests-1a2b3c/playwright.log", "Running 12 tests\n  ✓ login\n  ✓ checkout\n", NOW - 30_000);
  put(".stave/scratch/agents/run-ui-tests-1a2b3c/shots/login.png", "png", NOW - 40_000);
  put(".stave/scratch/agents/review-api-9f8e7d/findings.md", "# Findings\n\n- No issues in the handler.\n", NOW - 4 * 60_000);
  // Only the end of a 3 MB log is read for the preview.
  put(
    ".stave/scratch/build.log",
    Array.from({ length: 60 }, (_, index) => `[build] step ${index + 941} of 1000 done`).join("\n"),
    NOW - 3 * 60_000,
    3 * 1024 * 1024,
  );
}

window.api = {
  fs: {
    listScratch: async ({ rootPath }: { rootPath: string }) => {
      listCalls += 1;
      if (rootPath !== ROOT_PATH) return { ok: false, stderr: "Not a known workspace folder." };
      const sorted = [...files].sort((left, right) => right.mtimeMs - left.mtimeMs);
      return {
        ok: true,
        files: sorted.map((file) => ({ ...file })),
        fileCount: sorted.length,
        totalBytes: sorted.reduce((sum, file) => sum + file.sizeBytes, 0),
        truncated: false,
      };
    },
    readScratchTail: async ({ filePath }: { filePath: string }) => {
      const content = contents.get(filePath);
      const file = files.find((entry) => entry.path === filePath);
      if (content === undefined || !file) return { ok: false, reason: "missing", stderr: "missing" };
      return { ok: true, content, sizeBytes: file.sizeBytes, truncated: file.sizeBytes > WORKSPACE_SCRATCH_TAIL_BYTES };
    },
    readFileDataUrl: async () => ({ ok: true, dataUrl: screenshotDataUrl(), revision: "1" }),
    importAttachments: async (args: { rootPath: string; entries: { absolutePath: string }[] }) => {
      attachCalls.push(args);
      const prefix = `${args.rootPath}/`;
      return {
        ok: true,
        filePaths: args.entries.map((entry) => entry.absolutePath.slice(prefix.length)),
        failures: [],
      };
    },
    scratchLive: {
      subscribe: (rootPath: string, listener: (event: WorkspaceScratchChangedEvent) => void) => {
        listeners.add(listener);
        queueMicrotask(() => listener({ rootPath, watching: WATCHING }));
        return () => listeners.delete(listener);
      },
    },
  },
} as unknown as typeof window.api;

useAppStore.setState({
  activeWorkspaceId: "ws-scratch",
  activeTaskId: "task-scratch",
  repositoryPath: ROOT,
  workspacePathById: { "ws-scratch": ROOT_PATH },
  workspaceDefaultById: { "ws-scratch": ROOT_PATH === ROOT },
});

let logLines = 80;
Object.assign(window, {
  scratchFixture: {
    appendLog: (count: number) => {
      const previous = contents.get(".stave/scratch/tests.log") ?? "";
      const added = Array.from({ length: count }, () => `ok ${++logLines} - renders row ${logLines}`).join("\n");
      put(".stave/scratch/tests.log", `${previous}\n${added}`, Date.now());
      notify();
    },
    addFile: (path: string, content: string) => {
      put(path, content, Date.now());
      notify();
    },
    listCalls: () => listCalls,
    attachCalls: () => attachCalls,
    attachedFilePaths: () => useAppStore.getState().promptDraftByTask["task-scratch"]?.attachedFilePaths ?? [],
  },
});

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main style={{ height: "100vh", display: "flex" }}>
      <div data-testid="scratch-rail-panel" style={{ width: 360, height: "100%", borderInlineStart: "1px solid var(--border)" }}>
        <RightRailPanelShell panelId="scratch">
          <WorkspaceScratchPanel visible />
        </RightRailPanelShell>
      </div>
    </main>
    <Toaster />
  </StaveDesignProvider>,
);
