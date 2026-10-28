import { toast } from "@/components/ui";
import { i18n } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import {
  sendWithApprovalRedirect,
  type ApprovalRedirectMode,
} from "@/store/approval-redirect-send";
import { isAutoRoutingUnavailableForSend } from "@/store/auto-routing-dispatch";
import { EMPTY_PROMPT_DRAFT } from "./chat-input.utils";
import { findPendingApprovals } from "@/store/provider-message.utils";

/**
 * Send the composer text after declining the task's pending approvals. The
 * draft stays in the composer until the message is delivered; a failed decline
 * or a draft edited meanwhile sends nothing.
 */
export async function submitApprovalRedirect(args: {
  mode: ApprovalRedirectMode;
  taskId: string;
  text: string;
  imageContexts?: Array<{ dataUrl: string; label: string; mimeType: string }>;
  isDraftCurrent: () => boolean;
  clearDraft: () => void;
}): Promise<void> {
  const store = useAppStore.getState;
  const outcome = await sendWithApprovalRedirect({
    preferSteer: args.mode === "steer",
    readPendingApprovals: () =>
      findPendingApprovals({
        messages: store().messagesByTask[args.taskId] ?? [],
      }).map(({ messageId, part }) => ({
        messageId,
        requestId: part.requestId,
      })),
    decline: ({ messageId, requestId }) =>
      store().resolveApproval({
        taskId: args.taskId,
        messageId,
        requestId,
        approved: false,
        onUnanswerable: "close",
      }),
    isDraftCurrent: args.isDraftCurrent,
    queueRefusal: () =>
      isAutoRoutingUnavailableForSend({
        promptDraft: store().promptDraftByTask[args.taskId] ?? EMPTY_PROMPT_DRAFT,
        autoRoutingEnabled: store().settings.autoRoutingEnabled,
        steeringActiveTurn: false,
      })
        ? { status: "blocked", reason: "auto-routing-disabled" }
        : null,
    send: ({ intent, declinePendingApprovals }) =>
      store().sendUserMessage({
        taskId: args.taskId,
        content: args.text,
        imageContexts: args.imageContexts,
        submitIntent: intent,
        turnOrigin: "conversation",
        ...(declinePendingApprovals ? { declinePendingApprovals } : {}),
      }),
  });
  switch (outcome.kind) {
    case "delivered":
      args.clearDraft();
      if (args.mode === "steer" && outcome.via === "queued") {
        toast.message(i18n.t("session:chatInputComposer.approvalRedirectQueued"), {
          description: i18n.t("session:chatInputComposer.approvalRedirectQueuedDescription"),
        });
      }
      return;
    case "parked":
      // The failed outgoing bubble holds the text and attachments now.
      args.clearDraft();
      return;
    case "decline-failed":
      toast.error(i18n.t("session:chatInputComposer.approvalRedirectDeclineFailed"), {
        description: i18n.t("session:chatInputComposer.approvalRedirectDeclineFailedDescription", {
          reason: outcome.message,
        }),
      });
      return;
    case "draft-changed":
      toast.message(i18n.t("session:chatInputComposer.approvalRedirectDraftChanged"), {
        description: i18n.t("session:chatInputComposer.approvalRedirectDraftChangedDescription"),
      });
      return;
    case "delivery-unknown":
      toast.warning(i18n.t("session:chatInputComposer.copy3"), {
        description: outcome.message,
      });
      return;
    case "not-sent":
      // The send path explains its own refusals; this one was checked first
      // so the approvals stay pending.
      if (outcome.result.status === "blocked" && outcome.result.reason === "auto-routing-disabled") {
        toast.warning(i18n.t("notifications:appStoreSendUserMessage.staveAutoIsUnavailable"), {
          description: i18n.t(
            "notifications:appStoreSendUserMessage.staveAutoIsTurnedOffEnableItInSettingsOrChooseAProviderModelBeforeSending",
          ),
        });
      }
      return;
  }
}
