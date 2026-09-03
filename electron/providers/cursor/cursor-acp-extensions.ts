import { z } from "zod";
import type { BridgeEvent } from "../types";
import { truncateBufferedText } from "../provider-buffering";
import {
  markRecommendedUserInputOptions,
  optionLabelHasRecommendedSuffix,
  readQuestionRecommendPointer,
  readRawOptionRecommended,
  recommendedOptionDefaultValue,
} from "../../../src/lib/user-input-options";

const CURSOR_EXTENSION_TEXT_MAX_BYTES = 64 * 1024;

const CursorTodoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

const CursorRecommendPointerSchema = z
  .union([z.boolean(), z.string(), z.number()])
  .optional();

export const CursorAskQuestionRequestSchema = z.object({
  toolCallId: z.string().min(1),
  title: z.string().optional(),
  questions: z.array(
    z.object({
      id: z.string().min(1),
      prompt: z.string(),
      options: z.array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          recommended: z.unknown().optional(),
          recommend: z.unknown().optional(),
        }),
      ),
      allowMultiple: z.boolean().optional(),
      recommended: CursorRecommendPointerSchema,
      recommend: CursorRecommendPointerSchema,
      recommendedOption: CursorRecommendPointerSchema,
      recommendedIndex: CursorRecommendPointerSchema,
    }),
  ),
});

export const CursorCreatePlanRequestSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().optional(),
  overview: z.string().optional(),
  plan: z.string(),
  todos: z.array(CursorTodoSchema),
  isProject: z.boolean().optional(),
  phases: z
    .array(
      z.object({
        name: z.string(),
        todos: z.array(CursorTodoSchema),
      }),
    )
    .optional(),
});

export const CursorUpdateTodosRequestSchema = z.object({
  toolCallId: z.string().min(1),
  todos: z.array(CursorTodoSchema),
  merge: z.boolean(),
});

export const CursorTaskRequestSchema = z.object({
  toolCallId: z.string().min(1),
  description: z.string(),
  prompt: z.string(),
  subagentType: z.union([
    z.enum([
      "unspecified",
      "computer_use",
      "explore",
      "video_review",
      "browser_use",
      "shell",
      "vm_setup_helper",
    ]),
    z.object({ custom: z.string() }),
  ]),
  model: z.string().optional(),
  agentId: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const CursorGenerateImageRequestSchema = z.object({
  toolCallId: z.string().min(1),
  description: z.string(),
  filePath: z.string().optional(),
  referenceImagePaths: z.array(z.string()).optional(),
});

export type CursorAskQuestionRequest = z.infer<
  typeof CursorAskQuestionRequestSchema
>;
export type CursorCreatePlanRequest = z.infer<
  typeof CursorCreatePlanRequestSchema
>;

function bounded(value: string) {
  return truncateBufferedText({
    value,
    maxBytes: CURSOR_EXTENSION_TEXT_MAX_BYTES,
  });
}

function normalizeTodos(
  todos: z.infer<typeof CursorTodoSchema>[],
): Array<{ content: string; status: "pending" | "in_progress" | "completed" }> {
  return todos.map((todo) => ({
    content: bounded(todo.content),
    status: todo.status === "cancelled" ? "pending" : todo.status,
  }));
}

export function mapCursorAskQuestionEvent(args: {
  requestId: string;
  request: CursorAskQuestionRequest;
}): BridgeEvent {
  return {
    type: "user_input",
    toolName: "AskQuestion",
    requestId: args.requestId,
    questions: args.request.questions.map((question) => {
      const options = markRecommendedUserInputOptions({
        options: question.options.map((option) => ({
          label: bounded(option.label),
          description: "",
          value: option.id,
          ...(readRawOptionRecommended(option) ||
          optionLabelHasRecommendedSuffix(option.label)
            ? { recommended: true }
            : {}),
        })),
        recommend: readQuestionRecommendPointer(question),
      });
      const defaultValue = recommendedOptionDefaultValue({
        options,
        multiSelect: question.allowMultiple === true,
      });
      return {
        key: question.id,
        question: bounded(question.prompt),
        header: bounded(args.request.title?.trim() || "Question"),
        options,
        multiSelect: question.allowMultiple === true,
        allowCustom: false,
        ...(defaultValue ? { defaultValue } : {}),
      };
    }),
  };
}

export function mapCursorCreatePlanEvent(args: {
  requestId: string;
  request: CursorCreatePlanRequest;
}): BridgeEvent {
  return {
    type: "plan_ready",
    planText: bounded(args.request.plan),
    sourceSegmentId: args.request.toolCallId,
    review: {
      requestId: args.requestId,
      responseMode: "blocking",
    },
  };
}

export function mapCursorTodoEvent(params: unknown): BridgeEvent | null {
  const parsed = CursorUpdateTodosRequestSchema.safeParse(params);
  if (!parsed.success) {
    return null;
  }
  return {
    type: "tool",
    toolUseId: parsed.data.toolCallId,
    toolName: "TodoWrite",
    input: JSON.stringify({ todos: normalizeTodos(parsed.data.todos) }),
    state: parsed.data.todos.every(
      (todo) => todo.status === "completed" || todo.status === "cancelled",
    )
      ? "output-available"
      : "input-available",
  };
}

export function mapCursorTaskEvent(params: unknown): BridgeEvent | null {
  const parsed = CursorTaskRequestSchema.safeParse(params);
  if (!parsed.success) {
    return null;
  }
  return {
    type: "subagent_progress",
    toolUseId: parsed.data.toolCallId,
    content: bounded(parsed.data.description),
    ...(parsed.data.agentId ? { agentId: parsed.data.agentId } : {}),
  };
}

export function mapCursorGenerateImageEvent(
  params: unknown,
): BridgeEvent | null {
  const parsed = CursorGenerateImageRequestSchema.safeParse(params);
  if (!parsed.success) {
    return null;
  }
  const location = parsed.data.filePath
    ? ` Output path: ${parsed.data.filePath}`
    : "";
  return {
    type: "system",
    content: bounded(`Generated image: ${parsed.data.description}.${location}`),
  };
}

export function buildCursorQuestionResponse(args: {
  request: CursorAskQuestionRequest;
  answers?: Record<string, string>;
  denied?: boolean;
}) {
  if (args.denied) {
    return { outcome: { outcome: "skipped" as const } };
  }
  const answers = args.request.questions.map((question) => ({
    questionId: question.id,
    selectedOptionIds: (args.answers?.[question.id] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) =>
        question.options.some((option) => option.id === value),
      ),
  }));
  return { outcome: { outcome: "answered" as const, answers } };
}

export function buildCursorPlanResponse(args: {
  approved: boolean;
  reason?: string;
}) {
  if (args.approved) {
    return { outcome: { outcome: "accepted" as const } };
  }
  const reason = args.reason?.trim();
  return reason
    ? { outcome: { outcome: "rejected" as const, reason: bounded(reason) } }
    : { outcome: { outcome: "cancelled" as const } };
}
