import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { addTarsNeverRule, TarsAutonomySettings, tarsAutonomyTable } from "../src/components/tars/TarsAutonomySettings";
import { TarsDecisionCard } from "../src/components/tars/TarsDecisionCard";
import { TarsNeverRuleNotice } from "../src/components/tars/TarsNeverRuleNotice";
import {
  TARS_ACTION_KEYS, TARS_AUTONOMY_LEVELS, TARS_NEVER_RULES_MAX, TARS_UNAVAILABLE_ACTIONS, tarsActionMode, type TarsAutonomyLevel,
} from "../src/lib/tars/autonomy";
import type { TarsDecisionView } from "../src/lib/tars/decisions";

const NOW = "2026-11-05T00:00:00.000Z";
afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

/** Renders the settings block and returns its markup and the element tree, so a test can read rows and press real handlers without a DOM. */
function settings(level: TarsAutonomyLevel, rules: string[] = [], handlers: { onLevelChange?: (level: TarsAutonomyLevel) => void; onRulesChange?: (rules: string[]) => void } = {}) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() {
    sink.tree = TarsAutonomySettings({ level, rules, onLevelChange: handlers.onLevelChange ?? (() => {}), onRulesChange: handlers.onRulesChange ?? (() => {}) });
    return sink.tree;
  }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, tree: sink.tree };
}
/** Every element in a rendered tree that carries `attribute`. */
function collect(tree: ReactNode, attribute: string, found: Array<Record<string, unknown>> = []) {
  if (Array.isArray(tree)) { for (const child of tree) collect(child, attribute, found); return found; }
  if (!isValidElement(tree)) return found;
  const props = tree.props as Record<string, unknown>;
  if (attribute in props) found.push(props);
  collect(props.children as ReactNode, attribute, found);
  return found;
}
/** The table's rows as the page states them: row id to the comma-joined action keys it lists. */
function rowsOf(html: string) {
  return Object.fromEntries([...html.matchAll(/data-tars-autonomy-row="([a-z]+)" data-tars-autonomy-actions="([^"]*)"/g)].map((match) => [match[1]!, match[2]!.split(",").filter(Boolean)]));
}

describe("the autonomy settings table", () => {
  test.each(TARS_AUTONOMY_LEVELS.map((level) => [level] as const))("at %s every row is what the host's policy function says", (level) => {
    const rows = rowsOf(settings(level).html);
    const auto = TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, level) === "auto");
    const confirm = TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, level) === "confirm");
    expect(rows.auto).toEqual(auto);
    // "Asks first" and "always asks" together are everything the host holds at this level.
    expect([...rows.confirm!, ...rows.always!].sort()).toEqual([...confirm].sort());
    expect(rows.always).toEqual(["cancel", "skipStage", "acceptCompletion", "approve", "publish"]);
    expect(rows.never).toEqual([...TARS_UNAVAILABLE_ACTIONS]);
    expect(tarsAutonomyTable(level).auto).toEqual(auto);
  });

  test("the rows move between levels exactly where the policy changes", () => {
    const careful = rowsOf(settings("careful").html);
    const balanced = rowsOf(settings("balanced").html);
    const handsOff = rowsOf(settings("handsOff").html);
    expect(balanced.auto).toEqual(["show", "workspaceEdit", "workspaceReplace", "delegate", "reprioritize", "startNow", "pause", "takeover", "deny"]);
    expect(careful.auto).toEqual(["show", "workspaceEdit", "pause", "takeover", "deny"]);
    expect(careful.confirm).toEqual(expect.arrayContaining(["delegate", "reprioritize", "startNow"]));
    expect(handsOff.auto).toEqual(["show", "workspaceEdit", "workspaceReplace", "delegate", "reprioritize", "startNow", "pause", "takeover", "deny", "resume", "extend", "retryStage"]);
    expect(handsOff.confirm).not.toEqual(expect.arrayContaining(["resume"]));
  });

  test("the three levels are one labelled choice with a line each, and the chosen one is checked", () => {
    const { html } = settings("careful");
    expect(html).toContain("How independently Tars acts");
    for (const text of ["Careful", "Balanced", "Hands-off", "Ask before starting tasks or changing their queue order.",
      "Default.", "Each action is recorded"]) expect(html).toContain(text);
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toContain('data-tars-autonomy="careful"');
    // Optional action details stay named for the chosen level and start collapsed.
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="What Tars does at the Careful level"');
    for (const text of ["Does on its own", "Asks you first", "Always asks, at every level", "Never does", "start new work", "cancel work", "force-push"]) expect(html).toContain(text);
  });

  test("Korean copy is complete for the levels, the table and the rules", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const { html } = settings("handsOff", ["production 브랜치는 건드리지 않기"]);
    for (const text of ["Tars가 스스로 하는 범위", "신중하게", "균형 있게", "맡겨 두기", "알아서 합니다", "먼저 묻습니다", "어느 단계에서나 항상 묻습니다", "하지 않습니다",
      "하지 말 것", "production 브랜치는 건드리지 않기", "규칙 추가"]) expect(html).toContain(text);
    expect(html).not.toContain("tars.autonomy.");
  });

  test("choosing a level reports that level and nothing else", () => {
    const chosen: TarsAutonomyLevel[] = [];
    const { tree } = settings("balanced", [], { onLevelChange: (level) => chosen.push(level) });
    const group = collect(tree, "onValueChange")[0] as { onValueChange: (value: unknown) => void };
    group.onValueChange("handsOff");
    group.onValueChange("unrestricted");
    expect(chosen).toEqual(["handsOff"]);
  });
});

