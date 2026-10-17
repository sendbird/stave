import { buildFailedOutgoingSend } from "@/store/failed-send-recovery";
import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { ChatPanel } from "@/components/session/ChatPanel";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { buildQuestionReply } from "@/lib/question-reply";
import { formatAsyncQuestionAnswer } from "@/lib/async-question-answer";
import { buildOutgoingUserMessage } from "@/store/chat-state-helpers";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const styles = stylex.create({
  page: { height: "100vh", display: "flex", justifyContent: "center", backgroundColor: vars["--ads-color-canvas"] },
  column: { display: "flex", height: "100%", maxWidth: "100%", minWidth: 0 },
});

/** Actual conversation rows, without provider calls or workspace bootstrap. */
export function QuestionReplyPreview() {
  const [ready, setReady] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const width = Number(params.get("width")) || 680;
  useLayoutEffect(() => {
    const theme = BUILTIN_CUSTOM_THEMES.find((item) => item.id === params.get("theme")) ?? null;
    applyThemeClass({ enabled: theme?.baseMode === "dark" || params.get("theme") === "dark" });
    applyCustomTheme({ theme });
    applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
    const questions = [
      { key: "scope", header: "Scope", question: "Which scope should be changed?\nKeep the choice limited to the current task?", options: [{ label: "This task only", description: "Keep the existing behavior elsewhere." }, { label: "All tasks", description: "Apply everywhere." }] },
      { key: "notes", header: "Notes", question: "Any additional constraints?", options: [] },
    ];
    const mode = params.get("case");
    const selected = mode === "many" ? questions : questions.slice(0, 1);
    const answers: Record<string, string> = mode === "many" ? { scope: "This task only", notes: "Preserve Korean copy.\nAlso check dark mode." } : { scope: "This task only" };
    const denied = mode === "denied";
    const content = formatAsyncQuestionAnswer({ questions: selected, answers, denied });
    const reply = buildQuestionReply({ requestId: "preview-request", sourceMessageId: "source-card", questions: selected, answers, denied });
    const messages: ChatMessage[] = mode === "failed" ? [] : [
      ...(mode === "card" ? [{ id: "source-card", role: "assistant" as const, providerId: "codex" as const, model: "model", content: "", parts: [{ type: "user_input" as const, requestId: reply.requestId, delivery: "async" as const, toolName: "request_user_input_async", state: "input-responded" as const, questions: selected, answers }] }] : []),
      buildOutgoingUserMessage({ id: "reply", content, ...(mode === "legacy" ? {} : { questionReply: reply }) }),
    ];
    useAppStore.setState({ activeWorkspaceId: "question-preview", activeTaskId: "question-task",
      tasks: [{ id: "question-task", title: "Question reply", provider: "codex", updatedAt: new Date().toISOString(), unread: false, controlMode: "interactive", controlOwner: "stave" }],
      failedSendsByTask: mode === "failed" ? { "question-task": [buildFailedOutgoingSend({ id: "failed", taskId: "question-task", failedAt: new Date().toISOString(), draft: { text: content, questionReply: reply, attachedFilePaths: [], attachments: [] }, error: "Offline" })] } : {},
      messagesByTask: { "question-task": messages }, messageCountByTask: { "question-task": messages.length },
      taskWorkspaceIdById: { "question-task": "question-preview" },
      settings: { ...useAppStore.getState().settings, messageFontSize: 14 },
    });
    setReady(true);
  }, []);
  return <div className={sx(styles.page)}><div className={sx(styles.column)} style={{ width }}>{ready ? <ChatPanel /> : null}</div></div>;
}
