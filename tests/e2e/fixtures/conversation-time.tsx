import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { ChatPanel } from "@/components/session/ChatPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { TooltipProvider } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/components/ads/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
const builtin =
  BUILTIN_CUSTOM_THEMES.find((entry) => entry.id === theme) ?? null;
applyAppLocale(params.get("lang") ?? "en");
applyThemeClass({ enabled: theme === "dark" || builtin?.baseMode === "dark" });
applyCustomTheme({ theme: builtin });
useAppStore.persist.setOptions({ name: "conversation-time-fixture" });
const taskId = "conversation-time";
const messages: ChatMessage[] = [
  {
    id: "user-first",
    role: "user",
    providerId: "user",
    model: "user",
    content: "Check the settings layout and keyboard navigation.",
    parts: [],
    startedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "assistant-first",
    role: "assistant",
    providerId: "codex",
    model: "gpt-6.1-sol",
    content:
      "The settings controls are aligned. Keyboard focus follows the visual order.",
    parts: [],
    startedAt: "2026-01-02T00:00:01.000Z",
    completedAt: "2026-01-02T00:00:13.000Z",
  },
  {
    id: "user-second",
    role: "user",
    providerId: "user",
    model: "user",
    content: "Check the dark theme as well.",
    parts: [],
    startedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "assistant-second",
    role: "assistant",
    providerId: "claude-code",
    model: "claude-sonnet-4-6",
    content:
      "Both themes use the same spacing and focus treatment. The layout is ready to review.",
    parts: [],
    startedAt: "2026-01-03T00:00:01.000Z",
    completedAt: "2026-01-03T00:00:09.000Z",
  },
];
useAppStore.setState({
  activeTaskId: taskId,
  activeWorkspaceId: "conversation-time-ws",
  tasks: [
    {
      id: taskId,
      title: "Settings review",
      provider: "codex",
      updatedAt: "2026-01-03T00:00:09.000Z",
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
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  area: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
});

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main className={sx(styles.frame)}>
      <TooltipProvider>
        <TaskScopeProvider taskId={taskId}>
          {params.has("composer") ? (
            // Stands in for ChatArea: its root tags the area Cmd/Ctrl+F finds in.
            <div data-conversation-find-scope="" className={sx(styles.area)}>
              <ChatPanel />
              <textarea aria-label="Composer stand-in" />
            </div>
          ) : (
            <ChatPanel />
          )}
          {params.has("split") ? <ChatPanel /> : null}
        </TaskScopeProvider>
      </TooltipProvider>
    </main>
  </StaveDesignProvider>,
);
