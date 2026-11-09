import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { describeTarsDecisionTarget, handleTarsDecisionKey, isTarsDecisionDismissKey, TarsDecisionCard, type TarsDecisionCardContext } from "../src/components/tars/TarsDecisionCard";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { tarsDecisionKeyChoice, tarsUnverifiedOptions, type TarsDecisionView } from "../src/lib/tars/decisions";
import type { TarsDecisionAnswer } from "../src/lib/tars/conversation";

const NOW = "2026-11-05T00:00:00.000Z";
afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

const ask = (patch: Partial<TarsDecisionView> = {}): TarsDecisionView => ({ id: "ask:message:0", kind: "ask", messageId: "message", actionIndex: 0,
  question: "Should I pause the release check?", targets: [{ responsibilityId: "goal", expectedRevision: 2 }],
  options: [{ kind: "control", control: { responsibilityId: "goal", expectedRevision: 2, operation: "pause" }, label: "Pause it now", rationale: "Staging first." },
    { kind: "reply", label: "Keep it running", rationale: "It does not depend on staging." }],
  recommended: 1, state: "waiting", why: null, checked: true, answer: null, failure: null, latest: true, record: null, since: NOW, reask: false, reasked: false, ...patch });
const unverified = (patch: Partial<TarsDecisionView> = {}): TarsDecisionView => ({ id: "unverified:goal:4", kind: "unverifiedCompletion", messageId: null,
  actionIndex: null, question: null, targets: [{ responsibilityId: "goal", expectedRevision: 4 }], options: tarsUnverifiedOptions("goal", 4),
  recommended: null, state: "waiting", why: null, checked: true, answer: null, failure: null, latest: true, record: null, since: NOW, reask: false, reasked: false, ...patch });
const titleOf = () => "Release check";

/** Renders the card and returns its root element's props, so a test presses the real key handler without a DOM. */
function rendered(decision: TarsDecisionView, onAnswer: (index: number, source: string) => void = () => {}, context: TarsDecisionCardContext = {}) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = TarsDecisionCard({ decision, titleOf, ...context, onAnswer: (_view, index, source) => onAnswer(index, source) }); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, root: isValidElement(sink.tree) ? sink.tree.props as { onKeyDown?: (event: unknown) => void; tabIndex?: number; role?: string } : null };
}
const key = (value: string, patch: Record<string, unknown> = {}) => {
  let prevented = false;
  return { event: { key: value, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: null, nativeEvent: { isComposing: false },
    preventDefault: () => { prevented = true; }, ...patch }, prevented: () => prevented };
};
const focusedOption = (index: number) => ({ closest: () => ({ getAttribute: () => String(index) }) });

describe("decision card keys", () => {
  test("1–4 choose that option, Enter the focused option or else the recommended one; other keys choose nothing", () => {
    const decision = ask();
    expect(tarsDecisionKeyChoice("1", decision, null)).toBe(0);
    expect(tarsDecisionKeyChoice("2", decision, null)).toBe(1);
    expect(tarsDecisionKeyChoice("3", decision, null)).toBeNull();
    expect(tarsDecisionKeyChoice("Enter", decision, null)).toBe(1);
    expect(tarsDecisionKeyChoice("Enter", decision, 0)).toBe(0);
    expect(tarsDecisionKeyChoice("Enter", unverified(), null)).toBeNull();
    expect(tarsDecisionKeyChoice("a", decision, null)).toBeNull();
  });

  test("the key handler sits on the focusable card, so only keys pressed while it has focus answer; modifiers and composition are ignored", () => {
    const answers: Array<[number, string]> = [];
    const { root } = rendered(ask(), (index, source) => answers.push([index, source]));
    // The card is the focus scope: a focusable group with its own handler, never a window listener.
    expect(root).toMatchObject({ role: "group", tabIndex: 0 });
    const press = (value: string, patch: Record<string, unknown> = {}) => { const entry = key(value, patch); root!.onKeyDown!(entry.event); return entry.prevented(); };
    expect(press("1")).toBe(true);
    expect(press("Enter")).toBe(true);
    expect(press("Enter", { target: focusedOption(0) })).toBe(true);
    expect(press("1", { metaKey: true })).toBe(false);
    expect(press("2", { nativeEvent: { isComposing: true } })).toBe(false);
    expect(press("9")).toBe(false);
    expect(answers).toEqual([[0, "key"], [1, "key"], [0, "key"]]);
    const direct: number[] = [];
    handleTarsDecisionKey(key("2").event as never, ask(), (index) => direct.push(index));
    expect(direct).toEqual([1]);
  });
});

