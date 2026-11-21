import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tarsCiPullRequest } from "../src/lib/tars/pr-ci";
import { askTarsAboutPrCi, openTarsIntake, stageTarsPrCiFix } from "../src/components/tars/ask-tars";
import { TrackerIssueDetailPane } from "../src/components/layout/issues/TrackerIssueDetailPane";
import { useAppStore } from "../src/store/app.store";
import { resetTarsDraftForTests, setTarsDraftTarget, setTarsDraftText, useTarsDraftStore } from "../src/store/tars-draft-store";
import { i18n, applyAppLocale } from "../src/i18n";
import { parseGitHubIssue } from "../electron/main/tracker-issues/github-source";

const initialWindow = globalThis.window;
const initialOpenTars = useAppStore.getState().openTars;
afterEach(() => {
  resetTarsDraftForTests();
  globalThis.window = initialWindow;
  useAppStore.setState({ openTars: initialOpenTars });
  applyAppLocale("en");
});

test("opening intake hydrates and preserves saved direction without ever sending", async () => {
  let sends = 0;
  let opens = 0;
  const api = {
    getDraft: async () => ({ text: "Keep my saved direction.", includeWorkingChanges: true, requestId: null }),
    saveDraft: async () => {},
    sendMessage: async () => { sends++; throw new Error("Must not send from intake."); },
  };
  globalThis.window = { api: { tars: api } } as unknown as Window & typeof globalThis;
  useAppStore.setState({ openTars: () => { opens++; } });
  await openTarsIntake({ text: "Review the source.", attachments: [] });
  expect(useTarsDraftStore.getState()).toMatchObject({ ready: true, text: "Keep my saved direction.\n\nReview the source.", includeWorkingChanges: true, requestId: null });
  expect(opens).toBe(1);
  expect(sends).toBe(0);
});

test.each(["en", "ko"] as const)("issue action and document link control are localized in %s", async (locale) => {
  applyAppLocale(locale);
  await i18n.changeLanguage(locale);
  const task = parseGitHubIssue({ number: 1, title: "Launch", url: "https://github.com/team/project/issues/1", state: "OPEN",
    createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z" })!;
  const pane = renderToStaticMarkup(createElement(TrackerIssueDetailPane, { item: { task, staveLinks: [] },
    now: new Date("2026-11-12T00:00:00Z"), onKickoff() {}, onAttach() {}, onOpenStaveTask() {},
    attachTargetLabel: null, messageFontSize: 14, messageCodeFontSize: 13 }));
  expect(pane).toContain(locale === "en" ? "Ask Tars" : "Tars에게 요청");
});

test.each(["en", "ko"] as const)("the PR menu opens a reviewable CI request in %s", async locale => {
  await i18n.changeLanguage(locale);
  const url = "https://github.com/team/project/pull/12";
  let opens = 0;
  globalThis.window = { api: { tars: { getDraft: async () => null } } } as unknown as Window & typeof globalThis;
  useAppStore.setState({ openTars: () => { opens++; } });
  await askTarsAboutPrCi(url);
  const text = useTarsDraftStore.getState().text;
  expect(text).toBe(i18n.t("sourceControl:tarsCI.request", { url }));
  expect(tarsCiPullRequest(text)).toEqual({ url, mixed: false });
  expect(opens).toBe(1);
});

test.each(["en", "ko"] as const)("fix draft preserves unsent words and binds the clicked PR in %s", async locale => {
  await i18n.changeLanguage(locale);
  setTarsDraftText("Why did CI fail?");
  setTarsDraftTarget({ responsibilityId: "other-work" });
  const clicked = "https://github.com/team/project/pull/42";
  expect(stageTarsPrCiFix(clicked)).toBe(true);
  const draft = useTarsDraftStore.getState();
  expect(draft.text).toBe("Why did CI fail?\n\n" + i18n.t("sourceControl:tarsCI.fixRequest", { url: clicked }));
  expect(draft.target).toBeUndefined();
  expect(tarsCiPullRequest(draft.text)).toBeNull();
});
