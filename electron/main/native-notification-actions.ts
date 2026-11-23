import { ProviderDecisionDeliveryError } from "../providers/provider-decision-delivery-error";
import { z } from "zod";
import { encodeUserInputSelection, getUserInputAnswerKey } from "../../src/lib/user-input-answers";

const QuestionSchema = z.object({
  key: z.string().optional(), question: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string().optional() }).passthrough()),
  multiSelect: z.boolean().optional(), inputType: z.string().optional(),
  allowCustom: z.boolean().optional(),
}).passthrough();
type Response =
  | { type: "approval"; approved: boolean }
  | { type: "answer"; answers: Record<string, string> }
  /** Opens the task so the user reviews the request in Stave. */
  | { type: "open" };
type ReplyInputType = "text" | "number" | "integer";
export interface NativeNotificationRequest {
  workspaceId: string; taskId: string; turnId: string; requestId: string; messageId: string;
  kind: "approval" | "question";
  buttons: Array<{ label: string; response: Response }>;
  /** A typed answer the question accepts; absent when it accepts none. */
  reply?: { key: string; inputType: ReplyInputType };
}
interface NotificationSource {
  id: string; kind: string; workspaceId: string | null; taskId: string | null;
  turnId: string | null; resolvedAt?: string | null;
  action: { requestId: string; messageId?: string | null } | null;
  payload: Record<string, unknown>;
}

/**
 * The longest request text the macOS banner shows without cutting it off.
 * A longer command or description could hide what Allow would run, so such a
 * request is only opened for review.
 */
export const NOTIFICATION_ALLOW_MAX_TEXT_LENGTH = 80;

/** Whether the banner shows the whole request and nothing marks it risky. */
function canAllowFromBanner(payload: Record<string, unknown>) {
  if (payload.risk != null) return false;
  const toolName = typeof payload.toolName === "string" ? payload.toolName : "";
  const description = typeof payload.description === "string" ? payload.description : "";
  if (!description.trim()) return false;
  return `${toolName}: ${description}`.length <= NOTIFICATION_ALLOW_MAX_TEXT_LENGTH;
}

/** Build choices from the stored request, never renderer-supplied action labels. */
export function buildNativeNotificationRequest(row: NotificationSource): NativeNotificationRequest | null {
  if (row.resolvedAt || !row.workspaceId || !row.taskId || !row.turnId) return null;
  const approval = row.kind === "task.approval_requested";
  if (!approval && row.kind !== "task.user_input_requested") return null;
  const requestId = approval ? row.action?.requestId : row.payload.requestId;
  const messageId = approval ? row.action?.messageId : row.payload.messageId;
  if (typeof requestId !== "string" || typeof messageId !== "string") return null;
  const base = { workspaceId: row.workspaceId, taskId: row.taskId, turnId: row.turnId, requestId, messageId };
  if (approval) return { ...base, kind: "approval", buttons: [
    canAllowFromBanner(row.payload)
      ? { label: "allowOnce", response: { type: "approval", approved: true } }
      : { label: "openToReview", response: { type: "open" } },
    { label: "deny", response: { type: "approval", approved: false } },
  ] };
  if (row.payload.delivery === "async") return null;
  const questions = z.array(QuestionSchema).safeParse(row.payload.questions);
  if (!questions.success || questions.data.length !== 1) return null;
  const question = questions.data[0]!;
  if (question.multiSelect || question.inputType === "url_notice") return null;
  const key = getUserInputAnswerKey(question);
  if (!key) return null;
  const buttons = question.options.length > 0 && question.options.length <= 3 ? question.options.map(option => ({
    label: option.label, response: { type: "answer" as const, answers: { [key]: encodeUserInputSelection([option.value ?? option.label]) } },
  })) : [];
  if (buttons.length > 0) return { ...base, kind: "question", buttons };
  // A typed answer only where the in-app card offers a text field.
  const inputType = question.inputType ?? "text";
  const typed = question.allowCustom !== false && (inputType === "text" || inputType === "number" || inputType === "integer");
  if (!typed) return null;
  return { ...base, kind: "question", buttons: [], reply: { key, inputType } };
}

const NUMBER_PATTERN = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** The answer a typed reply sends, or null when the question would not accept it. */
export function buildNativeReplyResponse(request: NativeNotificationRequest, reply: unknown): Response | null {
  if (!request.reply || typeof reply !== "string") return null;
  const value = reply.trim();
  if (!value || value.length > 100_000) return null;
  if (request.reply.inputType !== "text") {
    if (!NUMBER_PATTERN.test(value) || !Number.isFinite(Number(value))) return null;
    if (request.reply.inputType === "integer" && !Number.isInteger(Number(value))) return null;
  }
  return { type: "answer", answers: { [request.reply.key]: value } };
}

/** "answered" means the request was answered elsewhere or expired; "unavailable", that it could not be checked. */
export type NativeNotificationPendingState = "pending" | "answered" | "unavailable";

/** One claim per message/request, shared by all notifications for that request. */
export function createNativeNotificationActionResponder(ports: {
  isEnabled: () => boolean;
  isPending: (request: NativeNotificationRequest) => Promise<NativeNotificationPendingState>;
  respondApproval: (args: { workspaceId: string; taskId: string; requestId: string; expectedMessageId: string; approved: boolean }) => Promise<{ ok: boolean }>;
  respondUserInput: (args: { workspaceId: string; taskId: string; requestId: string; expectedMessageId: string; answers: Record<string, string> }) => Promise<{ ok: boolean }>;
  alreadyAnswered: () => void;
  alreadyAnswering: () => void;
  /** The answer may not have reached the task; the user should answer in Stave. */
  couldNotAnswer: () => void;
  resolved?: (request: NativeNotificationRequest, response: Response) => void;
}) {
  const claimed = new Set<string>();
  return async (request: NativeNotificationRequest, response: Response) => {
    if (!ports.isEnabled() || response.type === "open") return;
    const key = JSON.stringify([request.workspaceId, request.taskId, request.messageId, request.requestId]);
    if (claimed.has(key)) return;
    claimed.add(key);
    if (claimed.size > 2048) claimed.delete(claimed.values().next().value!);
    // A failure releases the claim, so the request can still be answered.
    const fail = () => { claimed.delete(key); ports.couldNotAnswer(); };
    try {
      const pending = await ports.isPending(request);
      if (pending === "answered") { ports.alreadyAnswered(); return; }
      if (pending !== "pending") { fail(); return; }
      if (!ports.isEnabled()) { claimed.delete(key); return; }
      const target = { workspaceId: request.workspaceId, taskId: request.taskId, requestId: request.requestId, expectedMessageId: request.messageId };
      const result = response.type === "approval"
        ? await ports.respondApproval({ ...target, approved: response.approved })
        : await ports.respondUserInput({ ...target, answers: response.answers });
      if (!result.ok) fail();
      else ports.resolved?.(request, response);
    } catch (error) {
      if (error instanceof ProviderDecisionDeliveryError) {
        if (error.reason === "already-answered") {
          ports.alreadyAnswered();
          return;
        }
        if (error.reason === "already-answering") {
          claimed.delete(key);
          ports.alreadyAnswering();
          return;
        }
      } else if (await ports.isPending(request).catch(() => "unavailable") === "answered") {
        // The card may have been resolved between the preflight and the
        // host's own pending-message check.
        ports.alreadyAnswered();
        return;
      }
      fail();
    }
  };
}
