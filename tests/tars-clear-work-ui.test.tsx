import { beforeEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../src/i18n";
import { TarsBatchCard } from "../src/components/tars/TarsBatchCard";
import { TarsClearCard, TarsClearRecordLine, type TarsClearCounts } from "../src/components/tars/TarsClear";
import type { TarsBatchRecord } from "../src/lib/tars/batch";
import type { TarsClearRecord } from "../src/lib/tars/clearing";

beforeEach(async () => { await i18n.changeLanguage("en"); });
const counts = (patch: Partial<TarsClearCounts>): TarsClearCounts => ({ conversation: 0, done: 0, outputs: 0, work: 0, kept: 0, ...patch });
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const card = (scopes: TarsClearRecord["scopes"], value: TarsClearCounts) =>
  renderToStaticMarkup(<TarsClearCard id="clear:m:0" scopes={scopes} counts={value} onConfirm={() => {}} onDecline={() => {}} />);

test("a clear proposal with nothing left offers Close instead of a disabled Clear, so it can settle", () => {
  const html = card(["outputs"], counts({}));
  const confirm = buttons(html).find((button) => button.includes("data-tars-clear-confirm"))!;
  expect(confirm).toContain('data-tars-clear-confirm="empty"');
  expect(confirm).not.toContain("disabled");
  expect(text(html)).toContain("There is nothing to clear right now.");
  expect(text(html)).toContain("Close");
});

test("a Work reset card says how much stops and what is kept, and confirms only by an explicit click in the danger tone", () => {
  const html = card(["done", "outputs", "work"], counts({ done: 2, outputs: 1, work: 3, kept: 1 }));
  const confirm = buttons(html).find((button) => button.includes("data-tars-clear-confirm"))!;
  expect(confirm).toContain('data-tars-decision-tone="danger"');
  expect(confirm).not.toContain("aria-keyshortcuts");
  expect(text(html)).toContain("cancel 3 unfinished work items");
  expect(text(html)).toContain("1 kept (taken over, paused, publishing or not cancelled)");
  expect(text(html)).toContain("runs stop");
  expect(text(html)).toContain("Clear and cancel");
});

test("a Work reset record says what it cancelled and that Restore does not restart it", () => {
  const record: TarsClearRecord = { requestId: "reset", source: "click", scopes: ["conversation", "done", "outputs", "work"], proposal: null, status: "applied",
    hiddenMessages: 4, inProgress: [], done: ["a", "b"], outputs: [], work: { cancelled: ["a"], kept: [{ responsibilityId: "u", reason: "takenOver" }] },
    revision: 1, createdAt: "2026-11-17T00:00:00.000Z", updatedAt: "2026-11-17T00:00:00.000Z" };
  const html = renderToStaticMarkup(<TarsClearRecordLine record={record} onUndo={() => {}} />);
  expect(text(html)).toContain("1 unfinished work item cancelled");
  expect(text(html)).toContain("1 kept (taken over, paused, publishing or not cancelled)");
  expect(html).toContain("data-tars-clear-cancelled-stays");
});

test("a cleanup whose every item has no workspace says why and closes, with no dead Archive button", async () => {
  const items = [null, "worktree:gone"].map((workspaceId) => ({ responsibilityId: crypto.randomUUID(), revision: 2, workspaceId, name: "Work",
    repositoryPath: "/tmp/repository", bytes: null, reason: "workspaceMissing", action: "archive" as const, status: "skipped" as const }));
  const record: TarsBatchRecord = { id: "b", action: { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false },
    proposal: { messageId: "m", actionIndex: 0 }, state: "proposed", items, createdAt: "2026-11-17T00:00:00.000Z" };
  for (const language of ["en", "ko"]) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(<TarsBatchCard record={record} busy={false} onConfirm={() => {}} onRestore={() => {}} onDecline={() => {}} />);
    expect(html).not.toContain("data-tars-batch-confirm");
    expect(buttons(html).find((button) => button.includes("data-tars-batch-close"))).not.toContain("disabled");
    expect(html).toContain("data-tars-batch-nothing");
    expect(text(html)).toContain(language === "en" ? "No workspace to archive" : "보관할 워크스페이스가 없음");
  }
});


test("a reset refusal says work remains visible and never claims it stopped", () => {
  const record: TarsClearRecord = { requestId: "refused", source: "click", scopes: ["done", "outputs", "work"], proposal: null, status: "applied",
    done: [], outputs: [], work: { cancelled: [], kept: [{ responsibilityId: "running", reason: "refused" }] },
    revision: 1, createdAt: "2026-11-17T00:00:00.000Z", updatedAt: "2026-11-17T00:00:00.000Z" };
  const html = renderToStaticMarkup(<TarsClearRecordLine record={record} />);
  expect(text(html)).toContain("1 item was not cancelled and remains visible.");
  expect(html).not.toContain("data-tars-clear-cancelled-stays");
});
