/** Runs above this many paid model calls need explicit confirmation. */
export const EVAL_CONFIRMATION_THRESHOLD = 20;

export type EvalCallBudgetDecision =
  | { kind: "run" }
  | { kind: "confirm" }
  | { kind: "refuse"; reason: string };

/**
 * Decides whether a run may start, before credentials are checked or any model
 * is called. `--max-calls` is a hard cap that confirmation cannot override; a
 * run above the threshold needs `--yes`, or an interactive confirmation.
 */
export function checkEvalCallBudget(args: { plannedCalls: number; yes: boolean; interactive: boolean; maxCalls?: number | undefined }): EvalCallBudgetDecision {
  if (args.maxCalls !== undefined && args.plannedCalls > args.maxCalls) {
    return { kind: "refuse", reason: `This run plans ${args.plannedCalls} paid model calls, above --max-calls ${args.maxCalls}. Lower --samples or raise --max-calls.` };
  }
  if (args.plannedCalls <= EVAL_CONFIRMATION_THRESHOLD || args.yes) return { kind: "run" };
  if (args.interactive) return { kind: "confirm" };
  return { kind: "refuse", reason: `This run plans ${args.plannedCalls} paid model calls, more than ${EVAL_CONFIRMATION_THRESHOLD}. Pass --yes to confirm, or run it in an interactive terminal.` };
}
