import { i18n } from "@/i18n/runtime";
import type {
  SecondaryRunCancelArgs,
  SecondaryRunClaimArgs,
  SecondaryRunCompleteArgs,
  SecondaryRunExecuteArgs,
  SecondaryRunExecuteResponse,
  SecondaryRunFailArgs,
  SecondaryRunTransitionResponse,
} from "@/lib/runs/secondary-run";

export interface SecondaryRunBridge {
  claimSecondary: (
    args: SecondaryRunClaimArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  executeSecondary: (
    args: SecondaryRunExecuteArgs,
  ) => Promise<SecondaryRunExecuteResponse>;
  completeSecondary: (
    args: SecondaryRunCompleteArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  failSecondary: (
    args: SecondaryRunFailArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  cancelSecondary: (
    args: SecondaryRunCancelArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
}

type SecondaryRunExecutionResult<TResult> =
  | {
      ok: true;
      value: TResult;
      executionId: string;
      model: string;
    }
  | {
      ok: false;
      error: string;
    };

function hasSecondaryRunBridge(
  value: Partial<SecondaryRunBridge> | undefined,
): value is SecondaryRunBridge {
  return Boolean(
    value?.claimSecondary &&
      value.executeSecondary &&
      value.completeSecondary &&
      value.failSecondary &&
      value.cancelSecondary,
  );
}

export function resolveSecondaryRunBridge(
  bridge?: Partial<SecondaryRunBridge>,
): SecondaryRunBridge | null {
  const candidate =
    bridge ?? (typeof window !== "undefined" ? window.api?.runs : undefined);
  return hasSecondaryRunBridge(candidate) ? candidate : null;
}

function transitionError(reason: string | null) {
  return reason
    ? `The secondary run rejected the transition (${reason}).`
    : "The secondary run rejected the transition.";
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 1_000);
  }
  return fallback;
}

export async function executeSecondaryRun<TResult>(args: {
  bridge?: Partial<SecondaryRunBridge>;
  claim: SecondaryRunClaimArgs;
  resultArtifactRef: string;
  parse: (text: string) => TResult | null;
  parserError?: string;
  onClaimed?: (args: { executionId: string; attempt: number }) => void;
  shouldContinue?: () => boolean;
}): Promise<SecondaryRunExecutionResult<TResult>> {
  const bridge = resolveSecondaryRunBridge(args.bridge);
  if (!bridge) {
    return {
      ok: false,
      error: i18n.t("app:errors.secondaryBridge"),
    };
  }

  try {
    const claim = await bridge.claimSecondary(args.claim);
    if (!claim.accepted) {
      return {
        ok: false,
        error: transitionError(claim.reason),
      };
    }
    if (!claim.started || claim.duplicate) {
      return {
        ok: false,
        error: i18n.t("app:errors.secondaryClaimed"),
      };
    }
    const executionId = claim.aggregate?.step.executionId;
    if (!executionId) {
      return {
        ok: false,
        error: i18n.t("app:errors.secondaryIdentity"),
      };
    }
    args.onClaimed?.({
      executionId,
      attempt: claim.aggregate?.step.attempt ?? 0,
    });

    const cancel = async () => {
      await bridge.cancelSecondary({
        runId: args.claim.run.id,
        stepId: args.claim.step.id,
        expectedExecutionId: executionId,
        idempotencyKey: `${args.claim.step.idempotencyKey}:cancel`,
      });
      return {
        ok: false as const,
        error: i18n.t("app:errors.secondaryCancelled"),
      };
    };
    if (args.shouldContinue && !args.shouldContinue()) {
      return await cancel();
    }

    const execution = await bridge.executeSecondary({
      runId: args.claim.run.id,
      stepId: args.claim.step.id,
      executionId,
      input: args.claim.input,
    });
    if (!execution.accepted) {
      return {
        ok: false,
        error: transitionError(execution.reason),
      };
    }
    if (!execution.execution) {
      return {
        ok: false,
        error: i18n.t("app:errors.secondaryEmpty"),
      };
    }
    if (execution.execution.status === "cancelled") {
      return {
        ok: false,
        error: i18n.t("app:errors.secondaryCancelled"),
      };
    }
    if (execution.execution.status === "failed") {
      return {
        ok: false,
        error:
          execution.execution.error ||
          i18n.t("app:errors.secondaryFailed"),
      };
    }
    if (args.shouldContinue && !args.shouldContinue()) {
      return await cancel();
    }

    const parserError =
      args.parserError ??
      i18n.t("app:errors.secondaryInvalid");
    let value: TResult | null = null;
    try {
      value = args.parse(execution.execution.text);
    } catch {
      value = null;
    }
    if (value === null) {
      await bridge.failSecondary({
        runId: args.claim.run.id,
        stepId: args.claim.step.id,
        executionId,
        idempotencyKey: `${args.claim.step.idempotencyKey}:parse-failure`,
        error: parserError,
        code: "parser-failure",
      });
      return {
        ok: false,
        error: parserError,
      };
    }

    const completion = await bridge.completeSecondary({
      runId: args.claim.run.id,
      stepId: args.claim.step.id,
      executionId,
      idempotencyKey: `${args.claim.step.idempotencyKey}:complete`,
      resultArtifactRef: args.resultArtifactRef,
    });
    if (!completion.accepted) {
      return {
        ok: false,
        error: transitionError(completion.reason),
      };
    }
    return {
      ok: true,
      value,
      executionId,
      model: execution.execution.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeError(error, "The secondary run failed unexpectedly."),
    };
  }
}
