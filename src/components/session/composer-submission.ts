import { toast } from "@/components/ui";
import { i18n } from "@/i18n";
import type { ApprovalRedirectMode } from "@/store/approval-redirect-send";
import { useAppStore } from "@/store/app.store";
import { submitApprovalRedirect } from "./approval-redirect-submit";

export interface ComposerDraftText {
  taskId: string;
  text: string;
}

/** The draft a composer submit captured, checked against what the editor shows now. */
export interface SubmittedDraft {
  /** The editor still shows the submitted text on the submitted task. */
  isCurrent: () => boolean;
  /** Empty the editor, unless the user has typed or switched task since. */
  clear: () => void;
  /** Put the submitted text back, but only into an empty editor on its task. */
  restore: () => void;
}

/**
 * Track one submitted draft. A send may finish after the user has typed again
 * or switched task, so clearing or restoring the draft first checks what the
 * editor shows now.
 */
export function trackSubmittedDraft(args: {
  submitted: ComposerDraftText;
  readCurrent: () => ComposerDraftText;
  replace: (draft: ComposerDraftText) => void;
}): SubmittedDraft {
  const { submitted } = args;
  const isCurrent = () => {
    const current = args.readCurrent();
    return current.taskId === submitted.taskId && current.text === submitted.text;
  };
  return {
    isCurrent,
    clear: () => {
      if (!isCurrent()) {
        return;
      }
      args.replace({ taskId: submitted.taskId, text: "" });
    },
    restore: () => {
      const current = args.readCurrent();
      if (current.taskId !== submitted.taskId || current.text !== "") {
        return;
      }
      args.replace(submitted);
    },
  };
}

/**
 * Send a composer submission and settle its draft by the outcome. While
 * approvals wait, the redirect declines them first and keeps the draft until
 * the message is delivered. Otherwise the message goes out now: an accepted
 * steer clears the draft, and a refused send or steer restores it.
 */
export async function sendComposerSubmission(args: {
  taskId: string;
  text: string;
  intent?: "steer" | "queue";
  imageContexts: Array<{ dataUrl: string; label: string; mimeType: string }>;
  approvalRedirectMode: ApprovalRedirectMode | null;
  draft: SubmittedDraft;
  clearLensAnnotations: () => void;
}): Promise<void> {
  const imageContexts =
    args.imageContexts.length > 0 ? args.imageContexts : undefined;
  if (args.approvalRedirectMode) {
    return submitApprovalRedirect({
      mode: args.approvalRedirectMode,
      taskId: args.taskId,
      text: args.text,
      imageContexts,
      isDraftCurrent: args.draft.isCurrent,
      clearDraft: () => {
        args.clearLensAnnotations();
        args.draft.clear();
      },
    });
  }
  args.clearLensAnnotations();
  const result = await useAppStore.getState().sendUserMessage({
    taskId: args.taskId,
    content: args.text,
    imageContexts,
    submitIntent: args.intent,
    turnOrigin: "conversation",
  });
  if (result.status === "steered") {
    args.draft.clear();
  } else if (result.status === "blocked") {
    args.draft.restore();
  } else if (result.status === "steer-unavailable") {
    // Explicit steer request failed — restore the draft instead of silently
    // queueing it, so the user can see what happened and choose (edit and
    // retry, or press Tab to queue).
    args.draft.restore();
    toast.error(i18n.t("session:chatInputComposer.copy2"), {
      description: result.message,
    });
  } else if (result.status === "steer-delivery-unknown") {
    toast.warning(i18n.t("session:chatInputComposer.copy3"), {
      description: result.message,
    });
  }
}
