import { expect, test } from "bun:test";
import { formatAutomationCadence } from "../src/lib/automation-presentation";
test("webhook rows show their event trigger instead of their retained time cadence", () => {
  expect(formatAutomationCadence({schedule:{every:1,unit:"days"},webhook:{endpointId:"a".repeat(64)}} as Parameters<typeof formatAutomationCadence>[0])).toBe("Webhook");
});
