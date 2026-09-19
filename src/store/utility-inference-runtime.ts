import { boundRouteIntentInput, ROUTE_INTENT_VERSION, RouteIntentResultSchema } from "@/lib/providers/route-intent";
import {
  buildSuggestTaskNamePayload,
  normalizeSuggestedTaskTitle,
  shouldSuggestTaskName,
} from "@/lib/tasks";
import { resolveRouteClassificationTarget, type UtilityInferenceContext } from "@/lib/providers/utility-inference";
import type { AuxLaneRuntime } from "@/lib/providers/auxiliary-inference-policy";
import {
  reportUtilityInferenceError,
  reportUtilityInferenceOutcome,
} from "@/lib/providers/utility-inference-notice";
import type {
  AutoRoutingClassifierRequest,
  AutoRoutingClassifierResult,
} from "@/store/auto-routing";
import type { ChatMessage, Task } from "@/types/chat";
import { isAccountUsageBlockingFromState } from "@/store/account-usage-guard";
import { useAppStore } from "@/store/app.store";

const routeCache = new Map<string, { result: AutoRoutingClassifierResult; expiresAt: number }>();

export function createUtilityRouteClassifier(args: {
  cacheScope?: string;
  context: UtilityInferenceContext;
}):
  | ((
      request: AutoRoutingClassifierRequest,
      signal?: AbortSignal,
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

  return async (request, signal) => {
    if (signal?.aborted) return null;
    const input = boundRouteIntentInput(request);
    const target = resolveRouteClassificationTarget(args.context);
    const cacheKey = JSON.stringify([args.cacheScope, ROUTE_INTENT_VERSION, target.providerId, target.model, input]);
    const cached = args.cacheScope ? routeCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const requestId = crypto.randomUUID();
    const cancel = () => { void window.api?.provider?.cancelRouteClassification?.({ requestId }).catch(() => {}); };

    if (
      isAccountUsageBlockingFromState({
        providerId: target.providerId,
        model: target.model,
        state: useAppStore.getState(),
      })
    ) {
      return null;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) return null;
      const result = await classifyRoute({ ...args.context, ...input, requestId });
      if (signal?.aborted) return null;
      reportUtilityInferenceOutcome({
        feature: "route-classification",
        ok: result.ok,
        utility: result.utility,
      });
      const parsed = RouteIntentResultSchema.safeParse(result.classification);
      if (!result.ok || !parsed.success) return null;
      if (args.cacheScope) {
        routeCache.set(cacheKey, { result: parsed.data, expiresAt: Date.now() + 60_000 });
        if (routeCache.size > 64) routeCache.delete(routeCache.keys().next().value!);
      }
      return parsed.data;
    } catch (error) {
      reportUtilityInferenceError({
        feature: "route-classification",
        error,
      });
      return null;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  };
}

export function maybeSuggestUtilityTaskName(args: {
  task: Task | undefined;
  priorUserTurnCount: number;
  prompt: string;
  history: ChatMessage[];
  context: UtilityInferenceContext;
  /** Background AI `taskName` lane; absent keeps the built-in defaults. */
  lane?: AuxLaneRuntime;
  onTitle: (title: string) => void;
}) {
  if (args.lane && !args.lane.enabled) {
    return;
  }
  if (
    args.lane &&
    isAccountUsageBlockingFromState({
      providerId: args.lane.providerId,
      model: args.lane.model,
      state: useAppStore.getState(),
    })
  ) {
    return;
  }
  if (
    !shouldSuggestTaskName({
      task: args.task,
      priorUserTurnCount: args.priorUserTurnCount,
      ...(args.lane?.config.maxUserTurns !== undefined
        ? { maxUserTurns: args.lane.config.maxUserTurns }
        : {}),
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
