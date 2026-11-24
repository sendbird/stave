import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { RightRailPanelShell } from "@/components/layout/RightRailPanelShell";
import { WorkspaceScratchPanel } from "@/components/layout/WorkspaceScratchPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { applyThemeClass } from "@/lib/themes/apply";
import type { WorkspaceScratchFile } from "@/lib/workspace-scratch";
import { useAppStore } from "@/store/app.store";
import "@/components/aui/styles.css";
import "@/globals.css";

/**
 * The Scratch panel at right-rail width over a mocked scratch folder: a Lens
 * screenshot written just now, a test log and an API response
 * (`?empty=1` starts empty, `?theme=dark`, `?locale=ko`). `scratchFixture`
 * appends to the log and adds files so a test can watch the panel poll.
 */
const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "workspace-scratch-fixture" });

const ROOT = "/tmp/scratch-fixture-workspace";
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
let listCalls = 0;

function put(path: string, content: string, mtimeMs: number) {
  contents.set(path, content);
  const existing = files.find((file) => file.path === path);
  const sizeBytes = new TextEncoder().encode(content).length;
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

window.api = {
  fs: {
    listScratch: async ({ rootPath }: { rootPath: string }) => {
      listCalls += 1;
      if (rootPath !== ROOT) return { ok: false, stderr: "Not a known workspace folder." };
      const sorted = [...files].sort((left, right) => right.mtimeMs - left.mtimeMs);
      return {
        ok: true,
        files: sorted.map((file) => ({ ...file })),
        fileCount: sorted.length,
        totalBytes: sorted.reduce((sum, file) => sum + file.sizeBytes, 0),
        truncated: false,
      };
    },
    readFile: async ({ filePath }: { filePath: string }) => {
      const content = contents.get(filePath);
      return content === undefined
        ? { ok: false, content: "", revision: "", stderr: "missing" }
        : { ok: true, content, revision: String(content.length) };
    },
    readFileDataUrl: async () => ({ ok: true, dataUrl: screenshotDataUrl(), revision: "1" }),
  },
} as unknown as typeof window.api;

useAppStore.setState({
  activeWorkspaceId: "ws-scratch",
  repositoryPath: ROOT,
  workspacePathById: { "ws-scratch": ROOT },
});

let logLines = 80;
Object.assign(window, {
  scratchFixture: {
    appendLog: (count: number) => {
      const previous = contents.get(".stave/scratch/tests.log") ?? "";
      const added = Array.from({ length: count }, () => `ok ${++logLines} - renders row ${logLines}`).join("\n");
      put(".stave/scratch/tests.log", `${previous}\n${added}`, Date.now());
    },
    addFile: (path: string, content: string) => put(path, content, Date.now()),
    listCalls: () => listCalls,
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
  </StaveDesignProvider>,
);
