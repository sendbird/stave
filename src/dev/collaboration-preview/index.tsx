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
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { buildAutoRoutingDecisionRecord } from "@/store/auto-routing";
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
  const search = new URLSearchParams(location.search);
  const inspector = search.has("inspector");
  const panelWidth = Number(search.get("panelWidth"));
  // Keep the root class in the same commit as the preview control state so the
  // top-level design provider observes one coherent palette change.
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useEffect(() => {
    const inspectorMessage = inspector
      ? {
          ...message,
          turnId: "preview-turn",
          startedAt: "2026-07-31T00:00:00.000Z",
          completedAt: "2026-07-31T00:00:08.000Z",
          usage: { inputTokens: 1200, outputTokens: 400 },
          parts: [
            ...message.parts,
            {
              type: "code_diff" as const,
              filePath: "src/Fleet.tsx",
              oldContent: "",
              newContent: "export const Fleet = true;\n",
              status: "accepted" as const,
            },
          ],
        }
      : message;
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
      messagesByTask: { [target.taskId]: [inspectorMessage] },
      ...(inspector
        ? {
            activeTurnIdsByTask: { [target.taskId]: "preview-turn" },
            providerTurnActivityByTask: {
              [target.taskId]: {
                turnId: "preview-turn",
                providerId: "codex" as const,
                startedAt: Date.now() - 12_000,
                lastEventAt: Date.now(),
                stalledAt: null,
                pendingInteraction: null,
                workGraph: createWorkGraph({
                  turnId: "preview-turn",
                  providerId: "codex",
                  startedAt: Date.now() - 12_000,
                }),
                workItemsById: {
                  "tool-1": {
                    id: "tool-1",
                    kind: "tool" as const,
                    status: "completed" as const,
                    title: "Read filedelegation.styles.ts",
                    detail:
                      "src/components/delegation/delegation.styles.ts",
                    toolName: "Read",
                    toolUseId: "tool-1",
                    progressMessages: [],
                    startedAt: Date.now() - 80_000,
                    updatedAt: Date.now() - 79_000,
                    elapsedSeconds: 1,
                  },
                  "tool-2": {
                    id: "tool-2",
                    kind: "tool" as const,
                    status: "running" as const,
                    title: "Search",
                    detail:
                      "fix__turn-activity-panel-cards--1g4ubf5/src/components/session/TurnActivity.tsx",
                    toolName: "Grep",
                    toolUseId: "tool-2",
                    progressMessages: [],
                    startedAt: Date.now() - 79_000,
                    updatedAt: Date.now(),
                    elapsedSeconds: 8,
                  },
                  "tool-3": {
                    id: "tool-3",
                    kind: "tool" as const,
                    status: "running" as const,
                    title: "Search",
                    detail:
                      "fix__turn-activity-panel-cards--1g4ubf5/src/components/auto-routing/RouteTrace.tsx",
                    toolName: "Grep",
                    toolUseId: "tool-3",
                    progressMessages: [],
                    startedAt: Date.now() - 78_000,
                    updatedAt: Date.now(),
                    elapsedSeconds: 6,
                  },
                },
                orderedWorkItemIds: ["tool-1", "tool-2", "tool-3"],
              },
            },
            autoRoutingDecisionByTask: {
              [target.taskId]: buildAutoRoutingDecisionRecord({
                resolvedAt: new Date(Date.now() - 13_000).toISOString(),
                decision: {
                  providerId: "cursor",
                  model: "auto",
                  role: "primary",
                  taskType: "implementation",
                  taskClass: "implement",
                  tier: "standard",
                  confidence: 0.82,
                  source: "heuristic",
                  rationale: "implement",
                  ruleId: "implement",
                  ruleReason: "Implementation on the default Cursor model",
                  stance: "balanced",
                  signals: {
                    taskClass: "implement",
                    complexity: "medium",
                    sensitive: false,
                    fileContextCount: 2,
                  },
                  providerChanged: false,
                  stick: false,
                },
                prompt: "Fix the turn activity panel cards",
              }),
            },
            settings: {
              ...useAppStore.getState().settings,
              turnActivityPlacement: "panel" as const,
            },
          }
        : {}),
    });
  }, [inspector]);
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
        {search.has("resultReview") ? (
          <TaskResultReviews
            workspaceId={target.workspaceId}
            taskId={target.taskId}
          />
        ) : inspector ? (
          <div
            className={sx(cp.inspectorHost)}
            style={
              Number.isFinite(panelWidth) && panelWidth > 0
                ? { width: panelWidth }
                : undefined
            }
          >
            <TurnActivityPanel />
          </div>
        ) : (
          <CollaborationPanel target={target} />
        )}
      </div>
    </main>
  );
}
