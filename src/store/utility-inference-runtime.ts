import {
  buildSuggestTaskNamePayload,
  normalizeSuggestedTaskTitle,
  shouldSuggestTaskName,
} from "@/lib/tasks";
import type { UtilityInferenceContext } from "@/lib/providers/utility-inference";
import {
  reportUtilityInferenceError,
  reportUtilityInferenceOutcome,
} from "@/lib/providers/utility-inference-notice";
import type {
  AutoRoutingClassifierRequest,
  AutoRoutingClassifierResult,
} from "@/store/auto-routing";
import type { ChatMessage, Task } from "@/types/chat";

export function createUtilityRouteClassifier(args: {
  context: UtilityInferenceContext;
}):
  | ((
      request: AutoRoutingClassifierRequest,
    ) => Promise<AutoRoutingClassifierResult | null>)
  | undefined {
  const classifyRoute = window.api?.provider?.classifyRoute;
  if (!classifyRoute) {
    reportUtilityInferenceError({
      feature: "route-classification",
      error: "Route-classification bridge unavailable.",
    });
    return undefined;
  }

  return async (request) => {
    try {
      const result = await classifyRoute({
        ...args.context,
        prompt: request.prompt,
        history: request.history.map((message) => ({
          role: message.role,
          content: message.content,
          providerId:
            message.providerId === "claude-code" ||
            message.providerId === "codex"
              ? message.providerId
              : undefined,
          model: message.model,
        })),
        fileContextCount: request.fileContextCount,
      });
      reportUtilityInferenceOutcome({
        feature: "route-classification",
        ok: result.ok,
        utility: result.utility,
      });
      return result.ok && result.classification
        ? { ...result.classification }
        : null;
    } catch (error) {
      reportUtilityInferenceError({
        feature: "route-classification",
        error,
      });
      return null;
    }
  };
}

export function maybeSuggestUtilityTaskName(args: {
  task: Task | undefined;
  priorUserTurnCount: number;
  prompt: string;
  history: ChatMessage[];
  context: UtilityInferenceContext;
  onTitle: (title: string) => void;
}) {
  if (
    !shouldSuggestTaskName({
      task: args.task,
      priorUserTurnCount: args.priorUserTurnCount,
    })
  ) {
    return;
  }

  const suggestTaskName = window.api?.provider?.suggestTaskName;
  if (!suggestTaskName) {
    reportUtilityInferenceError({
      feature: "task-name",
      error: "Task-name inference bridge unavailable.",
    });
    return;
  }

  void suggestTaskName({
    ...args.context,
    ...buildSuggestTaskNamePayload({
      prompt: args.prompt,
      history: args.history,
    }),
  })
    .then((result) => {
      reportUtilityInferenceOutcome({
        feature: "task-name",
        ok: result.ok,
        utility: result.utility,
      });
      const safeTitle =
        result.ok && result.title
          ? normalizeSuggestedTaskTitle({ title: result.title })
          : null;
      if (safeTitle) {
        args.onTitle(safeTitle);
      }
    })
    .catch((error) => {
      reportUtilityInferenceError({ feature: "task-name", error });
    });
}
