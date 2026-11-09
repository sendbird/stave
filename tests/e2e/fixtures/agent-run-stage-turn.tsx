import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { ChatPanel } from "@/components/session/ChatPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { TooltipProvider } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { buildAgentRunFixtures } from "@/dev/agent-run-preview/agent-run-fixtures";
import { applyThemeClass } from "@/lib/themes/apply";
import {
  buildStageNudgePrompt,
  compileAgentRunStagePrompt,
} from "@/lib/agent-runs/briefing";
import { useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/globals.css";

/*
 * A run's turns as the conversation draws them: the user's first prompt, a
 * later stage's card, and the reminder to report. Each row carries the mark
 * the host writes, so the transcript resolves them from the seeded run alone.
 */
const params = new URLSearchParams(location.search);
applyAppLocale(params.get("lang") ?? "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "agent-run-stage-turn-fixture" });

const taskId = "agent-run-stage-turn";
const { workflow } = buildAgentRunFixtures(
  new Date("2026-01-03T00:00:00.000Z"),
);
const run = workflow.agentRun;
useAgentRunsStore.setState({ details: { [run.id]: workflow } });
const prompt = compileAgentRunStagePrompt({
  agentRun: run,
  stages: workflow.stages,
});
const user = (
  id: string,
  content: string,
  startedAt: string,
  agentRunPrompt: ChatMessage["agentRunPrompt"],
): ChatMessage => ({
  id,
  role: "user",
  providerId: "user",
  model: "user",
  content,
  parts: [],
  startedAt,
  agentRunPrompt,
});
const reply = (
  id: string,
  content: string,
  startedAt: string,
  completedAt: string,
): ChatMessage => ({
  id,
  role: "assistant",
  providerId: "claude-code",
  model: "claude-sonnet-4-6",
  content,
  parts: [],
  startedAt,
  completedAt,
});
const messages: ChatMessage[] = [
  user("user-first-stage", prompt, "2026-01-03T00:00:00.000Z", {
    agentRunId: run.id,
    assignment: run.assignment,
    stageIndex: 0,
    stageId: "reproduce",
    isContinuation: false,
  }),
  reply(
    "assistant-first-stage",
    "Reproduced: an empty list leaves the export rows undefined.",
    "2026-01-03T00:00:01.000Z",
    "2026-01-03T00:00:20.000Z",
  ),
  user("user-later-stage", prompt, "2026-01-03T00:01:00.000Z", {
    agentRunId: run.id,
    assignment: run.assignment,
    stageIndex: 1,
    stageId: "cause",
    isContinuation: true,
  }),
  reply(
    "assistant-later-stage",
    "The cause is the missing empty-list guard in the exporter.",
    "2026-01-03T00:01:01.000Z",
    "2026-01-03T00:01:30.000Z",
  ),
  user(
    "user-follow-up",
    buildStageNudgePrompt({ agentRun: run, stages: workflow.stages }),
    "2026-01-03T00:02:00.000Z",
    { agentRunId: run.id, assignment: null },
  ),
];
useAppStore.setState({
  activeTaskId: taskId,
  activeWorkspaceId: run.workspaceId,
  tasks: [
    {
      id: taskId,
      title: "Export fix",
      provider: "claude-code",
      updatedAt: "2026-01-03T00:02:00.000Z",
      unread: false,
      archivedAt: null,
    },
  ],
  messagesByTask: { [taskId]: messages },
});

const styles = stylex.create({
  frame: {
    height: "100vh",
    maxWidth: "60rem",
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
  },
});

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main className={sx(styles.frame)}>
      <TooltipProvider>
        <TaskScopeProvider taskId={taskId}>
          <ChatPanel />
        </TaskScopeProvider>
      </TooltipProvider>
    </main>
  </StaveDesignProvider>,
);
