import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BellInboxRow } from "@/components/layout/BellInboxRow";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";

// A notification answered while an earlier answer to the same delegated
// question was still unconfirmed: the earlier answer is the one delivered,
// and the row must not say this answer was sent.
const entry = {
  id: "question-1", item: null, notifications: [], kind: "user-input", tier: "now",
  title: "Consult two models", detail: "Which scope?", repositoryPath: null, repositoryName: null,
  workspaceId: null, workspaceName: null, taskId: null, at: "2026-11-25T00:00:00.000Z", unread: false, error: false,
} as unknown as FleetInboxEntry;

function render(feedback: "delivered" | "deliveredEarlier") {
  return renderToStaticMarkup(createElement(BellInboxRow, {
    entry, history: false, triggerLabel: "Open", feedback, busy: false,
    onActivate: () => {}, onAnswer: () => {}, onMarkRead: () => {}, onSettle: () => {},
  }));
}

test("a row says when an earlier answer was delivered instead of this one", () => {
  expect(render("deliveredEarlier")).toContain("The earlier answer to this question was delivered, so this one was not sent.");
  expect(render("deliveredEarlier")).not.toContain("Answer sent");
  expect(render("delivered")).not.toContain("earlier answer");
});
