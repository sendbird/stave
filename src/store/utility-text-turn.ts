import { i18n } from "@/i18n/runtime";
/**
 * One read-only turn on the utility lane that returns the model's text. Shared
 * by the agent features that ask the model for a small JSON answer (drafting
 * an agent, suggesting an instruction change). No secrets, tools, MCP servers,
 * writes or network: `buildReadOnlyAuxRuntimeOptions` decides the runtime
 * options (`toolsDisabled`) and the lane's on/off switch in Settings is
 * honoured. The turn runs in the active workspace's folder, which the provider
 * runtime requires of every turn.
 */
import {
  buildReadOnlyAuxRuntimeOptions,
  resolveAuxLaneRuntime,
} from "@/lib/providers/auxiliary-inference-policy";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { useAppStore } from "./app.store";

export type UtilityTextResult = { ok: true; text: string } | { ok: false; message: string; cancelled?: boolean };

function eventOfType<T extends NormalizedProviderEvent["type"]>(type: T) {
  return (event: unknown): event is Extract<NormalizedProviderEvent, { type: T }> =>
    Boolean(event && typeof event === "object" && (event as { type?: unknown }).type === type);
}

/** The turn's text, and the first error it reported (a refused turn has only that). */
async function collectReply(stream: unknown): Promise<{ text: string; error: string | null }> {
  const resolved = await stream;
  const events: unknown[] = Array.isArray(resolved) ? resolved : [];
  if (!Array.isArray(resolved) && resolved && typeof resolved === "object" && Symbol.asyncIterator in resolved) {
    for await (const event of resolved as AsyncIterable<unknown>) events.push(event);
  }
  const text = events.filter(eventOfType("text")).map((event) => event.text).join("").trim();
  const error = events.find(eventOfType("error"));
  return { text, error: error ? error.message : null };
}

function newTurnId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The workspace's folder: its recorded path, else the repository root for the
 * active or default workspace. A workspace whose folder is unknown has none,
 * so the turn never runs in another workspace's folder.
 */
function resolveWorkspaceFolder(
  state: Pick<ReturnType<typeof useAppStore.getState>, "workspacePathById" | "workspaceDefaultById" | "activeWorkspaceId" | "repositoryPath">,
  workspaceId: string,
): string | null {
  const recorded = state.workspacePathById[workspaceId];
  if (recorded) return recorded;
  const ownsRepositoryRoot = workspaceId === state.activeWorkspaceId || state.workspaceDefaultById[workspaceId] === true;
  return ownsRepositoryRoot && state.repositoryPath ? state.repositoryPath : null;
}

const CANCELLED: UtilityTextResult = { ok: false, get message() { return i18n.t("notifications:utilityTextTurn.cancelled"); }, cancelled: true };

/**
 * Runs `prompt` once. Aborting `signal` stops the turn and resolves as
 * cancelled, so a late answer never lands after the caller moved on.
 */
export async function runUtilityTextTurn(args: {
  prompt: string;
  turnIdPrefix: string;
  signal?: AbortSignal;
  /** The workspace the turn is about; its folder is where the turn runs. Defaults to the active one. */
  workspaceId?: string;
}): Promise<UtilityTextResult> {
  const { signal } = args;
  if (signal?.aborted) return CANCELLED;
  const provider = window.api?.provider;
  const streamTurn = provider?.streamTurn;
  if (!streamTurn) return { ok: false, message: i18n.t("notifications:utilityTextTurn.thisNeedsTheDesktopApp") };
  const state = useAppStore.getState();
  const lane = resolveAuxLaneRuntime({
    lane: "utility",
    policy: state.settings.auxiliaryInferencePolicy,
    shared: state.settings.auxiliaryInferenceDefault,
  });
  if (!lane.enabled) return { ok: false, message: i18n.t("notifications:utilityTextTurn.theUtilityModelIsTurnedOffInSettings") };
  const cwd = resolveWorkspaceFolder(state, args.workspaceId ?? state.activeWorkspaceId);
  if (!cwd) return { ok: false, message: i18n.t("notifications:utilityTextTurn.openAWorkspaceFirst") };
  const turnId = newTurnId(args.turnIdPrefix);
  const abort = () => void provider?.abortTurn?.({ turnId })?.catch(() => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const reply = await collectReply(
      streamTurn({
        turnId,
        providerId: lane.providerId,
        prompt: args.prompt,
        cwd,
        runtimeOptions: buildReadOnlyAuxRuntimeOptions({
          accountSelection: state.settings,
          providerId: lane.providerId,
          model: lane.model,
          effortOverrides: lane.effortOverrides,
        }),
      }),
    );
    if (signal?.aborted) return CANCELLED;
    // A refused or failed turn is a failure with its reason, never an empty answer.
    if (!reply.text && reply.error !== null) {
      return { ok: false, message: reply.error || i18n.t("notifications:utilityTextTurn.theRequestFailedTryAgain") };
    }
    return { ok: true, text: reply.text };
  } catch (error) {
    if (signal?.aborted) return CANCELLED;
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : i18n.t("notifications:utilityTextTurn.theRequestFailedTryAgain"),
    };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