describe("decision card states", () => {
  test("waiting: an emphasized card with each option, its rationale and key hints; Enter only on the recommended option", () => {
    const { html } = rendered(ask());
    expect(html).toContain('data-tars-decision-state="waiting"');
    expect(html).toContain("Should I pause the release check?");
    expect(html).toContain("Waiting for your answer");
    expect(html).toContain("Pause it now");
    expect(html).toContain("Recommended. It does not depend on staging.");
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toContain('aria-keyshortcuts="2 Enter"');
    expect((html.match(/<kbd/g) ?? []).length).toBe(3);
    expect(html).toContain("press 1–2 to choose, or Enter for the recommended option");
  });

  test("answered folds to one record line with the option and how it was given; invalid says why and offers nothing", () => {
    const answer: TarsDecisionAnswer = { decisionId: "ask:message:0", optionIndex: 1, source: "words", effect: { kind: "reply" }, label: "Keep it running",
      status: "applied", reason: null, error: null, actRequestId: null, messageId: "answer", revision: 2, createdAt: NOW, updatedAt: NOW };
    const answered = rendered(ask({ state: "answered", answer })).html;
    expect(answered).toContain("Keep it running · words");
    expect(answered).not.toContain("<button");
    const invalid = rendered(ask({ state: "invalid", why: "targetMoved", reask: true })).html;
    expect(invalid).toContain("No longer valid: the work changed after this was asked.");
    expect(invalid).toContain("Tars will ask again.");
    expect(invalid).not.toContain("<button");
    expect(rendered(ask({ state: "invalid", why: "targetEnded", reasked: true })).html).toContain("Tars asked again below.");
    const rejected = rendered(ask({ state: "answered", answer: { ...answer, optionIndex: 0, label: "Pause it now", source: "click", status: "rejected", reason: "stale", error: "Stale." } })).html;
    expect(rejected).toContain("Pause it now not applied · click");
    expect(rejected).toContain("This work changed after you last saw it.");
  });

  test("an unverified completion offers Accept as done, Cancel responsibility and new verification work, none recommended", async () => {
    const { html } = rendered(unverified());
    // A confirmation leads with what it is, then the work it is about, and marks the effects it cannot undo.
    expect(html).toContain("Stave could not verify this completion");
    expect(html).toContain("Release check");
    expect(html).toContain("Can&#x27;t be undone");
    for (const label of ["Accept as done", "Cancel responsibility", "Ask Tars for new verification work"]) expect(html).toContain(label);
    expect(html).toContain("Nothing runs until you send it.");
    expect(html).not.toContain("Enter</kbd>");
    expect(html).toContain("press 1–3 to choose.");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const korean = rendered(unverified()).html;
    expect(korean).toContain("완료를 확인하지 못했습니다");
    expect(korean).toContain("Tars에게 새 검증 작업 요청");
  });

  test("a refused attempt stays on record above the open options; a proposed cancel has no Enter hint", () => {
    const failure: TarsDecisionAnswer = { decisionId: "unverified:goal:4", optionIndex: 1, source: "click", effect: { kind: "control", responsibilityId: "goal", expectedRevision: 4, operation: "cancel" },
      label: null, status: "rejected", reason: "unknown", error: "Unreachable.", actRequestId: "answer:unverified:goal:4", messageId: null, revision: 2, createdAt: NOW, updatedAt: NOW };
    const html = rendered(unverified({ failure })).html;
    expect(html).toContain('data-tars-decision-attempt="rejected"');
    expect(html).toContain("Cancel responsibility not applied · click");
    expect((html.match(/<button/g) ?? []).length).toBe(3);
    const cancel = rendered(ask({ id: "confirm:message:0", kind: "confirm", question: null, recommended: null,
      options: [{ kind: "control", control: { responsibilityId: "goal", expectedRevision: 2, operation: "cancel" }, label: null, rationale: null }] })).html;
    expect(cancel).toContain("press 1 to confirm.");
    expect(cancel).not.toContain("Enter</kbd>");
    expect(cancel).toContain('aria-keyshortcuts="1"');
  });

  test("without a snapshot the options are shown but cannot be pressed", () => {
    const { html } = rendered(ask({ checked: false }));
    expect((html.match(/<button[^>]*\sdisabled=""/g) ?? []).length).toBe(2);
  });
});

