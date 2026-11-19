import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsTrayCard, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsTray, type TarsTrayCard as TarsTrayCardModel } from "../src/lib/tars/tray-model";
import type { TarsResponsibility } from "../src/lib/tars/types";

// Ten minutes ago: the running fixture's run was last observed a minute ago, so its progress is current, not stale.
const start = new Date(Date.now() - 10 * 60_000);
const actions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {}, onOpenSide() {}, onFollowUp() {} };

/** The five cases the card must read in three lines: waiting on my decision, running, queued, blocked, finished with a pull request. */
function cases(): Record<"waiting" | "running" | "queued" | "blocked" | "finished", TarsTrayCardModel> {
  const tray = buildTarsTrayFixtures(start);
  const side = buildTarsSideViewFixtures(start);
  const queued: TarsResponsibility = { ...tray.responsibilities[1]!, id: "queued", requestId: "request-queued", title: "Speed up the search index rebuild", state: "queued",
    queueWait: { code: "capacity", active: 1, limit: 1 }, branchName: undefined, taskId: null, agentRunId: null, executionWorkspaceId: null };
  const checkout = side.responsibilities.find((row) => row.id === "checkout")!;
  const published: TarsResponsibility = { ...checkout, publication: { state: "opened", failedStep: null, commit: "f00ba12", branch: "tars/checkout", base: "main",
    commitMessage: "fix: show the saved card first", title: checkout.title, url: "https://example.com/acme/shop/pull/42", number: 42, error: null, reason: null, updatedAt: start.toISOString() } };
  const model = buildTarsTray({ responsibilities: [...tray.responsibilities, queued, published, side.responsibilities.find((row) => row.id === "search")!],
    attentionItems: tray.attentionItems, runs: { ...tray.runs, ...side.runs }, pendingDecisions: tray.pendingDecisions });
  const card = (id: string) => Object.values(model.lanes).flat().find((value) => value.row.id === id)!;
  return { waiting: card("release"), running: card("billing"), queued: card("queued"), blocked: card("search"), finished: card("checkout") };
}

/** What the card shows before its detail is opened: everything ahead of the detail, which stays folded. */
function folded(html: string) {
  const at = html.indexOf("data-tars-card-detail");
  return at < 0 ? html : html.slice(0, html.lastIndexOf("<", at));
}

const controls = (html: string) => [...html.matchAll(/<(button|a)\b[^>]*>/g)].map(([tag]) => tag);

