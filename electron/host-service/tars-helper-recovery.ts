import { tarsRecoverableHelper } from "../../src/lib/tars/managed-recovery";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { AgentRunDetail } from "../../src/lib/agent-runs/api";
import type { AgentRunAggregate } from "../../src/lib/agent-runs/domain";
import type { AgentRunRuntime } from "./supervision/agent-run-runtime";
import { TarsRequestUnavailableError } from "./tars-ownership";

/** The caller supplies only helpers whose ancestry it just verified under the owned Run. */
export async function recoverTarsHelper(row: TarsResponsibility, text: string, ports: {
  readHelpers: () => Promise<AgentRunDetail[]>;
  readCurrent: (id: string) => AgentRunAggregate | null;
  guardRoot: () => void;
  reply: AgentRunRuntime["reply"];
}) {
  const helper = tarsRecoverableHelper(row, await ports.readHelpers());
  if (!helper) throw new TarsRequestUnavailableError("The helper's recovery episode changed or needs the user's authority.");
  ports.guardRoot();
  // i18n-ignore: model-facing recovery instructions; these do not grant authority
  const prompt = `Tars recovery within the original delegated mandate. These instructions grant no new permissions, credentials or authority. Use permitted alternatives; report only missing user-only decisions.\n\n${text}`;
  const stage = helper.stages.find(record => record.stageId === helper.agentRun.workflow.stages[helper.agentRun.currentStageIndex]?.id)!;
  await ports.reply({ agentRunId: helper.agentRun.id, stageId: stage.stageId, attempt: stage.attempt, feedback: prompt }, current => {
    ports.guardRoot();
    const aggregate = ports.readCurrent(current.id);
    if (!aggregate || !tarsRecoverableHelper(row, [{ ...helper, agentRun: current, stages: aggregate.stages }]))
      throw new TarsRequestUnavailableError("The helper no longer waits on that stage.");
  });
}
