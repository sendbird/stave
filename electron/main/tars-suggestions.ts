import type { TarsConversationSettings } from "../../src/lib/tars/conversation";
import { buildTarsRuntimeHints } from "../../src/lib/tars/runtime-hints";
import {
  buildTarsSuggestionPrompt, parseTarsSuggestionOutput, TarsSuggestInputSchema, TarsSuggestResultSchema,
  type TarsSuggestFailure, type TarsSuggestResult,
} from "../../src/lib/tars/suggestion-generation";
import type { createSecondaryRunCoordinator } from "./runs/secondary-run-coordinator";
import { TARS_PLANNER_MAX_EVENTS } from "./tars-planner";

type Coordinator = Pick<ReturnType<typeof createSecondaryRunCoordinator>, "claim" | "execute" | "complete" | "fail">;

/**
 * Short chips need far less time than a planner turn (`TARS_PLANNER_TIMEOUT_MS`):
 * a small prompt, a small answer. A slower answer is a failure the window says.
 */
export const TARS_SUGGESTION_TIMEOUT_MS = 90_000;
/** Four short chips in JSON fit well inside this; a longer answer is cut and refused. */
const MAX_OUTPUT_BYTES = 8_000;

export interface TarsSuggestionPorts {
  /** The saved conversation settings: the same reasoning provider, model and runtime hints a message uses. */
  settings: () => TarsConversationSettings | null;
  coordinator: Coordinator;
  /** Tars's own directory; the turn has no tools, so nothing in it is read or written. */
  cwd: string;
}

export function tarsSuggestionRunIdentity(requestId: string) {
  const runId = `tars-suggestions:${requestId}`;
  return { runId, stepId: `${runId}:write` };
}

/**
 * Asks Tars's saved reasoning model for suggested requests: one read-only,
 * tool-less secondary turn through the run ledger, like a message's reasoning
 * turn. Returns only what the model wrote, after validation; a call that did
 * not complete, or an answer of the wrong shape, is a failure with its reason.
 * Nothing is persisted besides the run ledger's own record of the call.
 */
export async function generateTarsSuggestions(rawInput: unknown, ports: TarsSuggestionPorts): Promise<TarsSuggestResult> {
  const input = TarsSuggestInputSchema.parse(rawInput);
  const failed = (reason: TarsSuggestFailure): TarsSuggestResult => ({ status: "failed", requestId: input.requestId, reason });
  const settings = ports.settings();
  if (!settings) return failed("noSettings");
  const { runId, stepId } = tarsSuggestionRunIdentity(input.requestId);
  const turn = { providerId: settings.providerId, model: settings.model, cwd: ports.cwd, toolsDisabled: true as const,
    runtimeHints: buildTarsRuntimeHints(settings.providerId, settings.runtimeHints ?? {}), prompt: buildTarsSuggestionPrompt(input) };
  let executionId: string | undefined;
  try {
    const claim = await ports.coordinator.claim({
      run: { id: runId, kind: "secondary-provider" as const, origin: { kind: "advisor" as const, id: input.requestId },
        ownership: { repositoryPath: ports.cwd, workspaceId: "personal-representative", taskId: null },
        policy: { maxAttempts: 1, timeoutMs: TARS_SUGGESTION_TIMEOUT_MS, maxTurns: 1, maxOutputBytes: MAX_OUTPUT_BYTES, maxEvents: TARS_PLANNER_MAX_EVENTS },
        provenance: { createdBy: "tars", schemaVersion: 1, sourceVersion: "1" } },
      step: { id: stepId, kind: "secondary-provider-turn" as const, dependencyIds: [], idempotencyKey: `${runId}:claim` }, input: turn,
    });
    executionId = claim.aggregate?.step.executionId ?? undefined;
    if (!claim.accepted || !executionId) {
      console.warn("[tars] suggestions not admitted", { requestId: input.requestId, reason: claim.accepted ? "no execution" : claim.reason ?? "rejected" });
      return failed("provider");
    }
    const result = await ports.coordinator.execute({ runId, stepId, executionId, input: turn });
    const execution = result.execution;
    if (!result.accepted || !execution || execution.status !== "completed" || execution.truncated) {
      // Host and provider errors only, never the prompt or the model's output.
      console.warn("[tars] suggestions failed", { requestId: input.requestId, status: execution?.status ?? result.reason ?? "no result", stopReason: execution?.stopReason ?? null });
      // A completed but cut answer is still waiting in the ledger: close it as failed.
      if (execution?.status === "completed") await ports.coordinator.fail({ runId, stepId, executionId, idempotencyKey: `${runId}:failed`, error: "The suggestions were truncated.", code: "truncated" });
      return failed("provider");
    }
    const suggestions = parseTarsSuggestionOutput(execution.text);
    if (!suggestions) {
      await ports.coordinator.fail({ runId, stepId, executionId, idempotencyKey: `${runId}:failed`, error: "The suggestions did not match their schema." });
      return failed("invalidOutput");
    }
    const completed = await ports.coordinator.complete({ runId, stepId, executionId, idempotencyKey: `${runId}:complete`, resultArtifactRef: runId });
    if (!completed.accepted) return failed("provider");
    // The provider reports which model answered, which can differ from an alias that was saved.
    return TarsSuggestResultSchema.parse({ status: "generated", requestId: input.requestId, providerId: execution.providerId, model: execution.model, suggestions });
  } catch {
    // A transport failure must not leave an admitted run waiting forever.
    if (executionId) {
      try { await ports.coordinator.fail({ runId, stepId, executionId, idempotencyKey: `${runId}:failed`, error: "Suggestion generation failed." }); } catch { /* Persistence may itself be unavailable. */ }
    }
    return failed("provider");
  }
}