describe("a Tars work card reads in three lines", () => {
  test("folded, a card holds its title, one sentence, its state and one action; nothing else", async () => {
    await applyAppLocale("en");
    const expected = {
      waiting: { state: "waiting", word: "Waiting for you", sentence: "Tars proposes to resume this work.", action: "Confirm resume" },
      running: { state: "working", word: "Working", sentence: "Now: Cause, attempt 2", action: "Open task" },
      queued: { state: "on-hold", word: "Waiting", sentence: "Execution limit reached (1 active / 1 allowed). Starts when a slot is released.", action: "Start now" },
      blocked: { state: "blocked", word: "Blocked", sentence: "Stopped with some completion criteria unmet. Open the report to see what is missing.", action: "Open report" },
      finished: { state: "finished", word: "Finished", sentence: "Draft PR #42 open", action: "Open PR #42" },
    } as const;
    for (const [name, card] of Object.entries(cases())) {
      const want = expected[name as keyof typeof expected];
      const html = renderToStaticMarkup(createElement(TarsTrayCard, { card, actions }));
      const top = folded(html);
      // The title is the detail's disclosure, closed until asked for; beside it there is exactly one action.
      const shown = controls(top);
      expect(shown.length, name).toBe(2);
      expect(shown[0], name).toContain('aria-expanded="false"');
      expect(shown[1], name).toContain("data-tars-card-primary");
      expect(top, name).toContain(card.row.title);
      expect(top, name).toContain(want.sentence);
      expect(top, name).toContain(want.word);
      expect(top, name).toContain(want.action);
      expect(html, name).toContain(`data-task-user-state="${want.state}"`);
      // Owner, helpers, branch, model, goal, stages and the other controls are the detail's.
      for (const moved of ["Owner:", "helpers working", "data-tars-branch", "data-tars-model-selection", "Goal:", "data-run-segments", "Follow up", "data-tars-more-actions", "data-tars-monitor-brief"]) {
        expect(top, `${name}: ${moved}`).not.toContain(moved);
      }
      // Tars's own state words do not show on the card.
      for (const word of ["Paused", "Queued", "Running", "Result ready", "Taken over"]) expect(top, `${name}: ${word}`).not.toContain(`>${word}<`);
    }
  });

  test("everything that left the three lines is still in the card's detail", async () => {
    await applyAppLocale("en");
    const { running, waiting, queued } = cases();
    const html = renderToStaticMarkup(createElement(TarsTrayCard, { card: running, actions }));
    const detail = html.slice(html.indexOf("data-tars-card-detail"));
    expect(html.indexOf("data-tars-card-detail")).toBeGreaterThan(-1);
    for (const kept of ["Owner: Tars · 2 helpers working", `data-tars-branch="${running.branch}"`, "data-tars-model-selection", "Goal:", 'data-run-segments="done,now,pending"',
      'data-tars-monitor-count="2/3"', "Follow up", 'data-tars-action="pause"', `data-tars-more-actions="${running.row.id}"`, "data-tars-monitor-brief", "data-tars-monitor-timeline"]) {
      expect(detail, kept).toContain(kept);
    }
    // The action beside the state is not offered a second time in the detail.
    expect(detail).not.toContain(">Open task<");
    const release = renderToStaticMarkup(createElement(TarsTrayCard, { card: waiting, actions }));
    expect(release.split("Confirm resume").length - 1).toBe(1);
    expect(release.slice(release.indexOf("data-tars-card-detail"))).toContain(">Open task<");
    const waitingInQueue = renderToStaticMarkup(createElement(TarsTrayCard, { card: queued, actions }));
    expect(waitingInQueue.split(">Start now<").length - 1).toBe(1);
  });

  test("work still being prepared offers Open task nowhere, and keeps Pause in its detail", async () => {
    await applyAppLocale("en");
    const tray = buildTarsTrayFixtures(start);
    const preparing: TarsResponsibility = { ...tray.responsibilities.find((row) => row.id === "billing")!, state: "preparing", taskId: "tars-billing", executionWorkspaceId: null, agentRunId: null };
    const card = Object.values(buildTarsTray({ responsibilities: [preparing], attentionItems: [], runs: {} }).lanes).flat()[0]!;
    const html = renderToStaticMarkup(createElement(TarsTrayCard, { card, actions }));
    expect(controls(folded(html)).length).toBe(1);
    // It waits, and says for what: never "Working" over a sentence that says it has not started.
    expect(html).toContain('data-task-user-state="on-hold"');
    expect(folded(html)).toContain("Preparing the workspace. The work starts once it is ready.");
    expect(folded(html)).not.toContain("The work has not started yet");
    expect(html).not.toContain(">Open task<");
    expect(html.slice(html.indexOf("data-tars-card-detail"))).toContain('data-tars-action="pause"');
  });

  test("work the user continued in its task still reads in three lines, and says once whose run it is", async () => {
    await applyAppLocale("en");
    const tray = buildTarsTrayFixtures(start);
    const billing = tray.responsibilities.find((row) => row.id === "billing")!;
    const followed: TarsResponsibility = { ...billing, followedRunId: billing.agentRunId!, detailCode: "followingUserRun", detail: "The host's own English words." };
    const card = Object.values(buildTarsTray({ responsibilities: [followed], attentionItems: [], runs: tray.runs }).lanes).flat()[0]!;
    const html = renderToStaticMarkup(createElement(TarsTrayCard, { card, actions }));
    const top = folded(html);
    const sentence = "You continued this work in its task. Tars follows your run and acts on it only when you confirm.";
    expect(html).toContain('data-task-user-state="working"');
    expect(controls(top).length).toBe(2);
    expect(top).toContain(`>${sentence}<`);
    expect(top).toContain(">Open task<");
    // The stage in hand gives the line to that sentence and stays in the detail's stages; the sentence is not said a second time there.
    expect(top).not.toContain("Now: Cause");
    expect(html.split(`>${sentence}<`).length - 1).toBe(1);
    expect(html.slice(html.indexOf("data-tars-card-detail"))).toContain('data-run-segments="done,now,pending"');
  });

  test("the three lines read in Korean too", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    try {
      const { waiting, finished } = cases();
      const release = folded(renderToStaticMarkup(createElement(TarsTrayCard, { card: waiting, actions })));
      expect(release).toContain(i18n.t("session:taskState.waiting"));
      expect(release).toContain(i18n.t("shell:tars.tray.decision.resume"));
      expect(release).toContain(i18n.t("shell:tars.tray.confirm.resume"));
      const checkout = folded(renderToStaticMarkup(createElement(TarsTrayCard, { card: finished, actions })));
      expect(checkout).toContain(i18n.t("session:taskState.finished"));
      expect(checkout).toContain("PR #42 열기");
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });
});
