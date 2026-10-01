import { afterEach, describe, expect, test } from "bun:test";
import {
  buildAutoRouteLineView,
  formatRouteElapsed,
} from "../src/components/session/auto-route-line.utils";
import type { AutoRoutingModelResolution } from "../src/lib/providers/provider.types";
import {
  AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE,
  AUTO_ROUTING_CLASSIFIER_UNAVAILABLE_RATIONALE,
} from "../src/lib/routing/auto-routing";
import {
  beginPendingAutoRoute,
  endPendingAutoRoute,
  updatePendingAutoRoute,
  usePendingAutoRoutingStore,
} from "../src/store/pending-auto-routing-store";
import type { ChatMessage } from "../src/types/chat";

const RESOLUTION: AutoRoutingModelResolution = {
  selectedProviderId: "codex",
  selectedModel: "gpt-5.6-sol",
  source: "classifier",
  rationale: "implement, high complexity, normal risk, new → implement-deep",
  confidence: null,
  taskType: "implementation",
  ruleId: "implement-deep",
  taskClass: "implement",
  stance: "balanced",
  classifierElapsedMs: 2_400,
};

const MESSAGE = {
  providerId: "codex",
  model: "gpt-5.6-sol",
  modelInfo: { effort: "high" },
} satisfies Pick<ChatMessage, "providerId" | "model" | "modelInfo">;

describe("buildAutoRouteLineView", () => {
  test("reads a classifier decision as model, effort, task class and wait", () => {
    const view = buildAutoRouteLineView({ resolution: RESOLUTION, message: MESSAGE });
    expect(view.modelLabel).toContain("High");
    expect(view.taskLabel).toBe("Implement");
    expect(view.fallback).toBeNull();
    expect(view.elapsedLabel).toBe("2.4s");
    expect(view.ranLabel).toBeNull();
    expect(view.description).toContain("with the classifier");
  });

  test("marks a local-rules fallback and tells a skip from an outage", () => {
    const unavailable = buildAutoRouteLineView({
      resolution: {
        ...RESOLUTION,
        source: "classifier_fallback",
        rationale: `${AUTO_ROUTING_CLASSIFIER_UNAVAILABLE_RATIONALE} → fallback`,
      },
      message: MESSAGE,
    });
    expect(unavailable.fallback).toBe("unavailable");
    expect(unavailable.description).toContain("Classifier unavailable");

    const skipped = buildAutoRouteLineView({
      resolution: {
        ...RESOLUTION,
        source: "classifier_fallback",
        rationale: AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE,
      },
      message: MESSAGE,
    });
    expect(skipped.fallback).toBe("skipped");
  });

  test("heuristic routes carry no classifier wait", () => {
    const view = buildAutoRouteLineView({
      resolution: { ...RESOLUTION, source: "heuristic", classifierElapsedMs: undefined },
      message: MESSAGE,
    });
    expect(view.elapsedLabel).toBeNull();
    expect(view.description).toContain("with local rules");
  });

  test("names the model that answered only when it is not the routed one", () => {
    const rerouted = buildAutoRouteLineView({
      resolution: RESOLUTION,
      message: { ...MESSAGE, model: "gpt-6-luna" },
    });
    expect(rerouted.ranLabel).not.toBeNull();
    expect(rerouted.description).toContain("ran on");

    const otherProvider = buildAutoRouteLineView({
      resolution: RESOLUTION,
      message: { providerId: "claude-code", model: "claude-opus-5" },
    });
    expect(otherProvider.ranLabel).not.toBeNull();
  });
});

test("formatRouteElapsed switches from milliseconds to seconds at one second", () => {
  expect(formatRouteElapsed(840)).toBe("840ms");
  expect(formatRouteElapsed(999.6)).toBe("1.0s");
  expect(formatRouteElapsed(12_345)).toBe("12.3s");
  expect(formatRouteElapsed(-5)).toBe("0ms");
});

describe("pending Auto route store", () => {
  const userMessage: ChatMessage = {
    id: "pending-auto-route:turn-1",
    role: "user",
    model: "user",
    providerId: "user",
    content: "refactor the session module",
    parts: [],
  };

  afterEach(() => {
    usePendingAutoRoutingStore.setState({ byTaskId: {} });
  });

  test("one send owns a task's pending row until it ends it", () => {
    expect(
      beginPendingAutoRoute({ id: "turn-1", taskId: "task-a", startedAt: 1, userMessage }),
    ).toBe(true);
    // A second send for the same task cannot take the row over.
    expect(
      beginPendingAutoRoute({ id: "turn-2", taskId: "task-a", startedAt: 2, userMessage }),
    ).toBe(false);
    const entry = usePendingAutoRoutingStore.getState().byTaskId["task-a"];
    expect(entry).toMatchObject({ id: "turn-1", phase: "classifying", skipped: false });

    // Updates and ends from another send are ignored.
    updatePendingAutoRoute({ taskId: "task-a", id: "turn-2", patch: { skipped: true } });
    endPendingAutoRoute({ taskId: "task-a", id: "turn-2" });
    expect(usePendingAutoRoutingStore.getState().byTaskId["task-a"]).toBe(entry);

    updatePendingAutoRoute({
      taskId: "task-a",
      id: "turn-1",
      patch: { phase: "starting", routedLabel: "Opus 5 · High" },
    });
    expect(usePendingAutoRoutingStore.getState().byTaskId["task-a"]).toMatchObject({
      phase: "starting",
      routedLabel: "Opus 5 · High",
    });

    endPendingAutoRoute({ taskId: "task-a", id: "turn-1" });
    expect(usePendingAutoRoutingStore.getState().byTaskId["task-a"]).toBeUndefined();
  });
});
