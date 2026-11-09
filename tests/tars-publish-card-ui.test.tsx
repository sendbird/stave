import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsPublishCard, tarsPublishCardKey, type TarsPublishCardProps, type TarsPublishWords } from "../src/components/tars/TarsPublishCard";
import { TarsPublishRecordLine } from "../src/components/tars/TarsPublishRecordLine";
import { TarsPublishEntry } from "../src/components/tars/TarsPublishEntry";
import type { TarsPublishPreview, TarsPublishRecord, TarsPublishSource } from "../src/lib/tars/publication";
import type { TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

const row = (patch: Partial<TarsResponsibility> = {}): TarsResponsibility => ({
  id: "checkout", requestId: "request-checkout", title: "Show the saved card first at checkout", instruction: "Do it.", acceptanceCriteria: ["Checkout shows the saved card first."],
  workspaceId: "source", repositoryPath: "/tmp/web", providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 4, state: "completed",
  detail: null, taskId: "task-checkout", executionWorkspaceId: "exec-checkout", agentRunId: "run-checkout", reverifyAfter: null, branchName: "feat/checkout-saved-card-3fa9c1",
  createdAt: NOW, updatedAt: NOW, ...patch,
});
const preview = (patch: Partial<TarsPublishPreview> = {}): TarsPublishPreview => ({ responsibilityId: "checkout", revision: 4, reason: null, repository: "example/web",
  repositoryUrl: "https://github.com/example/web", base: "main", head: "feat/checkout-saved-card-3fa9c1", changedFiles: 2,
  body: "## Summary\n\nShow the saved card first at checkout\n\n## Acceptance criteria\n\n- [x] Checkout shows the saved card first. (met)", publication: null, ...patch });

/** Renders the card and returns its markup and root props, so a test presses the real key handler without a DOM. */
function rendered(props: Partial<TarsPublishCardProps> = {}) {
  const calls: { publish: Array<[TarsPublishWords, TarsPublishSource]>; decline: number } = { publish: [], decline: 0 };
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() {
    sink.tree = TarsPublishCard({ id: "publish:message:0", row: row(), preview: preview(), previewState: "ready",
      onPublish: (words, source) => { calls.publish.push([words, source]); }, onDecline: () => { calls.decline++; }, ...props });
    return sink.tree;
  }
  const html = renderToStaticMarkup(createElement(Capture));
  const root = isValidElement(sink.tree) ? sink.tree.props as { onKeyDown: (event: unknown) => void } : null;
  return { html, root: root!, calls, tree: sink.tree as ReactElement };
}
const press = (key: string, patch: Record<string, unknown> = {}) => {
  let prevented = false;
  return { event: { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, target: null, nativeEvent: { isComposing: false },
    preventDefault: () => { prevented = true; }, stopPropagation: () => {}, ...patch }, prevented: () => prevented };
};
const inside = (selector: string) => ({ closest: (query: string) => query.split(",").some((part) => part.trim() === selector) ? {} : null });

/** Every element in a rendered tree, depth first. */
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  return [node, ...elements(props.children)];
}

