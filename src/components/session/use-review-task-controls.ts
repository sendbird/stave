import { i18n } from "@/i18n/runtime";
import { useCallback, useMemo } from "react";
import type { LocalChangeReviewRequest } from "@/components/ai-elements/local-change-review-dialog";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { toast } from "@/components/ui";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import { buildModelEffortRuntimeOverrides } from "@/lib/providers/model-effort";
import { isManagedExecutionProviderId } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  resolveReviewModel,
  resolveReviewProvider,
  buildReviewTaskPrompt,
  type ReviewTaskProviderId,
} from "@/lib/reviews/review-task";
import { useAppStore } from "@/store/app.store";
import { selectEffectiveSettings } from "@/store/project-settings-overrides";
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
  const modelClaude = useAppStore(
    (state) => selectEffectiveSettings(state).modelClaude,
  );
  const modelCodex = useAppStore(
    (state) => selectEffectiveSettings(state).modelCodex,
  );
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
              promptSource: review.promptSource,
              presetId: review.presetId,
              customPrompt: review.customPrompt,
              skillSlug: review.skillSlug,
              commitRef: review.commitRef,
              criteria: review.criteria,
              skillOptional: skillOptional && review.promptSource !== "skill",
            },
          });
        const started = await start(review.reviewer, review.effort);
        if (!started.ok) {
          toast.error(i18n.t("session:useReviewTaskControls.copy"), { description: started.error });
          return false;
        }
        // The cross-check is a second, independent review on the other
        // provider; one failing to start does not undo the other.
        const second = review.secondReviewer
          ? await start(review.secondReviewer.reviewer, review.secondReviewer.effort, true)
          : null;
        if (second && !second.ok) {
          toast.error(i18n.t("session:useReviewTaskControls.copy2", { value1: review.secondReviewer!.reviewer.label }), {
            description: second.error,
          });
          return true;
        }
        toast.success(second ? i18n.t("session:useReviewTaskControls.copy3") : i18n.t("session:useReviewTaskControls.copy4"), {
          description: second
            ? i18n.t("session:useReviewTaskControls.description")
            : i18n.t("session:useReviewTaskControls.description2"),
        });
        return true;
      }
      if (review.target === "latest-reply") {
        toast.error(i18n.t("session:useReviewTaskControls.copy5"));
        return false;
      }
      const currentState = useAppStore.getState();
      const skill = review.promptSource === "skill"
        ? getEffectiveSkillEntries({ skills: currentState.skillCatalog.skills, providerId: review.reviewer.providerId })
          .find((entry) => entry.slug === review.skillSlug) : undefined;
      if (review.promptSource === "skill" && !skill) {
        toast.error(i18n.t("session:useReviewTaskControls.chooseSkill"));
        return false;
      }
      const prompt = buildReviewTaskPrompt({
        target: review.target,
        focuses: review.focuses,
        commitRef: review.commitRef,
        savedInstructions: currentState.settings.reviewTask.instructions,
        instructions: review.instructions,
        criteria: review.criteria,
        promptSource: review.promptSource,
        presetId: review.presetId,
        customPrompt: review.customPrompt,
        skill,
      });
      if (!prompt) {
        toast.error(i18n.t("session:useReviewTaskControls.chooseRubricAndTarget"));
        return false;
      }
      const result = await sendUserMessage({
        taskId: activeTaskId,
        content: prompt,
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
        toast.error(i18n.t("session:useReviewTaskControls.copy6"), {
          description: i18n.t("session:useReviewTaskControls.description3"),
        });
        return false;
      }
      return true;
    },
    [activeTaskId, sendUserMessage],
  );

  return { reviewModelOptions, preferredReviewModelKey, handleLocalChangeReview };
}
