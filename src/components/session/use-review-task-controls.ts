import { useCallback, useMemo } from "react";
import type { LocalChangeReviewRequest } from "@/components/ai-elements/local-change-review-dialog";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { toast } from "@/components/ui";
import { buildLocalChangeReviewPrompt } from "@/lib/local-change-review";
import { buildModelEffortRuntimeOverrides } from "@/lib/providers/model-effort";
import { isManagedExecutionProviderId } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  resolveReviewModel,
  resolveReviewProvider,
  type ReviewTaskProviderId,
} from "@/lib/reviews/review-task";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import {
  isReviewTaskDelegationAvailable,
  startReviewTask,
} from "@/store/review-task-runtime";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: readonly ChatMessage[] = [];

function lastAssistantProvider(messages: readonly ChatMessage[]): ReviewTaskProviderId | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "assistant" &&
      (message.providerId === "claude-code" || message.providerId === "codex")
    ) {
      return message.providerId;
    }
  }
  return null;
}

/**
 * The composer's Review control: which reviewers it offers, which one it
 * suggests, and what submitting does. A review runs as its own read-only task
 * (see `review-task-runtime.ts`); a build without the delegation bridge falls
 * back to running it in this conversation.
 */
export function useReviewTaskControls(args: {
  activeTaskId: string;
  activeProvider: ProviderId;
  modelOptions: readonly ModelSelectorOption[];
  sendUserMessage: AppState["sendUserMessage"];
}) {
  const { activeTaskId, sendUserMessage } = args;
  const modelClaude = useAppStore((state) => state.settings.modelClaude);
  const modelCodex = useAppStore((state) => state.settings.modelCodex);
  const reviewSettings = useAppStore((state) => state.settings.reviewTask);
  const lastAssistantProviderId = useAppStore((state) =>
    lastAssistantProvider(state.messagesByTask[activeTaskId] ?? NO_MESSAGES),
  );
  const taskProviderId = isManagedExecutionProviderId(args.activeProvider)
    ? args.activeProvider
    : null;
  const suggestedProvider = resolveReviewProvider({
    preference: reviewSettings.reviewer,
    lastAssistantProviderId,
    taskProviderId,
  });
  const reviewModelOptions = useMemo(
    () =>
      args.modelOptions
        .filter((option) => option.available && !option.isAuto && option.model.trim())
        .filter((option) => isManagedExecutionProviderId(option.providerId))
        .map((option) => {
          const reviewModel = resolveReviewModel({
            providerId: option.providerId === "codex" ? "codex" : "claude-code",
            settings: reviewSettings,
            defaultModelClaude: modelClaude,
            defaultModelCodex: modelCodex,
          });
          // The review model, not the catalog's default, is what a provider
          // switch in the dialog lands on.
          return { ...option, isDefault: option.model === reviewModel };
        }),
    [args.modelOptions, modelClaude, modelCodex, reviewSettings],
  );
  const preferredReviewModelKey = useMemo(() => {
    const reviewModel = resolveReviewModel({
      providerId: suggestedProvider,
      settings: reviewSettings,
      defaultModelClaude: modelClaude,
      defaultModelCodex: modelCodex,
    });
    const ofProvider = reviewModelOptions.filter(
      (option) => option.providerId === suggestedProvider,
    );
    return (
      ofProvider.find((option) => option.model === reviewModel) ??
      ofProvider.find((option) => option.isDefault) ??
      ofProvider[0] ??
      reviewModelOptions[0]
    )?.key;
  }, [modelClaude, modelCodex, reviewModelOptions, reviewSettings, suggestedProvider]);

  const handleLocalChangeReview = useCallback(
    async (review: LocalChangeReviewRequest) => {
      if (isReviewTaskDelegationAvailable()) {
        const start = (
          reviewer: LocalChangeReviewRequest["reviewer"],
          effort: string | undefined,
          skillOptional = false,
        ) =>
          startReviewTask({
            getState: useAppStore.getState,
            taskId: activeTaskId,
            request: {
              reviewer: {
                providerId: reviewer.providerId,
                model: reviewer.model,
                label: reviewer.label,
              },
              effort,
              target: review.target,
              focuses: review.focuses,
              instructions: review.instructions,
              skillSlug: review.skillSlug,
              commitRef: review.commitRef,
              criteria: review.criteria,
              skillOptional,
            },
          });
        const started = await start(review.reviewer, review.effort);
        if (!started.ok) {
          toast.error("Could not start the review", { description: started.error });
          return false;
        }
        // The cross-check is a second, independent review on the other
        // provider; one failing to start does not undo the other.
        const second = review.secondReviewer
          ? await start(review.secondReviewer.reviewer, review.secondReviewer.effort, true)
          : null;
        if (second && !second.ok) {
          toast.error(`Started one review; the ${review.secondReviewer!.reviewer.label} cross-check did not start`, {
            description: second.error,
          });
          return true;
        }
        toast.success(second ? "Two reviews started, one per provider" : "Review started in its own task", {
          description: second
            ? "Their findings appear above the composer when they finish."
            : "Its findings appear above the composer when it finishes.",
        });
        return true;
      }
      if (review.target === "latest-reply") {
        toast.error("Reply reviews need the desktop app.");
        return false;
      }
      const result = await sendUserMessage({
        taskId: activeTaskId,
        content: buildLocalChangeReviewPrompt({
          scope: review.target,
          focuses: review.focuses,
          commitRef: review.commitRef,
          instructions:
            [
              useAppStore.getState().settings.reviewTask.instructions.trim(),
              review.instructions?.trim(),
              review.criteria?.trim()
                ? `Also check the work against these acceptance criteria and report each one not met:\n${review.criteria.trim()}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n") || undefined,
        }),
        providerOverride: review.reviewer.providerId,
        turnOrigin: "utility",
        runtimeOverrides: {
          autoRouting: false,
          model: review.reviewer.model,
          ...buildModelEffortRuntimeOverrides({
            providerId: review.reviewer.providerId,
            model: review.reviewer.model,
            effort: review.effort,
          }),
        },
        preservePromptDraft: true,
      });
      if (result.status === "blocked") {
        toast.error("Could not start local change review", {
          description: "Finish the pending task interaction and try again.",
        });
        return false;
      }
      return true;
    },
    [activeTaskId, sendUserMessage],
  );

  return { reviewModelOptions, preferredReviewModelKey, handleLocalChangeReview };
}
