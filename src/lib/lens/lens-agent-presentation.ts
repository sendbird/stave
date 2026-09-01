import type {
  LensAgentActivityKind,
  LensAgentPresentationMode,
  LensSessionPresentationRequestPayload,
} from "@/lib/lens/lens.types";

const LENS_AGENT_ACTIVITY_BY_TOOL = {
  stave_lens_fill_saved_account: "interaction",
  stave_lens_screenshot: "visual",
  stave_lens_set_style: "interaction",
  stave_lens_inspect: "visual",
  stave_lens_measure: "visual",
  stave_lens_click: "interaction",
  stave_lens_type: "interaction",
  stave_lens_set_appearance: "visual",
} as const satisfies Record<string, LensAgentActivityKind>;

export type LensAgentActivityToolName =
  keyof typeof LENS_AGENT_ACTIVITY_BY_TOOL;

export type AutomaticLensPresentationPlacement =
  | "split-right"
  | "background-tab";

export interface LensPresentationRequestPolicy {
  placement: "focus" | AutomaticLensPresentationPlacement;
  allowWorkspaceSwitch: boolean;
  deferUntilWorkspaceActive: boolean;
}

/**
 * Navigation and generic evaluation intentionally stay unclassified. A click
 * may cause navigation, but the click is the user-visible activity boundary;
 * redirects and page-driven navigation must never pop Lens open on their own.
 */
export function resolveLensAgentActivityKind(
  toolName: string,
): LensAgentActivityKind | null {
  return (
    LENS_AGENT_ACTIVITY_BY_TOOL[
      toolName as LensAgentActivityToolName
    ] ?? null
  );
}

export function shouldRequestLensAgentPresentation(args: {
  managedByMcp: boolean;
  toolName: string;
}): boolean {
  return (
    args.managedByMcp &&
    resolveLensAgentActivityKind(args.toolName) !== null
  );
}

export function resolveAutomaticLensPresentationPlacement(
  mode: LensAgentPresentationMode,
): AutomaticLensPresentationPlacement | null {
  return mode === "agent-decides" ? null : mode;
}

export function resolveLensPresentationRequestPolicy(args: {
  payload: LensSessionPresentationRequestPayload;
  activeWorkspaceId: string | null;
  mode: LensAgentPresentationMode;
}): LensPresentationRequestPolicy | null {
  if (args.payload.requestKind !== "agent-activity") {
    return {
      placement: "focus",
      allowWorkspaceSwitch: true,
      deferUntilWorkspaceActive: false,
    };
  }

  const placement = resolveAutomaticLensPresentationPlacement(args.mode);
  if (!placement) {
    return null;
  }
  return {
    placement,
    allowWorkspaceSwitch: false,
    deferUntilWorkspaceActive:
      args.activeWorkspaceId !== args.payload.workspaceId,
  };
}

/**
 * The preload bridge keeps one early request per session until React
 * subscribes. Never let a later automatic hint replace an explicit request,
 * including legacy explicit payloads with no requestKind.
 */
export function selectPendingLensPresentationRequest(
  current: LensSessionPresentationRequestPayload | undefined,
  next: LensSessionPresentationRequestPayload,
): LensSessionPresentationRequestPayload {
  const currentIsExplicit =
    current !== undefined && current.requestKind !== "agent-activity";
  return currentIsExplicit && next.requestKind === "agent-activity"
    ? current
    : next;
}
