import type { CSSProperties } from "react";
import { hasMeaningfulPlanText, normalizePlanText } from "@/lib/plan-text";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import type { ChatMessage } from "@/types/chat";

const PLAN_VIEWER_COLLAPSED_GAP_PX = 8;
const PLAN_VIEWER_EXPANDED_TOP_PX = 12;
const PLAN_VIEWER_SIDE_GAP_PX = 16;
const PLAN_VIEWER_NORMAL_MAX_WIDTH_PX = 672;
// Float plan/todo cards above chat-input chrome (`z-30` in `ChatArea`) and
// any shell blur/fade treatment. The outer wrapper keeps `pointer-events-none`
// so clicks fall through until an inner card explicitly opts back in.
export const SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME =
  `pointer-events-none absolute ${UI_LAYER_CLASS.sessionFloater}`;

export type PlanViewerViewState = "normal" | "minimized" | "expanded";

interface PlanViewerDragPosition {
  x: number;
  y: number;
}

type PlanMessage = Pick<
  ChatMessage,
  "role" | "providerId" | "isPlanResponse" | "isStreaming" | "planText"
>;

function hasPlanContent(message?: PlanMessage | null) {
  return (
    message?.role === "assistant" &&
    message.isPlanResponse === true &&
    hasMeaningfulPlanText(message.planText)
  );
}

export function resolvePlanViewerState(args: {
  activeProvider: "claude-code" | "codex" | "stave";
  claudePermissionMode:
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "plan"
    | "dontAsk"
    | "auto";
  codexPlanMode?: boolean;
  latestPlanMessage?: PlanMessage | null;
  lastMessage?: PlanMessage | null;
  isTurnActive: boolean;
}) {
  const planText = hasMeaningfulPlanText(args.latestPlanMessage?.planText)
    ? normalizePlanText(args.latestPlanMessage?.planText ?? "")
    : "";

  const isClaudePlanMode =
    (args.activeProvider === "claude-code" ||
      args.activeProvider === "stave") &&
    args.claudePermissionMode === "plan";
  const isCodexPlanMode =
    args.activeProvider === "codex" && args.codexPlanMode === true;
  const isPlanModeActive = isClaudePlanMode || isCodexPlanMode;
  const lastMessageHasPlan = hasPlanContent(args.lastMessage);
  const hasHistoricalPlan = hasPlanContent(args.latestPlanMessage);
  const shouldDelayCodexPendingViewer =
    isCodexPlanMode &&
    args.isTurnActive &&
    args.latestPlanMessage?.isStreaming === true;

  // Stay in "preparing" while plan mode is active and the current turn has not
  // produced a fresh plan response yet. Historical plan text may still exist.
  const isPlanPreparing =
    isPlanModeActive &&
    args.isTurnActive &&
    (!lastMessageHasPlan || shouldDelayCodexPendingViewer);

  // Claude keeps the latest plan visible after leaving plan mode so the
  // dedicated review controls stay available. Codex exits back to the normal
  // input flow when the user turns plan mode off explicitly.
  const isPlanPending =
    hasHistoricalPlan &&
    !shouldDelayCodexPendingViewer &&
    (isPlanModeActive ||
      (args.activeProvider !== "codex" && lastMessageHasPlan));
  const canReplyToPlan = isPlanPending && !args.isTurnActive;

  return {
    planText,
    isPlanPreparing,
    isPlanPending,
    canReplyToPlan,
  };
}

export function resolvePlanViewerAutoViewState(args: {
  viewState: PlanViewerViewState;
  isPlanPreparing: boolean;
  planText: string;
}): PlanViewerViewState {
  if (
    args.viewState === "expanded" &&
    args.isPlanPreparing &&
    args.planText.trim().length > 0
  ) {
    return "minimized";
  }

  return args.viewState;
}

export function buildPlanViewerContextKey(args: {
  activeWorkspaceId: string;
  activeTaskId: string;
  latestPlanMessageId?: string | null;
}) {
  return [
    args.activeWorkspaceId,
    args.activeTaskId,
    args.latestPlanMessageId ?? "pending",
  ].join(":");
}

export function resolvePlanViewerInsets(args: {
  isExpanded: boolean;
}) {
  return {
    topOffset: args.isExpanded ? PLAN_VIEWER_EXPANDED_TOP_PX : null,
    rightOffset: PLAN_VIEWER_SIDE_GAP_PX,
    bottomOffset: PLAN_VIEWER_COLLAPSED_GAP_PX,
  };
}

export function resolvePlanViewerLayout(args: {
  viewState: PlanViewerViewState;
  dragPos?: PlanViewerDragPosition | null;
}): {
  wrapperClassName: string;
  wrapperStyle: CSSProperties;
  cardClassName: string;
} {
  const isExpanded = args.viewState === "expanded";
  const isMinimized = args.viewState === "minimized";
  const { topOffset, rightOffset, bottomOffset } = resolvePlanViewerInsets({
    isExpanded,
  });

  if (isMinimized && args.dragPos) {
    return {
      // Plan review floats above transient todo progress and chat-input chrome;
      // see SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME.
      wrapperClassName: SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
      wrapperStyle: {
        top: args.dragPos.y,
        left: args.dragPos.x,
      },
      cardClassName: [
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
        "w-72",
      ].join(" "),
    };
  }

  const wrapperStyle: CSSProperties = isExpanded
    ? {
        right: rightOffset,
        bottom: bottomOffset,
        width: `calc(100% - ${rightOffset * 2}px)`,
        height: `max(0px, calc(100% - ${bottomOffset + (topOffset ?? 0)}px))`,
      }
    : isMinimized
      ? {
          right: rightOffset,
          bottom: bottomOffset,
        }
      : {
          right: rightOffset,
          bottom: bottomOffset,
          width: `calc(100% - ${rightOffset * 2}px)`,
          maxWidth: PLAN_VIEWER_NORMAL_MAX_WIDTH_PX,
        };

  return {
    wrapperClassName: SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
    wrapperStyle,
    cardClassName: [
      "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
      isExpanded ? "h-full w-full" : "",
      isMinimized ? "w-72" : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