describe("the never-do rule list", () => {
  test("says honestly what the rules do and do not do", () => {
    const { html } = settings("balanced");
    expect(html).toContain("Matching proposals require confirmation; rules do not automatically block actions.");
    expect(html).toContain("Add rules for what Tars must avoid.");
    expect(html).toContain("No rules yet.");
  });

  test("a rule is added once, trimmed and within the limits; removing one reports the rest", () => {
    expect(addTarsNeverRule([], "  never touch production branches  ")).toEqual(["never touch production branches"]);
    expect(addTarsNeverRule(["Never deploy"], "never deploy")).toEqual(["Never deploy"]);
    expect(addTarsNeverRule([], "   ")).toEqual([]);
    expect(addTarsNeverRule([], "x".repeat(400))[0]).toHaveLength(200);
    const full = Array.from({ length: TARS_NEVER_RULES_MAX }, (_, index) => `rule ${index}`);
    expect(addTarsNeverRule(full, "one more")).toEqual(full);
    const changes: string[][] = [];
    const { html, tree } = settings("balanced", ["Never deploy", "Never touch billing"], { onRulesChange: (rules) => changes.push(rules) });
    expect(html).toContain('aria-label="Remove rule: Never deploy"');
    const remove = collect(tree, "aria-label").find((props) => props["aria-label"] === "Remove rule: Never deploy") as { onClick: () => void };
    remove.onClick();
    expect(changes).toEqual([["Never touch billing"]]);
    expect(settings("balanced", full).html).toContain("You can keep up to 12 rules.");
  });
});

const proposal = (patch: Partial<TarsDecisionView> = {}): TarsDecisionView => ({ id: "confirm:message:0", kind: "confirm", messageId: "message", actionIndex: 0, question: null, targets: [],
  options: [{ kind: "proposal", action: { kind: "delegate", workspaceId: "source", title: "Repair search", instruction: "Repair it.", acceptanceCriteria: ["It works."], priority: 50 }, label: null, rationale: null }],
  recommended: 0, state: "waiting", why: null, checked: true, answer: null, failure: null, latest: true, record: null, delivery: null, since: NOW, reask: false, reasked: false, ...patch });

