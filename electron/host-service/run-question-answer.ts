import { i18n } from "../../src/i18n/runtime";
import type { AgentRunStageIdentity } from "../../src/lib/agent-runs/domain";
import type { UserInputPart } from "../../src/types/chat";
import { runQuestionStage } from "../../src/lib/agent-runs/persistent-question";
import { formatAsyncQuestionAnswer } from "../../src/lib/async-question-answer";

export interface RunQuestionAnswer {
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}

type Answerer = (args: { workspaceId: string; taskId: string; stage: AgentRunStageIdentity; prompt: string; questionAnswer: RunQuestionAnswer }) => Promise<void>;
let answerer: Answerer | null = null;
export function setRunQuestionAnswerer(value: Answerer | null) { answerer = value; }

export async function answerRunQuestion(args: RunQuestionAnswer & { workspaceId: string; taskId: string; part: UserInputPart }) {
  const stage = runQuestionStage(args.requestId);
  if (!stage || !answerer) throw new Error(i18n.t("agentRuns:persistentQuestion.unavailable"));
  await answerer({ workspaceId: args.workspaceId, taskId: args.taskId, stage,
    prompt: formatAsyncQuestionAnswer({ questions: args.part.questions, answers: args.answers, denied: args.denied }),
    questionAnswer: { requestId: args.requestId, answers: args.answers, denied: args.denied } });
}