const proposal = (operation: "cancel" | "pause") => ask({ id: "confirm:message:0", kind: "confirm", question: null, recommended: operation === "pause" ? 0 : null,
  targets: [{ responsibilityId: "goal", expectedRevision: 3 }],
  options: [{ kind: "control", control: { responsibilityId: "goal", expectedRevision: 3, operation }, label: null, rationale: null }] });
const goal = { id: "goal", title: "Release check", repositoryPath: "/tmp/work/stave-app", workspaceId: "home", executionWorkspaceId: "exec-1" } as TarsResponsibility;
const context: TarsDecisionCardContext = { rowOf: (id) => id === "goal" ? goal : undefined, workspaceNameOf: (id) => id === "exec-1" ? "Release branch" : undefined };

describe("confirmation card", () => {
  test("a proposed cancel shows its icon, title, the work, a risk tag, detail rows and Confirm with its key", () => {
    const { html } = rendered(proposal("cancel"), () => {}, context);
    expect(html).toContain("Cancel this work?");
    expect(html).toContain("Release check");
    expect(html).toContain('data-tars-decision-risk="irreversible"');
    expect(html).toContain("Can&#x27;t be undone");
    expect(html).toContain('data-tars-decision-rows="repository,workspace,revision,effect"');
    expect(html).toContain("stave-app");
    expect(html).toContain('title="/tmp/work/stave-app"');
    expect(html).toContain("Release branch");
    expect(html).toContain(">r3<");
    expect(html).toContain("Ends Tars&#x27;s supervision. Changes already made stay.");
    // No default for an irreversible effect: Confirm is outlined, keyed 1 only.
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).not.toContain("Enter</kbd>");
  });

  test("a reversible proposal has no risk tag; unknown target rows are left out, never guessed", () => {
    const { html } = rendered(proposal("pause"));
    expect(html).toContain("Pause this work?");
    expect(html).not.toContain("data-tars-decision-risk-tag");
    expect(html).toContain('data-tars-decision-rows="revision,effect"');
    expect(describeTarsDecisionTarget(proposal("pause"), {})).toEqual({ repository: null, repositoryPath: null, workspace: null, revision: 3 });
    // The execution workspace names the place, falling back to the request's own workspace.
    expect(describeTarsDecisionTarget(proposal("pause"), { rowOf: () => ({ ...goal, executionWorkspaceId: null }), workspaceNameOf: (id) => id === "home" ? "Home" : undefined }).workspace).toBe("Home");
  });

  test("Not now and Esc leave the decision waiting and hand focus away; without a place to go there is neither", () => {
    let dismissed = 0;
    const answers: unknown[] = [];
    const withDismiss = rendered(proposal("cancel"), (index, source) => answers.push([index, source]), { ...context, onDismiss: () => { dismissed++; } });
    expect(withDismiss.html).toContain("Not now");
    expect(withDismiss.html).toContain('aria-keyshortcuts="Escape"');
    expect(withDismiss.html).toContain("Esc</kbd>");
    const escape = key("Escape");
    withDismiss.root!.onKeyDown!(escape.event);
    expect(escape.prevented()).toBe(true);
    expect(dismissed).toBe(1);
    expect(answers).toEqual([]);
    // A modified or composing Esc is not the dismiss key.
    expect(isTarsDecisionDismissKey({ key: "Escape", altKey: false, ctrlKey: false, metaKey: true, shiftKey: false, defaultPrevented: false })).toBe(false);
    expect(isTarsDecisionDismissKey({ key: "Escape", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, nativeEvent: { isComposing: true } })).toBe(false);
    expect(isTarsDecisionDismissKey({ key: "Escape", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: true })).toBe(false);
    const without = rendered(proposal("cancel"));
    expect(without.html).not.toContain("Not now");
    const passThrough = key("Escape");
    without.root!.onKeyDown!(passThrough.event);
    expect(passThrough.prevented()).toBe(false);
  });

  test("Korean confirmation copy", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const { html } = rendered(proposal("cancel"), () => {}, { ...context, onDismiss: () => {} });
    for (const text of ["이 작업의 책임을 취소할까요?", "되돌릴 수 없음", "저장소", "워크스페이스", "리비전", "효과", "나중에"]) expect(html).toContain(text);
  });
});