describe("a held work proposal's card", () => {
  test("says what would start, where, and waits for Confirm", () => {
    const html = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: proposal(), workspaceNameOf: () => "Source", onAnswer: () => {} }));
    expect(html).toContain("Start this work?");
    expect(html).toContain("Repair search");
    expect(html).toContain("Tars adds this work to its queue and starts it when there is room.");
    expect(html).toContain("Source");
    // The button says the card waits; there is no waiting badge.
    expect(html).not.toContain("Awaiting your confirmation");
    // The primary button is named by what it does and, with no rule matched, takes Enter.
    expect(html).toMatch(/data-tars-decision-option="0"[^>]*>(?:(?!<\/button>).)*Start work/);
    expect(html).toContain('aria-keyshortcuts="1 Enter"');
    expect(html).not.toContain(">Confirm<");
    expect(html).not.toContain("data-tars-never-rule-notice");
    // Not an irreversible action: no danger tag.
    expect(html).not.toContain("data-tars-decision-risk-tag");
  });

  test("a priority change names its new priority, in Korean too", async () => {
    const reprioritize = proposal({ targets: [{ responsibilityId: "goal", expectedRevision: 2 }],
      options: [{ kind: "proposal", action: { kind: "reprioritize", responsibilityId: "goal", expectedRevision: 2, priority: 80 }, label: null, rationale: null }] });
    expect(renderToStaticMarkup(createElement(TarsDecisionCard, { decision: reprioritize, titleOf: () => "Release check", onAnswer: () => {} })))
      .toContain("The work moves in the queue to priority 80.");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const html = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: reprioritize, titleOf: () => "Release check", onAnswer: () => {} }));
    expect(html).toContain("이 작업의 우선순위를 바꿀까요?");
    expect(html).toContain("Release check");
  });

  test("once confirmed it folds to a record of what was started", () => {
    const answer = { decisionId: "confirm:message:0", optionIndex: 0, source: "click" as const, effect: { kind: "proposal" as const }, label: null, status: "applied" as const,
      reason: null, error: null, actRequestId: null, messageId: null, revision: 2, createdAt: NOW, updatedAt: NOW };
    const html = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: proposal({ state: "answered", answer }) }));
    expect(html).toContain("Start Repair search");
    expect(html).toContain('data-tars-decision-state="answered"');
  });
});

describe("a matched never-do rule on a confirmation card", () => {
  const matches = [{ rule: "Never touch production branches", why: "branch" as const, value: "production" },
    { rule: "Never cancel work", why: "action" as const, value: "cancel" }];

  test("the card shows each matched rule with the word that matched, and says the rule does not block", () => {
    const html = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: proposal({ matchedRules: matches }), onAnswer: () => {} }));
    expect(html).toContain("data-tars-never-rule-notice");
    expect(html).toContain("2 of your rules may apply");
    expect(html).toContain("“Never touch production branches” names this branch (production).");
    expect(html).toContain("“Never cancel work” names this action (cancel).");
    expect(html).toContain("The rule does not block the action; the choice is yours.");
  });

  test("a proposed control's card shows it too, and no notice renders without a match", () => {
    const control: TarsDecisionView = proposal({ targets: [{ responsibilityId: "goal", expectedRevision: 2 }], recommended: null, matchedRules: [matches[1]!],
      options: [{ kind: "control", control: { responsibilityId: "goal", expectedRevision: 2, operation: "cancel" }, label: null, rationale: null }] });
    const html = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: control, titleOf: () => "Release check", onAnswer: () => {} }));
    expect(html).toContain("Cancel this work?");
    expect(html).toContain("One of your rules may apply");
    expect(html).toContain('data-tars-never-rule-match="action"');
    expect(renderToStaticMarkup(createElement(TarsNeverRuleNotice, { matches: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(TarsNeverRuleNotice, { matches: undefined }))).toBe("");
  });
});
