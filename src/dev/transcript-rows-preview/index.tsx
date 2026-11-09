import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { ChatPanel } from "@/components/session/ChatPanel";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const styles = stylex.create({
  page: { height: "100vh", display: "flex", justifyContent: "center", backgroundColor: vars["--aui-color-canvas"] },
  column: { display: "flex", height: "100%", maxWidth: "100%", minWidth: 0 },
});

const TASK_ID = "transcript-rows-task";

function at(minute: number) {
  return new Date(Date.UTC(2026, 0, 5, 9, minute)).toISOString();
}

function prompt(id: string, minute: number, content: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "user", providerId: "user", model: "user", content, parts: [], startedAt: at(minute), ...overrides };
}

function reply(id: string, minute: number, content: string, overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    role: "assistant",
    providerId: "claude-code",
    model: "claude-sonnet-4-6",
    content,
    parts: [{ type: "text", text: content }],
    startedAt: at(minute),
    completedAt: at(minute + 1),
    ...overrides,
  };
}

/**
 * A model switch on each provider path and three steers sent back to back, so
 * the model-change marker and user message groups render on real rows.
 */
function buildTranscript(): ChatMessage[] {
  return [
    prompt("u1", 0, "Review the settings layout."),
    reply("a1", 1, "The settings rows line up; the footer needs 4px more space.", { modelInfo: { effort: "medium" } }),
    prompt("u2", 3, "Fix the footer spacing."),
    reply("a2", 4, "Updated the footer gap to the 16px step.", { model: "claude-opus-4-8", modelInfo: { effort: "high" } }),
    prompt("u3", 6, "Run the tests too."),
    reply("a3", 7, "All 42 layout tests pass.", { providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high" } }),
    prompt("u4", 9, "Check the dark theme as well."),
    // Fast mode alone is not a model change, so no line above this reply.
    reply("a4", 10, "Checking the dark theme surfaces now.", { providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high", fastMode: true }, turnId: "t4" }),
    prompt("s1", 11, "Also check the Korean copy.", { steeredIntoTurnId: "t4", steerDeliveryState: "accepted" }),
    prompt("s2", 11, "Keep the composer as it is.", { steeredIntoTurnId: "t4", steerDeliveryState: "accepted" }),
    prompt("s3", 12, "Skip the docs for now; I will update them after review.", { steeredIntoTurnId: "t4", steerDeliveryState: "accepted" }),
    reply("a5", 12, "Dark theme and Korean copy are fine. I left the composer and docs unchanged.", { providerId: "codex", model: "gpt-5.5", modelInfo: { effort: "high", fastMode: true }, turnId: "t4" }),
    prompt("u5", 14, "Plan the next settings pass."),
    // Auto routed this reply; the line compares the model that ran.
    reply("a6", 15, "Plan: align the section headers, then the footer actions.", {
      model: "claude-opus-4-8",
      modelInfo: { effort: "high" },
      modelResolution: { selectedProviderId: "claude-code", selectedModel: "claude-opus-4-8", source: "heuristic", rationale: "Planning work goes to the planning model.", confidence: null, taskType: "plan" },
    }),
  ];
}

/** Actual conversation rows, without provider calls or workspace bootstrap. */
export function TranscriptRowsPreview() {
  const [ready, setReady] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const width = Number(params.get("width")) || 720;
  useLayoutEffect(() => {
    const theme = BUILTIN_CUSTOM_THEMES.find((item) => item.id === params.get("theme")) ?? null;
    applyThemeClass({ enabled: theme?.baseMode === "dark" || params.get("theme") === "dark" });
    applyCustomTheme({ theme });
    applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
    const messages = buildTranscript();
    useAppStore.setState({
      activeWorkspaceId: "transcript-rows-preview",
      activeTaskId: TASK_ID,
      tasks: [{ id: TASK_ID, title: "Transcript rows", provider: "codex", updatedAt: at(12), unread: false, controlMode: "interactive", controlOwner: "stave" }],
      messagesByTask: { [TASK_ID]: messages },
      messageCountByTask: { [TASK_ID]: messages.length },
      taskWorkspaceIdById: { [TASK_ID]: "transcript-rows-preview" },
      settings: { ...useAppStore.getState().settings, messageFontSize: 14 },
    });
    setReady(true);
  }, []);
  return <div className={sx(styles.page)}><div className={sx(styles.column)} style={{ width }}>{ready ? <ChatPanel /> : null}</div></div>;
}