describe("publish card", () => {
  test("shows where the work goes, the editable words, the body and its tags", () => {
    const { html } = rendered();
    for (const text of ["Open a draft pull request?", "Show the saved card first at checkout", "example/web", "main", "feat/checkout-saved-card-3fa9c1", "2 files",
      "Draft PR", "Can&#x27;t be undone", "## Acceptance criteria", "Open draft PR", "Decline"]) expect(html).toContain(text);
    // Prefilled from the title as a Conventional Commit subject, in editable fields.
    expect(html.match(/value="feat: show the saved card first at checkout"/g)).toHaveLength(2);
    expect(html).not.toContain("readonly");
    expect(html).toContain('data-tars-publish-rows="repository,base,head,changedFiles"');
    // No standing permission exists, and nothing offers it.
    expect(html.toLowerCase()).not.toContain("always");
  });

  test("Enter publishes the words on the card, Esc declines, and both stay inside the card", () => {
    const { root, calls } = rendered({ initial: { commitMessage: "fix(checkout): keep the saved card first", title: "fix: keep the saved card first" } });
    const enter = press("Enter");
    root.onKeyDown(enter.event);
    expect(enter.prevented()).toBe(true);
    expect(calls.publish).toEqual([[{ commitMessage: "fix(checkout): keep the saved card first", title: "fix: keep the saved card first" }, "key"]]);
    const escape = press("Escape");
    root.onKeyDown(escape.event);
    expect(escape.prevented()).toBe(true);
    expect(calls.decline).toBe(1);
  });

  test("the confirm button is a click; Enter on a focused button, select or the body keeps its own meaning", () => {
    expect(tarsPublishCardKey(press("Enter").event)).toBe("publish");
    expect(tarsPublishCardKey(press("Enter", { target: inside("input") }).event)).toBe("publish");
    for (const selector of ["button", "select", "a", "[data-tars-publish-body]"])
      expect(tarsPublishCardKey(press("Enter", { target: inside(selector) }).event)).toBeNull();
    expect(tarsPublishCardKey(press("Enter", { repeat: true }).event)).toBeNull();
    expect(tarsPublishCardKey(press("Enter", { shiftKey: true }).event)).toBeNull();
    expect(tarsPublishCardKey(press("Enter", { nativeEvent: { isComposing: true } }).event)).toBeNull();
    expect(tarsPublishCardKey(press("Escape").event)).toBe("decline");
    const { tree, calls } = rendered();
    const confirm = elements(tree).find((element) => (element.props as Record<string, unknown>)["data-tars-publish-confirm"] !== undefined)!;
    (confirm.props as { onClick: () => void }).onClick();
    expect(calls.publish[0]?.[1]).toBe("click");
  });

  test("the message and title are editable fields with their own change handlers", () => {
    const { tree } = rendered();
    const fields = elements(tree).filter((element) => { const props = element.props as Record<string, unknown>; return "data-tars-publish-message" in props || "data-tars-publish-title" in props; });
    expect(fields).toHaveLength(2);
    for (const field of fields) expect(typeof (field.props as { onChange?: unknown }).onChange).toBe("function");
    const type = elements(tree).find((element) => "data-tars-publish-type" in (element.props as Record<string, unknown>))!;
    expect((type.props as { value: string }).value).toBe("feat");
  });

  test("work the host would refuse shows why and offers only Decline; nothing publishes while it loads", () => {
    const refused = rendered({ preview: preview({ reason: "noChanges", changedFiles: 0 }) });
    expect(refused.html).toContain("There is nothing to publish");
    expect(refused.html).not.toContain("data-tars-publish-confirm");
    expect(refused.html).not.toContain("data-tars-publish-message");
    refused.root.onKeyDown(press("Enter").event);
    expect(refused.calls.publish).toEqual([]);
    const loading = rendered({ preview: null, previewState: "loading" });
    expect(loading.html).toContain("Reading the workspace");
    loading.root.onKeyDown(press("Enter").event);
    expect(loading.calls.publish).toEqual([]);
  });

  test("a retry shows the step it continues from", () => {
    const failed = row({ publication: { state: "failed", failedStep: "push", commit: "f00ba12", branch: "feat/checkout-saved-card-3fa9c1", base: "main",
      commitMessage: "feat: x", title: "feat: x", url: null, number: null, error: "fatal: unable to access remote", reason: "publishFailed", updatedAt: NOW } });
    const { html } = rendered({ row: failed });
    expect(html).toContain('data-tars-publish-rows="repository,base,head,changedFiles,resume"');
    expect(html).toContain("Continues from");
  });

  test("Korean copy", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const { html } = rendered();
    for (const text of ["Draft PR을 만들까요?", "기준 브랜치", "작업 브랜치", "파일 2개", "커밋 메시지", "PR 제목", "Draft PR 열기", "거절", "되돌릴 수 없음"]) expect(html).toContain(text);
  });
});

describe("publish record and entry", () => {
  const record = (patch: Partial<TarsPublishRecord>): TarsPublishRecord => ({ requestId: "publish-click:1", source: "click", requestHash: "a".repeat(64), responsibilityId: "checkout",
    expectedRevision: 4, commitMessage: "feat: x", title: "feat: x", proposal: null, status: "applied", reason: null, error: null,
    url: "https://github.com/example/web/pull/12", number: 12, revision: 2, createdAt: NOW, updatedAt: NOW, ...patch });

  test("folds to one line: the pull request it opened, or why it was not published with Retry", () => {
    const opened = renderToStaticMarkup(createElement(TarsPublishRecordLine, { record: record({}), title: "Checkout" }));
    expect(opened).toContain("Draft PR #12 opened · click");
    expect(opened).toContain('href="https://github.com/example/web/pull/12"');
    const failed = renderToStaticMarkup(createElement(TarsPublishRecordLine, { record: record({ status: "rejected", reason: "publishFailed", error: "fatal: unable to access remote", url: null, number: null }),
      row: row({ publication: { state: "failed", failedStep: "push", commit: "f00ba12", branch: "b", base: "main", commitMessage: "feat: x", title: "feat: x", url: null, number: null,
        error: "fatal: unable to access remote", reason: "publishFailed", updatedAt: NOW } }), onRetry: () => {} }));
    expect(failed).toContain("Not published · click");
    expect(failed).toContain("A publish step failed.");
    expect(failed).toContain("Stopped at: Push");
    expect(failed).toContain("fatal: unable to access remote");
    expect(failed).toContain("Retry");
  });

  test("completed work offers Create draft PR until its pull request is open, then links it", () => {
    const offer = renderToStaticMarkup(createElement(TarsPublishEntry, { row: row(), onPublish: () => {} }));
    expect(offer).toContain("Create draft PR");
    const open = renderToStaticMarkup(createElement(TarsPublishEntry, { row: row({ publication: { state: "opened", failedStep: null, commit: "f00ba12", branch: "b", base: "main",
      commitMessage: "feat: x", title: "feat: x", url: "https://github.com/example/web/pull/12", number: 12, error: null, reason: null, updatedAt: NOW } }), onPublish: () => {} }));
    expect(open).toContain("Draft PR #12 open");
    expect(open).not.toContain("Create draft PR");
    expect(renderToStaticMarkup(createElement(TarsPublishEntry, { row: row({ state: "running" }), onPublish: () => {} }))).toBe("");
    expect(renderToStaticMarkup(createElement(TarsPublishEntry, { row: row({ detailCode: "acceptedWithoutVerification" }), onPublish: () => {} }))).toBe("");
  });
});
