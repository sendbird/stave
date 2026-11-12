import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openTarsIntake } from "../src/components/tars/ask-tars";
import { TarsDocumentLink } from "../src/components/tars/TarsDocumentLink";
import { TrackerIssueDetailPane } from "../src/components/layout/issues/TrackerIssueDetailPane";
import { useAppStore } from "../src/store/app.store";
import { resetTarsDraftForTests, useTarsDraftStore } from "../src/store/tars-draft-store";
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
  const link = renderToStaticMarkup(createElement(TarsDocumentLink, { disabled: true }));
  expect(link).toContain(`aria-label="${locale === "en" ? "Attach document link" : "문서 링크 첨부"}"`);
  expect(link).toContain("disabled");
});
