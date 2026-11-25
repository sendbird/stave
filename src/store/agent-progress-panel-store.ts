import type { CompareRunVariant } from "@/lib/compare-runs";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { create } from "zustand";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";
import { useAppStore } from "./app.store";

/**
 * The agent the right-rail Agent panel shows, addressed by reference: the
 * panel reads the live state from the stores each render, and `snapshot`
 * only fills in while the source is not listed (yet, or any more).
 */
export type AgentProgressTarget =
  | { kind: "compare-candidate"; runId: string; variantId: string; snapshot: CompareRunVariant; title: string }
  | { kind: "tars"; runId: string; snapshot: AgentRunDetail; title: string }
  | {
      kind: "delegated-task";
      repositoryPath?: string;
      /** The task that delegated it. */
      parentTaskId: string;
      parentWorkspaceId?: string;
      delegationKey: string;
      delegatedTaskId?: string;
      delegatedWorkspaceId?: string;
      title?: string;
      snapshot?: DelegationExchange;
      /** A managed task's subagents can be watched, not stopped. */
      readOnly?: boolean;
    }
  | {
      kind: "review";
      parentTaskId: string;
      delegationKey: string;
      title?: string;
      snapshot: ReviewShelfItem;
    }
  | {
      kind: "subagent";
      repositoryPath?: string;
      /** The task whose conversation holds the spawning call. */
      parentTaskId: string;
      parentWorkspaceId?: string;
      toolUseId?: string;
      nodeKey?: string;
      agentId?: string;
      providerId?: ProviderId;
      title?: string;
      snapshot?: DelegationExchange;
    };

/** One key per agent, so reopening the same agent keeps its place. */
export function agentProgressTargetKey(target: AgentProgressTarget): string {
  switch (target.kind) {
    case "compare-candidate":
      return JSON.stringify([target.kind, target.runId, target.variantId]);
    case "tars":
      return JSON.stringify([target.kind, target.runId]);
    case "delegated-task":
      return `delegated-task:${target.parentTaskId}:${target.delegationKey}:${target.delegatedTaskId ?? ""}`;
    case "review":
      return `review:${target.parentTaskId}:${target.delegationKey}`;
    case "subagent":
      return `subagent:${target.parentTaskId}:${target.toolUseId ?? target.agentId ?? target.nodeKey ?? ""}`;
  }
}

interface AgentProgressPanelState {
  /** The open agent last; earlier entries are the agents it was opened from. */
  stack: AgentProgressTarget[];
  /** The panel that was open before, restored on close. */
  returnTo: { visible: boolean; tab: RightRailPanelId } | null;
  /** Opens an agent from a surface: the stack starts over. */
  open: (target: AgentProgressTarget) => void;
  /** Opens an agent the current one started, keeping the way back. */
  push: (target: AgentProgressTarget) => void;
  back: () => void;
  close: () => void;
}

const AGENT_PANEL_LAYOUT = { sidebarOverlayVisible: true, sidebarOverlayTab: "agent" } as const;

/**
 * The Agent panel's selection. A small store of its own, outside `app.store`:
 * only the panel and the rail toggle read it, and opening an agent must not
 * re-render the surfaces that subscribe to the app store.
 */
export const useAgentProgressPanelStore = create<AgentProgressPanelState>((set, get) => ({
  stack: [],
  returnTo: null,
  open: (target) => {
    const { layout, setLayout } = useAppStore.getState();
    const alreadyOpen = layout.sidebarOverlayVisible && layout.sidebarOverlayTab === "agent";
    set({
      stack: [target],
      returnTo: alreadyOpen ? get().returnTo : { visible: layout.sidebarOverlayVisible, tab: layout.sidebarOverlayTab },
    });
    setLayout({ patch: AGENT_PANEL_LAYOUT });
  },
  push: (target) => {
    const current = get().stack.at(-1);
    if (current && agentProgressTargetKey(current) === agentProgressTargetKey(target)) return;
    set((state) => ({ stack: [...state.stack, target] }));
    useAppStore.getState().setLayout({ patch: AGENT_PANEL_LAYOUT });
  },
  back: () => set((state) => (state.stack.length > 1 ? { stack: state.stack.slice(0, -1) } : state)),
  close: () => {
    const { returnTo } = get();
    set({ stack: [], returnTo: null });
    const { layout, setLayout } = useAppStore.getState();
    if (layout.sidebarOverlayTab !== "agent") return;
    setLayout({
      patch: returnTo && returnTo.tab !== "agent"
        ? { sidebarOverlayVisible: returnTo.visible, sidebarOverlayTab: returnTo.tab }
        : { sidebarOverlayVisible: false },
    });
  },
}));

/** Opens an agent's progress next to the conversation. */
export function openAgentProgress(target: AgentProgressTarget) {
  useAgentProgressPanelStore.getState().open(target);
}
