import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import en from "../src/locales/en/shell.json";
import ko from "../src/locales/ko/shell.json";
import { TarsStart, TarsStartContext, type TarsStartInfo } from "../src/components/tars/TarsStart";
import { TarsConversation } from "../src/components/tars/TarsConversation";
import type { TarsConversationState } from "../src/components/tars/use-tars-conversation";
import { TarsDecisionActionSchema } from "../src/lib/tars/conversation";
import {
  buildTarsStartCounts, buildTarsStartGroups, listTarsStartRepositories, TARS_START_EXAMPLES, TARS_START_GROUPS, TARS_START_REPOSITORIES_MAX,
} from "../src/lib/tars/start";
import { buildTarsSuggestions, type TarsSuggestion } from "../src/lib/tars/suggestions";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { TarsResponsibilitySchema, type TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-05T12:00:00.000Z";
function work(id: string, overrides: Partial<TarsResponsibility> = {}): TarsResponsibility {
  return TarsResponsibilitySchema.parse({ id, requestId: `request-${id}`, title: `Work ${id}`, instruction: "Do it.", acceptanceCriteria: ["Done."],
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex", model: null, priority: 50, maxTurns: 30, revision: 1, state: "running",
    detail: null, taskId: null, executionWorkspaceId: null, agentRunId: `run-${id}`, reverifyAfter: null, createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z", ...overrides });
}
const tray = (rows: TarsResponsibility[], attention: Array<{ id: string; kind: string; tarsResponsibilityId: string }> = []) =>
  buildTarsTray({ responsibilities: rows, attentionItems: attention, runs: {} });
const info = (overrides: Partial<TarsStartInfo> = {}): TarsStartInfo => ({ counts: [], onOpenCount() {}, repositories: ["web"], canPublish: true, canClear: true, ...overrides });
const render = (value: TarsStartInfo, suggestions?: readonly Pick<TarsSuggestion, "kind">[]) =>
  renderToStaticMarkup(createElement(TarsStart, { name: "Tars", info: value, suggestions, onExample() {} }));
const examplesIn = (html: string) => [...html.matchAll(/data-tars-start-example="([^"]+)"/g)].map((match) => match[1]!);
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("start screen examples", () => {
  test("name only action kinds the planner's schema and prompt support, and every kind has an example", () => {
    const schemaKinds = TarsDecisionActionSchema.options.map((option) => (option as unknown as { shape: { kind: { value: string } } }).shape.kind.value);
    expect(schemaKinds.sort()).toEqual(["ask", "clear", "control", "delegate", "publish", "reprioritize", "show"]);
    const offered = new Set(TARS_START_EXAMPLES.map((example) => example.action));
    for (const kind of offered) if (kind !== "reply") expect(schemaKinds).toContain(kind);
    for (const kind of schemaKinds) expect(offered.has(kind as never)).toBe(true);
    // The planner is told the same kinds in its instructions; a status question needs no action.
    const planner = readFileSync(new URL("../electron/main/tars-planner.ts", import.meta.url), "utf8");
    for (const kind of schemaKinds) expect(planner).toContain(`{kind:'${kind}'`);
    expect(planner).toContain("status requests return actions:[]");
    expect(new Set(TARS_START_EXAMPLES.map((example) => example.id)).size).toBe(TARS_START_EXAMPLES.length);
    for (const example of TARS_START_EXAMPLES) expect(TARS_START_GROUPS).toContain(example.group);
  });

  test("leave out what cannot be done now: work without a repository, publishing and clearing without their bridge", () => {
    const ids = (args: Parameters<typeof buildTarsStartGroups>[0]) => buildTarsStartGroups(args).flatMap((group) => group.examples.map((example) => example.id));
    expect(ids({ repositories: 2, canPublish: true, canClear: true })).toEqual(TARS_START_EXAMPLES.map((example) => example.id));
    const none = buildTarsStartGroups({ repositories: 0, canPublish: false, canClear: false });
    expect(none.map((group) => group.id)).toEqual(["steer", "answer", "show"]);
    expect(none.flatMap((group) => group.examples.map((example) => example.action))).not.toContain("delegate");
    // Unknown repositories hide nothing; a known zero does.
    expect(ids({ repositories: null, canPublish: false, canClear: false })).toContain("delegate");
  });

  test("an example a chip already asks about real work is not offered twice", () => {
    const rows = [work("blocked", { state: "blocked" }), work("done", { state: "completed", updatedAt: "2026-11-05T10:00:00.000Z" }), work("running")];
    const suggestions = buildTarsSuggestions({ tray: tray(rows, [{ id: "a", kind: "tars-blocked", tarsResponsibilityId: "blocked" }]), messages: [], receipts: [], now: NOW });
    expect(suggestions.map((entry) => entry.kind)).toEqual(["needsYou", "blocked", "report", "progress"]);
    const shown = examplesIn(render(info(), suggestions));
    for (const id of ["status", "options", "report"]) expect(shown).not.toContain(id);
    expect(shown).toEqual(["delegate", "pause", "queue", "answerWaiting", "changes", "publish", "clearConversation", "clearDone"]);
    // Without chips every example is back.
    expect(examplesIn(render(info()))).toEqual(TARS_START_EXAMPLES.map((example) => example.id));
    // No start example and chip put the same words in the message box.
    const chipPrompts = new Set(Object.values(en.tars.suggestions).flatMap((entry) => typeof entry === "string" ? [] : Object.entries(entry).filter(([key]) => key.startsWith("prompt")).map(([, value]) => value)));
    for (const example of TARS_START_EXAMPLES) expect(chipPrompts.has(en.tars.start.examples[example.id].prompt)).toBe(false);
  });

  test("the empty conversation places the start screen with what the Tars view published, and only while it is empty", () => {
    const conversation = { settings: null, messages: [], receipts: [], activity: [], records: [] };
    const state = (value: unknown) => ({ conversation: value, error: null, busy: false, available: true,
      refresh: async () => {}, send: async () => null, configure: async () => null, cancel: async () => null }) as unknown as TarsConversationState;
    const suggestions = buildTarsSuggestions({ tray: tray([work("done", { state: "completed", updatedAt: "2026-11-05T10:00:00.000Z" })]), messages: [], receipts: [], now: NOW });
    const html = (value: unknown) => renderToStaticMarkup(createElement(TarsStartContext, { value: info({ repositories: ["web", "docs"] }) },
      createElement(TarsConversation, { state: state(value), name: "Ada", suggestions, initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } })));
    const empty = html(conversation);
    expect(empty).toContain(escaped("Hi, I'm Ada."));
    expect(empty).toContain('data-tars-start-repositories="2"');
    // The message box is not ready in a server render, so no chip shows and no example is held back for one.
    expect(empty).not.toContain("data-tars-suggestion=");
    expect(examplesIn(empty)).toContain("report");
    // The start screen leads the transcript, before the composer.
    expect(empty.indexOf("data-tars-start=")).toBeLessThan(empty.indexOf("data-tars-composer="));
    // Before the conversation was read there is no start screen.
    expect(html(null)).not.toContain("data-tars-start=");
  });
});

describe("start screen", () => {
  test("zero state: the greeting with the configured name, examples, and no Right now", () => {
    const html = render(info({ repositories: ["web"] }));
    expect(html).toContain(escaped("Hi, I'm Tars."));
    expect(render({ ...info(), counts: [] })).not.toContain("data-tars-start-now");
    expect(renderToStaticMarkup(createElement(TarsStart, { name: "Ada", info: info(), onExample() {} }))).toContain(escaped("Hi, I'm Ada."));
    expect(buildTarsStartCounts({ tray: tray([]), now: NOW })).toEqual([]);
    // Before the work was read nothing is claimed.
    expect(buildTarsStartCounts({ tray: null, now: NOW })).toEqual([]);
    // Each example is a button named by its label, carrying the full request as its title.
    expect(html).toMatch(new RegExp(`<button[^>]*title="${escaped(en.tars.start.examples.pause.prompt)}"[^>]*data-tars-start-example="pause"`));
    for (const group of TARS_START_GROUPS) expect(html).toContain(`data-tars-start-group="${group}"`);
    expect(html).toContain(escaped(en.tars.start.examples.groups.delegate));
  });

  test("Right now counts what needs the user, runs and finished today, each with its tray lane and first work", () => {
    const rows = [
      work("blocked", { state: "blocked" }), work("running"), work("second"), work("queued", { state: "queued", agentRunId: null }),
      work("old", { state: "completed", updatedAt: "2026-11-03T10:00:00.000Z" }), work("early", { state: "completed", updatedAt: "2026-11-05T08:00:00.000Z" }),
      work("late", { state: "completed", updatedAt: "2026-11-05T11:00:00.000Z" }), work("cancelled", { state: "cancelled", updatedAt: "2026-11-05T11:30:00.000Z" }),
    ];
    const model = tray(rows, [{ id: "a", kind: "tars-blocked", tarsResponsibilityId: "blocked" }]);
    const counts = buildTarsStartCounts({ tray: model, now: NOW });
    expect(counts).toEqual([
      { kind: "needsYou", count: 1, lane: "needsYou", responsibilityId: "blocked" },
      { kind: "running", count: model.counts.running, lane: "running", responsibilityId: null },
      // Only work that completed in the last day; the newest is where the lane opens.
      { kind: "finishedToday", count: 2, lane: "done", responsibilityId: "late" },
    ]);
    expect(model.counts.running).toBe(2);
    const html = render(info({ counts }));
    expect(html).toContain("data-tars-start-now");
    expect(html).toMatch(/data-tars-start-count="needsYou" data-tars-start-count-value="1"[^>]*>.*?1 needs you/);
    expect(html).toContain("2 running");
    expect(html).toContain("2 finished today");
    // Each count says where it opens, as its description.
    expect(html).toContain(en.tars.start.now.open.finishedToday);
    expect(html).toMatch(/aria-describedby="[^"]+-open-needsYou"/);
    // A count of zero is left out; all zero hides the section.
    expect(buildTarsStartCounts({ tray: tray([work("running")]), now: NOW }).map((entry) => entry.kind)).toEqual(["running"]);
  });

  test("lists registered repositories by name, capped with how many more, or says how to add one", () => {
    const names = listTarsStartRepositories({ registered: [{ repositoryPath: "/tmp/a", repositoryName: "a" }, { repositoryPath: "/tmp/b", repositoryName: "" }],
      current: { repositoryPath: "/tmp/a", repositoryName: "a" } });
    expect(names).toEqual(["a", "b"]);
    expect(listTarsStartRepositories({ registered: [], current: { repositoryPath: "/tmp/open", repositoryName: null } })).toEqual(["open"]);
    expect(listTarsStartRepositories({ registered: [], current: { repositoryPath: null, repositoryName: null } })).toEqual([]);
    const many = ["a", "b", "c", "d", "e", "f"];
    const html = render(info({ repositories: many }));
    expect([...html.matchAll(/data-tars-start-repository=""/g)]).toHaveLength(TARS_START_REPOSITORIES_MAX);
    expect(html).toContain('data-tars-start-repositories-more="2"');
    expect(html).toContain("+2 more");
    expect(html).not.toContain(">e</span>");
    const none = render(info({ repositories: [] }));
    expect(none).toContain("data-tars-start-no-repositories");
    expect(none).toContain("Open repository");
    expect(none).not.toContain('data-tars-start-example="delegate"');
    // Outside a Tars view nothing is known about repositories, so nothing is said.
    expect(render(info({ repositories: null }))).not.toContain("data-tars-start-repositories");
  });

  test("Korean copy uses the same keys and renders", async () => {
    const keys = (value: unknown, prefix = ""): string[] => value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key.replace(/_(one|other)$/, "")}.`)) : [prefix];
    expect([...new Set(keys(ko.tars.start))].sort()).toEqual([...new Set(keys(en.tars.start))].sort());
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const html = render(info({ counts: [{ kind: "needsYou", count: 2, lane: "needsYou", responsibilityId: null }], repositories: [] }));
    expect(html).toContain("안녕하세요, Tars입니다.");
    expect(html).toContain("확인 필요 2건");
    expect(html).toContain(ko.tars.start.examples.groups.steer);
    expect(html).toContain("저장소 열기");
  });
});
