import type { UserInputQuestion } from "@/types/chat";

/**
 * Request-id prefix of a Codex async question card. The rest of the id is the
 * `agentMessage` item id, which is also the `segmentId` of the text part that
 * renders the same questions as plain text.
 */
export const CODEX_ASYNC_QUESTION_REQUEST_PREFIX = "codex-async:";

/** The text segment that repeats an async question card, if it has one. */
export function asyncQuestionTextSegmentId(part: { requestId: string; delivery?: "async" }) {
  return part.delivery === "async" && part.requestId.startsWith(CODEX_ASYNC_QUESTION_REQUEST_PREFIX)
    ? part.requestId.slice(CODEX_ASYNC_QUESTION_REQUEST_PREFIX.length)
    : null;
}

/**
 * Text of the user message that answers an asynchronous provider question.
 *
 * The question did not pause the provider, so the answer travels as an
 * ordinary user message. Each question is quoted above its answer so the
 * provider can match them and the message reads naturally in the transcript.
 * This is model-facing text and stays untranslated.
 */
export function formatAsyncQuestionAnswer(args: {
  questions: UserInputQuestion[];
  answers?: Record<string, string>;
  denied?: boolean;
}): string {
  return args.questions
    .map((question) => {
      const key = question.key?.trim() || question.question;
      const answer = args.denied
        ? ""
        : (args.answers?.[key] ?? args.answers?.[question.question] ?? "").trim();
      const quoted = question.question
        .trim()
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n");
      // i18n-ignore: model-facing answer text
      const reply = answer || (args.denied ? "Declined to answer." : "No answer.");
      return `${quoted}\n\n${reply}`;
    })
    .join("\n\n");
}
