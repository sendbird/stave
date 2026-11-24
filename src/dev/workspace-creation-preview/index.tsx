import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { WorkspaceCreationRowStatus } from "@/components/layout/WorkspaceCreationProgress";
import { WorkspacePaneHost } from "@/components/panes/WorkspacePaneHost";
import { i18n } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";

const query = new URLSearchParams(window.location.search);
const ko = query.get("lang") === "ko";
const copyFallback = query.get("copy") === "fallback";
const repositoryPath = "/tmp/stave-preview-repository";
const prompt = ko ? "변경 내용을 확인하고 테스트를 추가하세요." : "Review the changes and add a test.";
const title = ko ? "변경 검토" : "Review changes";
applyThemeClass({ enabled: query.get("theme") !== "light" });
void i18n.changeLanguage(ko ? "ko" : "en");

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const checkout = deferred();
const copy = deferred();
const setup = deferred();
let setupAttempts = 0;
window.api = {
  sourceControl: {
    createWorktree: async () => { await checkout.promise; return null; },
    seedWorktreeDependencies: async () => { await copy.promise; return { status: copyFallback ? "fallback" : "copied" }; },
  },
  terminal: {
    runCommand: async () => {
      setupAttempts++;
      await setup.promise;
      return setupAttempts === 1
        ? { ok: false, code: 1, stdout: "", stderr: "fixture: dependency install failed" }
        : { ok: true, code: 0, stdout: "", stderr: "" };
    },
  },
  persistence: {
    upsertWorkspace: async () => ({ ok: true }),
    saveRepositoryRegistry: async () => ({ ok: true }),
  },
} as typeof window.api;

useAppStore.setState({ repositoryPath, repositoryName: "Preview", defaultBranch: "main", activeWorkspaceId: "" });

function startPreview() {
  void useAppStore.getState().createWorkspace({
    name: "feature/review",
    mode: "clean",
    initCommand: copyFallback ? undefined : "bun install",
    initialTaskTitle: title,
    initialPromptDraft: { text: prompt, attachedFilePaths: [], attachments: [] },
  });
}

const showSetup = query.get("stage") === "setup";
if (showSetup) {
  checkout.release();
  copy.release();
  startPreview();
}

export function WorkspaceCreationPreview() {
  const [started, setStarted] = useState(showSetup);
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  return (
    <main className={sx(styles.preview)}>
      <nav>
        <button type="button" data-testid="preview-start" onClick={() => { setStarted(true); startPreview(); }} disabled={started}>{ko ? "만들기" : "Create"}</button>
        <button type="button" data-testid="preview-checkout" onClick={checkout.release}>{ko ? "체크아웃 완료" : "Finish checkout"}</button>
        <button type="button" data-testid="preview-copy" onClick={copy.release}>{ko ? "복사 완료" : "Finish copy"}</button>
        <button type="button" data-testid="preview-setup" onClick={setup.release}>{ko ? "설정 실행" : "Run setup"}</button>
      </nav>
      <aside data-testid="preview-workspace-row" data-workspace-id={workspaceId}>{workspaceId ? "feature/review " : null}<WorkspaceCreationRowStatus workspaceId={workspaceId} /></aside>
      {workspaceId ? <WorkspacePaneHost /> : null}
    </main>
  );
}

const styles = stylex.create({
  preview: { display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", height: "100%" },
});
