import { describe, expect, test } from "bun:test";

import { usageTone } from "../src/components/layout/status-bar-usage-strip.utils";
import { conversationContextUsageTone } from "../src/components/ai-elements/prompt-input.utils";
import {
  USAGE_THRESHOLDS,
  usageThresholdFrom,
  usageThresholdTone,
} from "../src/lib/usage/usage-thresholds";

describe("shared usage thresholds", () => {
  test("quota warns from 80% and binds from 97%", () => {
    expect(usageThresholdFrom("quota", "warning")).toBe(80);
    expect(usageThresholdFrom("quota", "danger")).toBe(97);
    expect(usageThresholdTone("quota", 79.9, "neutral")).toBe("neutral");
    expect(usageThresholdTone("quota", 80, "neutral")).toBe("warning");
    expect(usageThresholdTone("quota", 97, "neutral")).toBe("danger");
  });

  test("the context window keeps its own 60/85 entry", () => {
    expect(USAGE_THRESHOLDS.context.map((step) => step.from)).toEqual([60, 85]);
    expect(usageThresholdTone("context", 59.9, "success")).toBe("success");
    expect(usageThresholdTone("context", 60, "success")).toBe("warning");
    expect(usageThresholdTone("context", 85, "success")).toBe("danger");
  });

  test("a reading that is not a number takes the fallback", () => {
    expect(usageThresholdTone("quota", Number.NaN, "neutral")).toBe("neutral");
    expect(usageThresholdTone("context", Number.NaN, "success")).toBe("success");
  });

  test("the status bar strip and the Usage view colour the same quota reading the same", () => {
    // Usage view: neutral below warning; status bar: success below warning.
    // The warning and danger points must match.
    for (const percent of [0, 59, 60, 70, 79, 80, 88, 90, 96, 97, 100]) {
      const usageView = usageThresholdTone("quota", percent, "neutral");
      const statusBar = usageTone(percent);
      expect(statusBar === "success" ? "neutral" : statusBar).toBe(usageView);
    }
  });

  test("the composer context meter reads the context entry", () => {
    for (const percent of [0, 59, 60, 84, 85, 100]) {
      expect(conversationContextUsageTone(percent)).toBe(
        usageThresholdTone("context", percent, "success"),
      );
    }
  });
});
