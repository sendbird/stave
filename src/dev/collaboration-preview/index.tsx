import { ChildListingProbe } from "./listing-probe";
import { TaskResultReviews } from "@/components/session/TaskResultReviews";
import { useEffect, useLayoutEffect, useState } from "react";
import { CollaborationPanel } from "@/components/collaboration/CollaborationPanel";
import { TurnActivityPanel } from "@/components/session/TurnActivityPanel";
import { ActionButton } from "@/components/system/ActionButton";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import { collaborationPreviewStyles as cp } from "./collaboration-preview.styles";
import type { ChatMessage } from "@/types/chat";
const target = {
  taskId: "preview-parent",
  workspaceId: "preview-workspace",
  projectPath: "/tmp/preview-project",
};
const message: ChatMessage = {
  id: "preview-message",
  role: "assistant",
  model: "primary",
  providerId: "codex",
  content: "",
  parts: [
    {
      type: "tool_use",
      toolUseId: "preview-worker",
      toolName: "Worker",
      workerExecution: {
        providerId: "codex",
        primaryModel: "primary",
        presetId: "verified-patch",
        workerModel: "selected-worker",
        requestedWorkerModel: "auto",
        resolvedWorkerModel: "selected-worker",
        runtimeWorkerModel: "executed-worker",
        workerModelSource: "preset",
        workerEffort: null,
      },
      input: JSON.stringify({
        task: "Check cancellation ordering and return a focused regression test.",
      }),
      output:
        "The close request must drain pending commands before the guest is released. Added a regression covering duplicate close requests.",
      state: "output-available",
      progressMessages: [
        "Inspected ownership and release ordering.",
        "Ran the targeted regression checks.",
      ],
    },
    {
      type: "tool_use",
      toolUseId: "preview-advisor",
      toolName: "stave_consult_advisor",
      input: JSON.stringify({
        question: "Does this change preserve restart behavior?",
      }),
      output: JSON.stringify({
        consult: {
          advice:
            "Preserve the durable task identity. Treat in-memory UI state as a projection, and verify recovery against the stored run before exposing controls.",
        },
      }),
      state: "output-available",
    },
  ],
};
export function CollaborationPreview() {
  return new URLSearchParams(location.search).has("listingProbe") ? (
    <ChildListingProbe />
  ) : (
    <CollaborationPreviewContent />
  );
}
function CollaborationPreviewContent() {
  const [dark, setDark] = useState(true);
  // Keep the root class in the same commit as the preview control state so the
  // top-level design provider observes one coherent palette change.
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useEffect(() => {
    useAppStore.setState({
      activeWorkspaceId: target.workspaceId,
      activeTaskId: target.taskId,
      projectPath: target.projectPath,
      tasks: [
        {
          id: target.taskId,
          title: "Preview",
          provider: "codex",
          updatedAt: new Date().toISOString(),
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: { [target.taskId]: [message] },
    });
  }, []);
  return (
    <main className={sx(cp.page)}>
      <div className={sx(cp.container)}>
        <div className={sx(cp.header)}>
          <p className={sx(cp.caption)}>
            Collaboration component preview · sample data
          </p>
          <ActionButton onClick={() => setDark(!dark)}>
            {dark ? "Light theme" : "Dark theme"}
          </ActionButton>
        </div>
        {new URLSearchParams(location.search).has("resultReview") ? (
          <TaskResultReviews
            workspaceId={target.workspaceId}
            taskId={target.taskId}
          />
        ) : new URLSearchParams(location.search).has("inspector") ? (
          <div className={sx(cp.inspectorHost)}>
            <TurnActivityPanel />
          </div>
        ) : (
          <CollaborationPanel target={target} />
        )}
      </div>
    </main>
  );
}
