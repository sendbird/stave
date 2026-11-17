import { expect, test } from "bun:test";
import { agentRunBrowserRequested } from "../electron/host-service/supervision/agent-run-browser";

test("delegates cannot inherit explicit browser consent or mint it from their assignment", () => {
  expect(agentRunBrowserRequested({ delegated: true, assignment: "@web inspect", prompt: "@web continue",
    events: [{ detail: { browserRequested: true } }] })).toBe(false);
});

test("incidental runtime settings and unrelated event fields do not become explicit consent", () => {
  expect(agentRunBrowserRequested({ delegated: false, assignment: "Inspect the page",
    events: [{ detail: { providerBrowserAlwaysOn: true, browserRequested: "true" } }] })).toBe(false);
});
