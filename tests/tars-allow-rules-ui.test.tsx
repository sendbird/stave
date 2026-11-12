import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsAllowRulesProvider, TarsAllowRuleRecords, TarsAlwaysAllowButton, saveTarsAllowRule } from "../src/components/tars/TarsAllowRules";
import { TarsAutonomySettings } from "../src/components/tars/TarsAutonomySettings";
import { TarsDecisionCard } from "../src/components/tars/TarsDecisionCard";
import { TARS_ALWAYS_CONFIRMED, type TarsAllowRule } from "../src/lib/tars/autonomy";
import type { TarsDecisionView } from "../src/lib/tars/decisions";
import { SETTINGS } from "./tars-test-context";

const database = () => new Database(":memory:");
afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });
function elements(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children as ReactNode), ...elements(tree.props.actions as ReactNode)];
}
const rule: TarsAllowRule = { key: "extend", repositoryPath: "/tmp/billing" };
const decision: TarsDecisionView = { id: "confirm:message:0", kind: "confirm", messageId: "message", actionIndex: 0, question: null,
  targets: [{ responsibilityId: "work", expectedRevision: 2 }], options: [{ kind: "control", control: { responsibilityId: "work", expectedRevision: 2, operation: "extend" }, label: null, rationale: null }],
  recommended: 0, state: "waiting", why: null, checked: true, answer: null, failure: null, latest: true, record: null, delivery: null,
  since: "2026-11-05T00:00:00.000Z", reask: false, reasked: false };

test("a waiting card's Always allow handler saves its repository rule before applying its existing confirm action", async () => {
  const db = database();
  try {
    const store = new TarsConversationStore(db); store.configure(SETTINGS);
    const answers: unknown[] = [];
    const card: { tree: ReactNode } = { tree: null };
    function Card() {
      card.tree = TarsDecisionCard({ decision, onAnswer: (...input) => { expect(store.getSettings()?.allowRules).toEqual([rule]); answers.push(input); },
        // Only the repository target is read by this card.
        rowOf: () => ({ repositoryPath: rule.repositoryPath } as never) });
      return card.tree;
    }
    renderToStaticMarkup(createElement(Card));
    const element = elements(card.tree).find((entry) => entry.type === TarsAlwaysAllowButton)!;
    expect(element).toBeDefined();
    let button: ReactNode = null;
    function Capture() { button = TarsAlwaysAllowButton(element.props as Parameters<typeof TarsAlwaysAllowButton>[0]); return button; }
    const html = renderToStaticMarkup(createElement(TarsAllowRulesProvider, { settings: SETTINGS, busy: false,
      configure: async (settings) => store.configure(settings), children: createElement(Capture) }));
    expect(html).toContain("Always allow");
    await (elements(button)[0]!.props.onClick as () => Promise<void>)();
    expect(answers).toEqual([[decision, 0, "click"]]);
  } finally { db.close(); }
});

test("a failed save applies nothing; duplicate permission stays single and the maximum cannot be exceeded", async () => {
  let applied = 0;
  expect(await saveTarsAllowRule(SETTINGS, async () => null, rule, () => applied++)).toBe(false);
  expect(applied).toBe(0);
  const full = Array.from({ length: 24 }, (_, index) => ({ ...rule, repositoryPath: `/tmp/repo-${index}` }));
  let saves = 0;
  expect(await saveTarsAllowRule({ ...SETTINGS, allowRules: full }, async (settings) => { saves++; return settings; }, rule, () => applied++)).toBe(false);
  expect(saves).toBe(0);
  const db = database();
  try {
    const store = new TarsConversationStore(db);
    for (let index = 0; index < 2; index++) await saveTarsAllowRule(store.getSettings() ?? SETTINGS, async (settings) => store.configure(settings), rule, () => applied++);
    expect(store.getSettings()?.allowRules).toEqual([rule]);
  } finally { db.close(); }
});

test("Undo removes only permission and settings Remove reports the remaining rules", async () => {
  const db = database();
  try {
    const store = new TarsConversationStore(db);
    const other: TarsAllowRule = { key: "publish", repositoryPath: null };
    const settings = store.configure({ ...SETTINGS, allowRules: [rule, other] });
    const records: { tree: ReactNode } = { tree: null };
    function Records() { records.tree = TarsAllowRuleRecords(); return records.tree; }
    const html = renderToStaticMarkup(createElement(TarsAllowRulesProvider, { settings, busy: false, configure: async (next) => store.configure(next), children: createElement(Records) }));
    expect(html).toContain("Always allowed: add turns to a task");
    expect(html).toContain("billing");
    const undo = elements(records.tree).filter((entry) => typeof entry.props.onClick === "function")[0]!;
    await (undo.props.onClick as () => Promise<void>)();
    expect(store.getSettings()?.allowRules).toEqual([other]);
    const section: { tree: ReactNode } = { tree: null };
    function Section() {
      section.tree = TarsAutonomySettings({ level: "balanced", rules: [], allowRules: [rule, other], onLevelChange: () => {}, onRulesChange: () => {},
        onAllowRulesChange: (allowRules) => { store.configure({ ...settings, allowRules }); } });
      return section.tree;
    }
    renderToStaticMarkup(createElement(Section));
    const remove = elements(section.tree).find((entry) => String(entry.props["aria-label"]).includes("/tmp/billing"))!;
    (remove.props.onClick as () => void)();
    expect(store.getSettings()?.allowRules).toEqual([other]);
  } finally { db.close(); }
});

test("Careful, irreversible keys, missing repository and full rules do not offer standing permission; Korean is complete", async () => {
  const render = (key: TarsAllowRule["key"], overrides = {}, repositoryPath: string | null = rule.repositoryPath) => renderToStaticMarkup(createElement(TarsAllowRulesProvider,
    { settings: { ...SETTINGS, ...overrides }, busy: false, configure: async (settings) => settings,
      children: createElement(TarsAlwaysAllowButton, { actionKey: key, repositoryPath, onApply: () => {} }) }));
  for (const key of TARS_ALWAYS_CONFIRMED) expect(render(key)).toBe("");
  expect(render("extend", { autonomy: "careful" })).toBe("");
  expect(render("extend", {}, null)).toBe("");
  expect(render("extend", { allowRules: Array.from({ length: 24 }, (_, index) => ({ ...rule, repositoryPath: `/tmp/repo-${index}` })) })).toBe("");
  applyAppLocale("ko"); await i18n.changeLanguage("ko");
  expect(render("extend")).toContain("항상 허용");
  const html = renderToStaticMarkup(createElement(TarsAutonomySettings, { level: "balanced", rules: [], allowRules: [rule], onLevelChange: () => {}, onRulesChange: () => {}, onAllowRulesChange: () => {} }));
  expect(html).toContain("항상 허용한 동작"); expect(html).toContain("/tmp/billing"); expect(html).not.toContain("tars.autonomy.");
});
