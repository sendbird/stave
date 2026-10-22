import { z } from "zod";
import { i18n } from "@/i18n/runtime";
import type { UserInputQuestion } from "@/types/chat";
import { getUserInputAnswerKey } from "@/lib/user-input-answers";

/** A self-contained authorship snapshot; it never depends on loading the source card. */
export const QuestionReplySchema = z.object({
  requestId: z.string().min(1).max(200),
  sourceMessageId: z.string().max(200).optional(),
  questions: z.array(z.object({
    header: z.string().max(200),
    question: z.string().max(5000),
    answer: z.string().max(500_000),
  }).strict()).min(1).max(20),
  denied: z.boolean().optional(),
}).strict();

export type QuestionReply = z.infer<typeof QuestionReplySchema>;

export function buildQuestionReply(args: {
  requestId: string;
  sourceMessageId?: string;
  questions: UserInputQuestion[];
  answers?: Record<string, string>;
  denied?: boolean;
}): QuestionReply {
  return {
    requestId: args.requestId,
    ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
    ...(args.denied ? { denied: true } : {}),
    questions: args.questions.map((question) => ({
      header: question.header,
      question: question.question,
      answer: args.denied ? "" : (args.answers?.[getUserInputAnswerKey(question)]
        ?? args.answers?.[question.question] ?? "").trim(),
    })),
  };
}

export function questionReplyAnswerText(reply: QuestionReply): string {
  return reply.questions.map(({ answer }) => answer).filter(Boolean).join("\n\n");
}

export function questionReplyDisplayText(reply: QuestionReply): string {
  if (reply.questions.length === 1) return questionReplyAnswerText(reply);
  return reply.questions.map(({ header, answer }, index) => answer
    ? `${header.trim() || i18n.t("session:questionReply.questionNumber", { count: index + 1 })}\n${answer}`
    : "").filter(Boolean).join("\n\n");
}

/** Presentation only: the provider still receives the complete original content. */
export function questionReplyPresentation(reply: QuestionReply) {
  const displayContent = questionReplyDisplayText(reply);
  return { questionReply: reply, displayContent, displayParts: [{ type: "text" as const, text: displayContent }] };
}
