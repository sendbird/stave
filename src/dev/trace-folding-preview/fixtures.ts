import type { I18nKey } from "@/i18n";
import type { MessagePart, TextPart, ToolUsePart } from "@/types/chat";

export type TracePreviewMessage = {
  role: "assistant";
  content: string;
  parts: MessagePart[];
  isStreaming: boolean;
  startedAt: string;
  completedAt?: string;
};

type TraceScenario = {
  id: string;
  title: Extract<I18nKey, `session:traceFoldingPreview.${string}Scenario`>;
  message: TracePreviewMessage;
};

function scenario(
  id: string,
  title: TraceScenario["title"],
  isStreaming: boolean,
  parts: MessagePart[],
): TraceScenario {
  const now = Date.now();
  return {
    id, title, message: {
      role: "assistant", content: "", parts, isStreaming,
      startedAt: new Date(now - 42_000).toISOString(),
      completedAt: isStreaming ? undefined : new Date(now).toISOString(),
    },
  };
}

function text(text: string): TextPart {
  return { type: "text", text };
}

// The text and tool payloads deliberately stand in for provider output.
const inspectedFiles = [
  "package.json",
  "src/main.tsx",
  "src/components/session/ChatPanel.tsx",
  "src/components/session/message/assistant-trace.tsx",
  "src/components/session/message/assistant-trace-builder.ts",
  "src/components/session/message/trace-activity.ts",
  "src/components/session/message/trace-summary.ts",
  "src/components/session/message/turn-event-rows.tsx",
  "src/components/session/message/turn-event-tool-runs.tsx",
  "src/components/ai-elements/chain-of-thought.tsx",
  "src/components/aui/components/StepRail.tsx",
  "src/components/aui/components/ToolRun.tsx",
  "src/components/aui/recipes/inline-disclosure.ts",
  "src/components/aui/recipes/agent-surface.ts",
  "src/components/aui/tokens/tokens.stylex.ts",
  "src/components/system/StaveDesignProvider.tsx",
  "src/lib/session/assistant-response-parts.ts",
  "src/lib/themes/apply.ts",
  "src/i18n/format.ts",
  "src/locales/en/session.json",
  "src/locales/ko/session.json",
  "tests/trace-summary.test.ts",
  "tests/e2e/trace-row-alignment.e2e.ts",
  "docs/developer/design-system.md",
];

const reads: ToolUsePart[] = inspectedFiles.map((file, index) => ({
  type: "tool_use",
  toolUseId: `read-${index}`,
  toolName: "Read",
  input: JSON.stringify({ file_path: file }),
  state: "output-available",
  elapsedSeconds: 0.5,
  output: `Read ${file}`,
}));

function command(
  toolUseId: string,
  command: string,
  state: ToolUsePart["state"],
): ToolUsePart {
  return { type: "tool_use", toolUseId, toolName: "Bash", input: JSON.stringify({ command }), state };
}

const failedCheck: ToolUsePart = {
  ...command("layout-check", "bun run test:ui-layout", "output-error"),
  elapsedSeconds: 4,
  exitCode: 1,
  output: "Assertion failed: the trace row overflows at 390px.",
};

const reviewAgent: ToolUsePart = {
  type: "tool_use",
  toolUseId: "review-agent",
  toolName: "Task",
  input: JSON.stringify({ description: "Review keyboard navigation", subagent_type: "Explore" }),
  state: "output-available",
  elapsedSeconds: 8,
  output: "The trace trigger and tool rows can be reached with Tab.",
};

const testAgent: ToolUsePart = {
  type: "tool_use",
  toolUseId: "test-agent",
  toolName: "Task",
  input: JSON.stringify({ description: "Check narrow layouts", subagent_type: "Explore" }),
  state: "input-available",
  progressMessages: ["Checking the 390px layout."],
};

export const traceScenarios: TraceScenario[] = [
  scenario("running", "session:traceFoldingPreview.runningScenario", true, [
    text("I’ll trace how tool results become rows in the conversation."),
    ...reads,
    text("I’ve located the trace renderer. I’ll check how the timeline behaves at narrow widths before changing the layout."),
    command("narrow-check", "bun run test:ui-layout", "input-available"),
  ]),
  scenario("running-with-failure", "session:traceFoldingPreview.runningFailureScenario", true, [
    ...reads.slice(0, 4),
    failedCheck,
    text("The narrow-width check failed. I’ll isolate the trace row and rerun that case."),
    command("retry", "bun test tests/trace-summary.test.ts", "input-available"),
  ]),
  scenario("finished", "session:traceFoldingPreview.finishedScenario", false, [
    text("I’ll compare the trace row spacing in both themes."),
    ...reads.slice(0, 4),
    text("The trace rows align in both themes. Long tool names wrap without clipping the controls."),
  ]),
  scenario("finished-with-failure", "session:traceFoldingPreview.finishedFailureScenario", false, [
    text("I’ll run the layout checks to verify the narrow-width behavior."),
    ...reads.slice(0, 4),
    failedCheck,
    text("The trace overflows at 390px. The failing layout check identifies the row to inspect next."),
  ]),
  scenario("subagents", "session:traceFoldingPreview.subagentsScenario", true, [
    ...reads.slice(0, 6),
    text("Keyboard review is complete. I’ll compare it with the narrow-width findings when they come back."),
    reviewAgent,
    testAgent,
  ]),
  scenario("short", "session:traceFoldingPreview.shortScenario", false, [
    ...reads.slice(0, 3),
    text("The three checks passed."),
  ]),
];
