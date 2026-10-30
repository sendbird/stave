import { readUserInputAnswer } from "../../src/lib/user-input-answers";
import { parseClaudeQuestionList } from "./claude-user-input";

const UNANSWERED_CAPABILITY = "ask_user_question_unanswered_v1";

/** Each query must negotiate with its own current native session. */
export function createClaudeQuestionCapabilityTracker() {
  let sessionId: string | null = null;
  let supportsUnanswered = false;
  return {
    observeInit(init: { session_id?: unknown; capabilities?: unknown }) {
      sessionId = typeof init.session_id === "string" && init.session_id.trim()
        ? init.session_id
        : null;
      supportsUnanswered = Boolean(sessionId) && Array.isArray(init.capabilities)
        && init.capabilities.includes(UNANSWERED_CAPABILITY);
    },
    captureSupportedSession(): string | null {
      return supportsUnanswered ? sessionId : null;
    },
    supportsSession(capturedSessionId: string | null): boolean {
      return Boolean(capturedSessionId) && capturedSessionId === sessionId && supportsUnanswered;
    },
  };
}

/**
 * Only host-observed omissions become annotations. Neither model-supplied
 * annotations nor an unclassified dismissal may speak for the user's intent.
 */
export function buildClaudeQuestionAnswerInput(args: {
  normalizedInput: Record<string, unknown>;
  answers?: Record<string, string>;
  supportsUnanswered?: boolean;
}): Record<string, unknown> {
  const updatedInput: Record<string, unknown> = { ...args.normalizedInput, answers: args.answers ?? {} };
  delete updatedInput.annotations;
  if (!args.supportsUnanswered) return updatedInput;

  const answers = new Map(Object.entries(args.answers ?? {}));
  const annotations: Array<[string, { unanswered: "skipped" }]> = [];
  const questions = parseClaudeQuestionList({ input: args.normalizedInput });
  const questionKeys = new Set(questions.map((question) => question.question));
  questions.forEach((question, index) => {
    // A legacy alias must not consume a different question's canonical answer.
    const questionAnswers = Object.fromEntries([...answers].filter(([key]) => key === question.question || !questionKeys.has(key)));
    const answer = readUserInputAnswer({ answers: questionAnswers, question, index });
    if (typeof answer === "string" && answer.trim()) {
      // New cards already use question text; legacy header/position keys must
      // not make an answered question look skipped to the native tool.
      answers.set(question.question, answer);
    } else {
      annotations.push([question.question, { unanswered: "skipped" }]);
    }
  });
  return {
    ...updatedInput,
    answers: Object.fromEntries(answers),
    ...(annotations.length > 0 ? { annotations: Object.fromEntries(annotations) } : {}),
  };
}
