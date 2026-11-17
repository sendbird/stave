import { z } from "zod";

const QuestionSchema = z.object({
  key: z.string().optional(), question: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string().optional() }).passthrough()),
  multiSelect: z.boolean().optional(), inputType: z.string().optional(),
}).passthrough();
type Response = { type: "approval"; approved: boolean } | { type: "answer"; answers: Record<string, string> };
export interface NativeNotificationRequest {
  workspaceId: string; taskId: string; turnId: string; requestId: string; messageId: string;
  kind: "approval" | "question";
  buttons: Array<{ label: string; response: Response }>;
  replyKey?: string;
}
interface NotificationSource {
  id: string; kind: string; workspaceId: string | null; taskId: string | null;
  turnId: string | null; resolvedAt?: string | null;
  action: { requestId: string; messageId?: string | null } | null;
  payload: Record<string, unknown>;
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
    { label: "allowOnce", response: { type: "approval", approved: true } },
    { label: "deny", response: { type: "approval", approved: false } },
  ] };
  if (row.payload.delivery === "async") return null;
  const questions = z.array(QuestionSchema).safeParse(row.payload.questions);
  if (!questions.success || questions.data.length !== 1) return null;
  const question = questions.data[0]!;
  if (question.multiSelect || question.inputType === "url_notice") return null;
  const key = question.key ?? question.question;
  if (!key) return null;
  const buttons = question.options.length <= 3 ? question.options.map(option => ({
    label: option.label, response: { type: "answer" as const, answers: { [key]: option.value ?? option.label } },
  })) : [];
  return { ...base, kind: "question", buttons, ...(buttons.length === 0 ? { replyKey: key } : {}) };
}

/** One claim per message/request, shared by all notifications for that request. */
export function createNativeNotificationActionResponder(ports: {
  isEnabled: () => boolean;
  isPending: (request: NativeNotificationRequest) => Promise<boolean>;
  respondApproval: (args: { workspaceId: string; taskId: string; requestId: string; expectedMessageId: string; approved: boolean }) => Promise<{ ok: boolean }>;
  respondUserInput: (args: { workspaceId: string; taskId: string; requestId: string; expectedMessageId: string; answers: Record<string, string> }) => Promise<{ ok: boolean }>;
  alreadyAnswered: () => void;
  resolved?: (request: NativeNotificationRequest, response: Response) => void;
}) {
  const claimed = new Set<string>();
  return async (request: NativeNotificationRequest, response: Response) => {
    if (!ports.isEnabled()) return;
    const key = JSON.stringify([request.workspaceId, request.taskId, request.messageId, request.requestId]);
    if (claimed.has(key)) return;
    claimed.add(key);
    if (claimed.size > 2048) claimed.delete(claimed.values().next().value!);
    try {
      if (!await ports.isPending(request)) { ports.alreadyAnswered(); return; }
      if (!ports.isEnabled()) { claimed.delete(key); return; }
      const target = { workspaceId: request.workspaceId, taskId: request.taskId, requestId: request.requestId, expectedMessageId: request.messageId };
      const result = response.type === "approval"
        ? await ports.respondApproval({ ...target, approved: response.approved })
        : await ports.respondUserInput({ ...target, answers: response.answers });
      if (!result.ok) ports.alreadyAnswered();
      else ports.resolved?.(request, response);
    } catch {
      ports.alreadyAnswered();
    }
  };
}
