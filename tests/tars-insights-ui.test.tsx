import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsKnowsView, TarsRepositoryKnowledge, TarsRepositoryMemoryPanel } from "../src/components/tars/TarsKnowsView";
import { TarsUsageView } from "../src/components/tars/TarsUsageView";
import type { TarsRepositoryMemoriesState, TarsUsageState } from "../src/components/tars/use-tars-insights";
import { buildTarsInsightsFixtures } from "../src/dev/tars-preview/tars-insights-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "../src/lib/tars/branch-name";
import { TARS_IDENTITY_UNSAVED_AT } from "../src/lib/tars/default-instructions";
import { TARS_PLANNER_HISTORY_MESSAGES, buildTarsKnowledge } from "../src/lib/tars/knowledge";
import { aggregateTarsUsage, tarsUsageWindows, type TarsUsageReport } from "../src/lib/tars/usage";

afterEach(() => applyAppLocale("en"));

const NOW = new Date("2026-11-10T12:00:00.000Z");
const noop = () => {};
const saved = async () => true;

/** React escapes text this way in markup, so a text appears whole only if every character survived. */
function escaped(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/** Renders through a capture component, so a test can call a component as a function (its hooks run inside the capture) and read what it returned. */
function capture(render: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = render(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, tree: sink.tree };
}

/** Finds every element with an `onClick` in a rendered component's own output (one level of composition per call). */
function handlersOf(node: ReactNode, found: Array<{ label: string; onClick: () => void }> = []) {
  if (Array.isArray(node)) { node.forEach((child) => handlersOf(child, found)); return found; }
  if (!isValidElement(node)) return found;
  const props = node.props as { children?: ReactNode; onClick?: () => void; "aria-label"?: string; edit?: { label: string; onEdit: () => void } };
  if (props.onClick) found.push({ label: props["aria-label"] ?? (typeof props.children === "string" ? props.children : ""), onClick: props.onClick });
  if (props.edit) found.push({ label: props.edit.label, onClick: props.edit.onEdit });
  handlersOf(props.children, found);
  return found;
}

function fixtures(korean = false) {
  return buildTarsInsightsFixtures({ now: NOW, korean, responsibilities: buildTarsTrayFixtures(new Date("2026-11-05T00:00:00.000Z")).responsibilities });
}

async function memoriesOf(korean = false): Promise<Extract<TarsRepositoryMemoriesState, { status: "ready" }>> {
  const { repositoryMemory } = fixtures(korean);
  const list = await repositoryMemory.list!({ repositoryPath: "/tmp/preview" });
  return { status: "ready", readAt: NOW.getTime(), items: list.items, sourceTasks: new Map((list.sourceTasks ?? []).map((task) => [task.taskId, task])), useMemory: true };
}

describe("What Tars knows", () => {
  const identity = { instructions: "Open every pull request as a draft.\nKeep replies short.", updatedAt: "2026-11-05T00:00:00.000Z" };

  test("groups by scope, names each source and last-saved time, and says what Tars does not remember", async () => {
    await applyAppLocale("en");
    const { repositories } = fixtures();
    const html = renderToStaticMarkup(createElement(TarsKnowsView, { identity, settings: { allowedAgentIds: ["release-notes", "gone"] },
      agentNameOf: (id: string) => id === "release-notes" ? "Release notes" : null, repositories, onEditSettings: noop, onEditRepository: noop }));
    // Scopes in order: everywhere, per repository, then what is not remembered.
    const order = ["everywhere", "repositories", "forgets"].map((scope) => html.indexOf(`data-tars-knows-scope="${scope}"`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The instructions as written, whose they are and when they were saved.
    expect(html).toContain("Open every pull request as a draft.\nKeep replies short.");
    expect(html).toContain('data-tars-knows-source="you"');
    expect(html).toContain(escaped(i18n.t("shell:tars.knows.source.you")));
    expect(html).toContain("Last saved Nov 5, 2026");
    // Allowed agents by name; one that no longer exists is counted, never shown as an id.
    expect(html).toContain("Release notes");
    expect(html).toContain("1 allowed agent no longer exists.");
    expect(html).not.toContain(">gone<");
    expect(html).toContain("Built-in agents are always allowed.");
    // Each repository is a section by name and path.
    expect(html).toContain(">preview<");
    expect(html).toContain("/tmp/preview-docs");
    // The honest line carries the planner's own number.
    expect(html).toContain(`only the last ${TARS_PLANNER_HISTORY_MESSAGES} messages of this conversation`);
    expect(html).toContain("saves no memories from the conversation");
    // Both everywhere items offer the existing editor.
    expect(html.match(/data-tars-knows-edit="(instructions|agents)"/g)).toHaveLength(2);
  });

  test("unset values read as unset: no instructions, never saved, no agents, no repositories", async () => {
    await applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(TarsKnowsView, { identity: { instructions: "", updatedAt: TARS_IDENTITY_UNSAVED_AT }, settings: null,
      agentNameOf: () => null, repositories: [], onEditSettings: noop }));
    expect(html).toContain('data-tars-knows-source="none"');
    expect(html).toContain("No standing instructions are set.");
    expect(html).toContain("Never saved");
    expect(html).toContain("No saved agents are allowed.");
    expect(html).toContain("No repositories are registered.");
    // Stave's default reads as Stave's, in either language.
    const stave = renderToStaticMarkup(createElement(TarsKnowsView, { identity: { instructions: i18n.t("shell:tars.instructionsDefault", { lng: "ko" }), updatedAt: identity.updatedAt },
      settings: null, agentNameOf: () => null, repositories: [], onEditSettings: noop }));
    expect(stave).toContain('data-tars-knows-source="default"');
    expect(stave).toContain(escaped(i18n.t("shell:tars.knows.source.default")));
  });

  test("the edit actions open the existing editors", async () => {
    await applyAppLocale("en");
    const calls: string[] = [];
    const { repositories } = fixtures();
    const knowledge = buildTarsKnowledge({ identity, defaults: [], settings: null, agentNameOf: () => null, repositories });
    const rule = capture(() => TarsRepositoryKnowledge({ repository: knowledge.repositories[0]!, onEditRepository: (path) => calls.push(`repository:${path}`), memory: null })).tree;
    handlersOf(rule).find((handler) => handler.label === "Edit the branch naming rule of preview in repository settings")!.onClick();
    expect(calls).toEqual(["repository:/tmp/preview"]);
    // Where repository settings cannot be opened the rule is shown read-only, with no edit action.
    const readOnly = renderToStaticMarkup(createElement(TarsRepositoryKnowledge, { repository: knowledge.repositories[1]!, memory: null }));
    expect(readOnly).toContain(escaped(TARS_DEFAULT_BRANCH_NAMING_RULE));
    expect(readOnly).toContain(escaped(i18n.t("shell:tars.knows.source.default")));
    expect(readOnly).not.toContain("data-tars-knows-edit");
    const configured = renderToStaticMarkup(createElement(TarsRepositoryKnowledge, { repository: knowledge.repositories[0]!, onEditRepository: noop, memory: null }));
    expect(configured).toContain("Start with feat/, fix/ or chore/");
    expect(configured).toContain("Set in repository settings");
    expect(configured).toContain('data-tars-knows-edit="branchRule"');
  });

  test("a repository's memories show what its tasks receive apart from what they do not, each with its source, time and edit and remove actions", async () => {
    await applyAppLocale("en");
    const state = await memoriesOf();
    const html = renderToStaticMarkup(createElement(TarsRepositoryMemoryPanel, { state, onReload: noop, onSave: saved, onRemove: saved, onOpenTask: noop }));
    expect(html).toContain('data-tars-knows-memory="ready"');
    // Honest about who reads them: the tasks, not Tars.
    expect(html).toContain("Tars does not read these itself.");
    expect(html).toContain("at most 6 per turn");
    expect(html).toContain("3 memories in use");
    const unused = html.indexOf("Not used yet");
    expect(unused).toBeGreaterThan(html.indexOf("Never push to a release branch"));
    expect(html.indexOf("Staging auth keys rotate every quarter.")).toBeGreaterThan(unused);
    // The always-included memory leads the used ones.
    expect(html.indexOf("Never push to a release branch")).toBeLessThan(html.indexOf("Billing export tests look green"));
    // Source task, last-confirmed time and the row's own edit and forget actions.
    expect(html).toContain(escaped(i18n.t("workspace:memory.row.sourceTask")));
    expect(html).toContain("Last confirmed");
    expect(html.match(/data-memory-row-actions/g)!.length).toBe(4);
  });

  test("memory states are said plainly: turned off, empty, unavailable, failed", async () => {
    await applyAppLocale("en");
    const render = (state: TarsRepositoryMemoriesState) => renderToStaticMarkup(createElement(TarsRepositoryMemoryPanel, { state, onReload: noop, onSave: saved, onRemove: saved }));
    const off = render({ status: "ready", readAt: NOW.getTime(), items: [], sourceTasks: new Map(), useMemory: false });
    expect(off).toContain("Memory is turned off for this repository, so its tasks receive none.");
    expect(off).toContain("No memories are saved for this repository.");
    expect(render({ status: "unavailable" })).toContain("Repository memory cannot be read here.");
    const failed = render({ status: "failed", message: "locked" });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("The memories could not be read.");
    expect(render({ status: "loading" })).toContain("Reading memories…");
  });

  test("Korean copy", async () => {
    await applyAppLocale("ko");
    const { repositories } = fixtures(true);
    const html = renderToStaticMarkup(createElement(TarsKnowsView, { identity, settings: null, agentNameOf: () => null, repositories, onEditSettings: noop }));
    expect(html).toContain("모든 곳");
    expect(html).toContain("저장소별");
    expect(html).toContain("Tars가 기억하지 않는 것");
    expect(html).toContain(`최근 메시지 ${TARS_PLANNER_HISTORY_MESSAGES}개`);
    const memory = renderToStaticMarkup(createElement(TarsRepositoryMemoryPanel, { state: await memoriesOf(true), onReload: noop, onSave: saved, onRemove: saved }));
    expect(memory).toContain("사용 중인 메모리 3개");
    expect(memory).toContain("아직 사용하지 않음");
  });
});

describe("Usage", () => {
  async function report(): Promise<TarsUsageReport> {
    return fixtures().getUsage(tarsUsageWindows(NOW));
  }
  const ready = (value: TarsUsageReport): TarsUsageState => ({ status: "ready", report: value, refreshing: false });

  test("shows the period's totals, each work as an opener with its share, and each model", async () => {
    await applyAppLocale("en");
    const value = await report();
    const html = renderToStaticMarkup(createElement(TarsUsageView, { state: ready(value), onReload: noop, onOpenWork: noop }));
    expect(html).toContain('data-tars-usage-status="ready"');
    // 7 days is the period first shown.
    expect(html).toContain('data-tars-usage-window="sevenDays"');
    for (const label of ["Today", "7 days", "30 days", "Tokens", "Turns", "Time working", "By work", "By model"]) expect(html).toContain(`>${label}<`);
    const works = value.works.filter((work) => work.usage.sevenDays.turns > 0);
    expect(works.length).toBeGreaterThan(1);
    for (const work of works) {
      expect(html).toContain(`data-tars-usage-work="${work.responsibilityId}"`);
      expect(html).toContain(`aria-label="Open ${escaped(work.title)}"`);
    }
    // A bar per row, named for assistive technology.
    expect(html.match(/role="meter"/g)!.length).toBe(works.length + value.models.filter((model) => model.usage.sevenDays.turns > 0).length);
    // No cost was reported in the last 7 days (the Codex turns report tokens only), so no money is shown at all.
    expect(value.totals.sevenDays.costUsd).toBeNull();
    expect(html).not.toContain('data-tars-usage-total="cost"');
    expect(html).not.toContain("$");
    // One turn reported nothing, and the view says so instead of hiding it.
    expect(html).toContain(`1 of ${value.totals.sevenDays.turns} turns reported no token count.`);
    // What the figures leave out.
    expect(html).toContain("The tokens of its own replies are not recorded.");
    expect(html).toContain("Turns of helper tasks that a run starts are not counted.");
    expect(html).toContain("Days are counted in your local time.");
  });

  test("money appears only where a provider reported a cost, and says how partial it is", async () => {
    await applyAppLocale("en");
    const value = await report();
    // The same report with 30 days as every period, so the reported Claude costs are in view.
    const thirty: TarsUsageReport = { ...value, totals: { ...value.totals, sevenDays: value.totals.thirtyDays },
      works: value.works.map((work) => ({ ...work, usage: { ...work.usage, sevenDays: work.usage.thirtyDays }, modelIds: { ...work.modelIds, sevenDays: work.modelIds.thirtyDays } })),
      models: value.models.map((model) => ({ ...model, usage: { ...model.usage, sevenDays: model.usage.thirtyDays } })) };
    const html = renderToStaticMarkup(createElement(TarsUsageView, { state: ready(thirty), onReload: noop }));
    const total = thirty.totals.sevenDays;
    expect(total.costUsd).not.toBeNull();
    expect(html).toContain('data-tars-usage-total="cost"');
    expect(html).toContain(`Cost was reported on ${total.costReportedTurns} of ${total.turns} turns; the rest have none.`);
    expect(html).toContain("claude-sonnet-5-5");
    // Without an opener a work is plain text, not a dead button.
    expect(html).not.toContain('aria-label="Open ');
  });

  test("a work row opens that work", async () => {
    await applyAppLocale("en");
    const value = await report();
    const opened: string[] = [];
    // The report is rendered by an inner component: find it in the view's output and call it too, inside the capture.
    const find = (node: ReactNode): ReactNode => {
      if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
      if (!isValidElement(node)) return null;
      const props = node.props as { report?: TarsUsageReport; children?: ReactNode };
      return props.report ? (node.type as (props: object) => ReactNode)(node.props as object) : find(props.children);
    };
    const inner = capture(() => find(TarsUsageView({ state: ready(value), onReload: noop, onOpenWork: (id) => opened.push(id) }))).tree;
    const first = value.works.filter((work) => work.usage.sevenDays.turns > 0).sort((a, b) => b.usage.sevenDays.tokens - a.usage.sevenDays.tokens)[0]!;
    handlersOf(inner).find((handler) => handler.label === `Open ${first.title}`)!.onClick();
    expect(opened).toEqual([first.responsibilityId]);
  });

  test("empty, partial, unavailable and failed states are said, never filled with numbers", async () => {
    await applyAppLocale("en");
    const period = tarsUsageWindows(NOW);
    const empty = aggregateTarsUsage({ period, works: [], turns: [], replies: null, generatedAt: NOW.toISOString(), truncated: true, omittedWorks: 3 });
    const html = renderToStaticMarkup(createElement(TarsUsageView, { state: ready(empty), onReload: noop }));
    expect(html).toContain("data-tars-usage-empty");
    expect(html).toContain("No turns ran in this period.");
    // No turn reported tokens: the total says so instead of showing 0.
    expect(html).toContain("Not reported");
    expect(html).not.toContain("data-tars-usage-breakdown");
    expect(html).toContain("could not be counted");
    expect(html).toContain("these totals are a lower bound");
    expect(html).toContain("3 older pieces of work were not read.");
    const render = (state: TarsUsageState) => renderToStaticMarkup(createElement(TarsUsageView, { state, onReload: noop }));
    expect(render({ status: "unavailable", report: null })).toContain("Usage cannot be read here.");
    const failed = render({ status: "failed", report: null });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Usage could not be read.");
    expect(render({ status: "loading", report: null })).toContain("Reading usage…");
  });

  test("Korean copy", async () => {
    await applyAppLocale("ko");
    const html = renderToStaticMarkup(createElement(TarsUsageView, { state: ready(await report()), onReload: noop, onOpenWork: noop }));
    for (const label of ["오늘", "7일", "30일", "토큰", "작업 시간", "작업별", "모델별"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain("Tars 자신의 답변에 쓰인 토큰은 기록되지 않습니다.");
    expect(html).toContain("보조 Task의 턴은 포함되지 않습니다.");
  });
});
