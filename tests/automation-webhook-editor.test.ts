import { expect, test } from "bun:test";
import { automationToDraft } from "@/components/layout/automation-center/automation-center.utils";
import type { AutomationSpec } from "@/lib/automations";

test("editing a webhook schedule preserves its endpoint, secret reference and delivery policies", () => {
  const webhook = { endpointId: "a".repeat(64), secretId: "82fd0f14-f048-4ccc-8474-d379dfcd5061", filters: [], dedupeWindowSeconds: 600, coalesceWindowSeconds: 10, rateLimitPerMinute: 5 };
  const spec = { name: "Review event", prompt: "Review event data", enabled: true, schedule: { every: 1, unit: "hours" }, webhook } as AutomationSpec;
  expect(automationToDraft(spec).webhook).toEqual(webhook);
});
