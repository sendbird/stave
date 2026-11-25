import { useWorkspaceScratchStore } from "@/store/workspace-scratch-store";
import { reduceProviderTurnActivityEvents } from "@/lib/providers/turn-status";
import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { AgentProgressPanel } from "@/components/agent-progress/AgentProgressPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TooltipProvider } from "@/components/ui";
import { applyThemeClass } from "@/lib/themes/apply";
import { openAgentProgress, useAgentProgressPanelStore } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/components/aui/styles.css";
import "@/globals.css";

/**
 * The real Agent panel container reading the real stores: a Claude turn that
 * started a subagent, which read two files and started a subagent of its own.
 * No provider history is available here, so the panel reads the calls the
 * parent recorded.
 */
const params = new URLSearchParams(location.search);
applyAppLocale(params.get("lang") ?? "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "agent-progress-panel-fixture" });

const taskId = "agent-progress-task";
const message: ChatMessage = {
  id: "turn-1",
  role: "assistant",
  providerId: "claude-code",
  model: "claude-opus-4-5",
  turnId: "turn-1",
  content: "",
  isStreaming: true,
  startedAt: new Date(Date.now() - 50_000).toISOString(),
  parts: [
    {
      type: "tool_use",
      toolUseId: "spawn-1",
      toolName: "Agent",
      agentId: "agent-1",
      input: JSON.stringify({ description: "Map the auth flow", subagent_type: "Explore", prompt: "Map how login works and where sessions expire." }),
      state: "input-available",
    },
    {
      type: "tool_use",
      toolUseId: "s1",
      toolName: "Glob",
      parentToolUseId: "spawn-1",
      input: JSON.stringify({ pattern: "src/auth/**" }),
      state: "output-available",
      output: "src/auth/session.ts\nsrc/auth/cookies.ts",
    },
    {
      type: "tool_use",
      toolUseId: "s2",
      toolName: "Read",
      ownerAgentId: "agent-1",
      input: JSON.stringify({ file_path: "src/auth/session.ts" }),
      state: "output-available",
      output: "export const TTL = 3600;",
    },
    {
      type: "tool_use",
      toolUseId: "spawn-2",
      toolName: "Agent",
      agentId: "agent-2",
      ownerAgentId: "agent-1",
      input: JSON.stringify({ description: "Check the cookie flags", prompt: "Check HttpOnly, Secure and SameSite." }),
      state: "input-available",
    },
    {
      type: "tool_use",
      toolUseId: "g1",
      toolName: "Grep",
      ownerAgentId: "agent-2",
      input: JSON.stringify({ pattern: "SameSite" }),
      state: "input-available",
    },
  ],
};

useAppStore.setState((state) => ({
  activeTaskId: taskId,
  tasks: [{ id: taskId, title: "Fix login sessions" } as (typeof state.tasks)[number], ...state.tasks],
  messagesByTask: { ...state.messagesByTask, [taskId]: [message] },
}));
if (params.has("resources")) {
  const workspaceId = "resource-workspace";
  const rows = ["spawn-1", "another-agent"].map((parentToolUseId, index) => ({
    type: "background_task" as const, id: crypto.randomUUID(), parentToolUseId, providerId: "claude-code" as const,
    description: index ? "Sibling command" : "Verify session expiry", status: "completed" as const, confidence: "confirmed" as const,
    startedAt: 1, endedAt: 2, hasOutput: true, canStop: false, finalOutput: { text: "Checks passed", truncated: false },
  }));
  const activity = reduceProviderTurnActivityEvents({ taskId, turnId: "turn-1", providerId: "claude-code",
    events: [...message.parts.flatMap(part => part.type === "tool_use" ? [{
      type: "tool" as const, toolName: part.toolName, toolUseId: part.toolUseId, input: part.input,
      ownerAgentId: part.ownerAgentId, parentToolUseId: part.parentToolUseId, agentId: part.agentId, state: part.state,
    }] : []), ...rows], activityByTask: {}, now: Date.parse(message.startedAt!) });
  useAppStore.setState({ activeWorkspaceId: workspaceId, workspacePathById: { [workspaceId]: "/fixture" },
    activeTurnIdsByTask: { [taskId]: "turn-1" }, providerTurnActivityByTask: activity.activityByTask });
  const files = ["explore-9304ba/trace.log", "sibling/private.log"].map(name => ({
    path: ".stave/scratch/agents/" + name, sizeBytes: 14, mtimeMs: 1,
  }));
  const listing = { files, fileCount: 2, totalBytes: 28, truncated: false };
  useWorkspaceScratchStore.getState().applyListing(workspaceId, listing);
  Object.defineProperty(window, "api", { configurable: true, value: { ...window.api, fs: {
    listScratch: async () => ({ ok: true, ...listing }),
    readScratchTail: async () => ({ ok: true, content: "Expiry checked", sizeBytes: 14, truncated: false }),
  } } });
}
useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "task" } });

declare global {
  interface Window {
    agentPanelFixture: {
      openSubagent: () => void;
      layout: () => { sidebarOverlayVisible: boolean; sidebarOverlayTab: string };
      stackSize: () => number;
    };
  }
}

window.agentPanelFixture = {
  openSubagent: () => openAgentProgress({ kind: "subagent", parentTaskId: taskId, toolUseId: "spawn-1", providerId: "claude-code" }),
  layout: () => {
    const { sidebarOverlayVisible, sidebarOverlayTab } = useAppStore.getState().layout;
    return { sidebarOverlayVisible, sidebarOverlayTab };
  },
  stackSize: () => useAgentProgressPanelStore.getState().stack.length,
};

if (params.has("open")) window.agentPanelFixture.openSubagent();

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <TooltipProvider>
      <div style={{ width: 360, height: 680, display: "flex", flexDirection: "column" }}>
        <AgentProgressPanel />
      </div>
    </TooltipProvider>
  </StaveDesignProvider>,
);
