import type { AgentRunChangedEvent, AgentRunDetail } from "../../../src/lib/agent-runs/api";
import type { DelegatedAgentRunStart, DelegatedAgentRunRead } from "../../../src/lib/agent-runs/delegated-run";
import { readDelegatedAgentCompletion } from "../../../src/lib/agent-runs/delegated-completion";
import { DelegatedTaskTurnError } from "./delegated-task-turn-error";

/** Observes the existing supervisor; it never admits or schedules a turn. */
export function createDelegatedAgentRunPort(deps: {
  prepare: (args: DelegatedAgentRunStart) => Promise<AgentRunDetail>;
  activate: (args: { agentRunId: string; executionId: string }) => Promise<AgentRunDetail>;
  get: (args: { agentRunId: string }) => Promise<DelegatedAgentRunRead>;
  cancel: (args: { agentRunId: string }) => Promise<unknown>;
  stopTask: (args: { workspaceId: string; taskId: string }) => Promise<unknown>;
  subscribe: (listener: (event: AgentRunChangedEvent) => void) => () => void;
  pollIntervalMs?: number;
}) {
  const read = async (args: { agentRunId: string }) => deps.get(args).catch(() => null);
  const stop = async (args: { agentRunId: string; workspaceId: string; taskId: string }) => {
    // Cancel the supervisor first; task stop by itself cannot stop between-turn admission.
    try { await deps.cancel({ agentRunId: args.agentRunId }); }
    finally { await deps.stopTask({ workspaceId: args.workspaceId, taskId: args.taskId }); }
  };
  const run = async (args: DelegatedAgentRunStart & { onPrepared: () => Promise<boolean> }) => {
    const { onPrepared, ...start } = args;
    await deps.prepare(start);
    if (!(await args.onPrepared())) {
      await stop(args);
      throw new DelegatedTaskTurnError("The delegation was stopped before activation.", "cancelled");
    }
    await deps.activate({ agentRunId: args.agentRunId, executionId: args.authority.executionId });
    return new Promise<AgentRunDetail>((resolve) => {
      let ended = false;
      let checking = false;
      let requested = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expected = { agentRunId: args.agentRunId, workspaceId: args.workspaceId, taskId: args.taskId };
      const check = async () => {
        if (ended) return;
        if (checking) { requested = true; return; }
        checking = true;
        clearTimeout(timer);
        do {
          requested = false;
          const observation = await read({ agentRunId: args.agentRunId });
          const detail = observation && !("missing" in observation) ? observation : null;
          const completion = readDelegatedAgentCompletion({ expected, detail });
          if (detail && (completion.kind === "completed" || completion.kind === "cancelled" || completion.kind === "stopped")) {
            ended = true;
            unsubscribe();
            resolve(detail);
            break;
          }
        } while (requested && !ended);
        checking = false;
        if (!ended) {
          timer = setTimeout(() => { void check(); }, deps.pollIntervalMs ?? 15_000);
          timer.unref?.();
        }
      };
      const unsubscribe = deps.subscribe((event) => {
        if (event.agentRunId === args.agentRunId) void check();
      });
      void check();
    });
  };
  return { run, read, stop };
}
