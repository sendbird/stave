import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { parseGitHubIssue } from "../electron/main/tracker-issues/github-source";
import { buildTarsDocumentDraft, buildTarsDocumentLinkDraft, buildTarsIssueDraft,
  recognizeTarsSlackLinks, tarsSourceLinkGuidance, TARS_ISSUE_EXCERPT_MAX_CHARS } from "../src/lib/tars/intake";
import { stageTarsIntake } from "../src/store/tars-intake";
import { beginTarsDraftSend, resetTarsDraftForTests, setTarsDraftText, useTarsDraftStore } from "../src/store/tars-draft-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { tarsRunAttachmentContext, tarsWorkAttachmentsOf } from "../src/lib/tars/work-attachments";
import { tarsExecutionInstructions } from "../electron/host-service/tars-execution";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { TarsStore } from "../electron/persistence/tars-store";
import { SETTINGS, testContext } from "./tars-test-context";
import { i18n } from "../src/i18n/runtime";

const task = parseGitHubIssue({ number: 1, title: "Preserve unsent direction", url: "https://github.com/team/project/issues/1",
  state: "OPEN", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z" })!;
const NOW = "2026-11-12T00:00:00.000Z";
const thread = "https://team.slack.com/archives/C123/p1234567890123456?thread_ts=1234567890.123456&cid=C123";
afterEach(() => { resetTarsDraftForTests(); void i18n.changeLanguage("en"); });

describe("Tars intake drafts", () => {
  test.each(["github", "jira", "crane"] as const)("quotes a bounded %s issue and its mapped target", (source) => {
    const draft = buildTarsIssueDraft({ task: { ...task, source }, request: "Handle this issue.", description: "body".repeat(4_000),
      repositoryPath: "/tmp/project", workspaceId: "workspace" });
    const context = JSON.parse(draft.text.slice(draft.text.indexOf("{")));
    expect(context).toMatchObject({ source, title: task.title, url: task.url, suggestedRepository: "/tmp/project", suggestedWorkspace: "workspace", truncated: true });
    expect(context.excerpt).toHaveLength(TARS_ISSUE_EXCERPT_MAX_CHARS);
    expect(draft.text.length).toBeLessThan(12_000);
    expect(draft.attachments).toEqual([]);
    expect(draft.text).toContain("Untrusted issue context");
  });
  test("bounds even escaped source text in the final serialized draft", () => {
    const draft = buildTarsIssueDraft({ task, request: "Work on this issue.", description: "\0".repeat(20_000), repositoryPath: "\0".repeat(4_096) });
    expect(draft.text.length).toBeLessThan(12_000);
    expect(JSON.parse(draft.text.slice(draft.text.indexOf("{"))).truncated).toBe(true);
  });
  test("snapshots a plan file through draft, explicit send and persisted attachment resolution", async () => {
    const draft = buildTarsDocumentDraft({ filePath: ".stave/context/plans/launch.md", content: "# Launch\n요구 사항", request: "Plan this work." });
    setTarsDraftText("Keep existing scope.");
    stageTarsIntake(draft);
    // Staging mints no request or responsibility; only the real composer send does.
    expect(useTarsDraftStore.getState()).toMatchObject({ text: "Keep existing scope.\n\nPlan this work.", requestId: null });
    const sending = await beginTarsDraftSend();
    expect(sending?.attachments).toEqual([{ type: "file_context", filePath: "launch.md", language: "markdown", content: "# Launch\n요구 사항" }]);
    const db = new Database(":memory:");
    try {
      const store = new TarsConversationStore(db);
      store.configure(SETTINGS);
      const message = store.create({ requestId: sending!.requestId, text: sending!.text, attachments: [...sending!.attachments] }, NOW);
      const saved = store.get(message.id)!;
      const reference = tarsWorkAttachmentsOf(saved)!;
      expect(tarsRunAttachmentContext(reference, saved.attachments ?? null)).toEqual({ fileContexts: [{ filePath: "launch.md", content: "# Launch\n요구 사항", language: "markdown" }] });
    } finally { db.close(); }
  });
  test("accepts 32,000 UTF-8 bytes and rejects larger or non-Markdown snapshots", () => {
    expect(buildTarsDocumentDraft({ filePath: "prd.md", content: "가".repeat(10_666) + "ab", request: "Plan it." }).attachments).toHaveLength(1);
    for (const [filePath, content] of [["prd.md", "가".repeat(10_667)], ["prd.pdf", "text"], ["prd.md", "bad\0data"]]) {
      expect(() => buildTarsDocumentDraft({ filePath: filePath!, content: content!, request: "Plan it." })).toThrow();
    }
  });
  test("combined attachment overflow and in-flight file reads preserve the entire existing draft", () => {
    const first = buildTarsDocumentDraft({ filePath: "prd.md", content: "a".repeat(32_000), request: "First." });
    stageTarsIntake(first);
    const current = useTarsDraftStore.getState();
    expect(() => stageTarsIntake(buildTarsDocumentDraft({ filePath: "next.md", content: "b", request: "Second." }))).toThrow();
    expect(useTarsDraftStore.getState()).toBe(current);
    useTarsDraftStore.setState({ reading: true });
    expect(() => stageTarsIntake({ text: "Next.", attachments: [] })).toThrow();
    expect(useTarsDraftStore.getState().text).toBe("First.");
  });
  test("same basenames remain separate and too much draft text is never silently truncated", () => {
    const draft = buildTarsDocumentDraft({ filePath: "plan.md", content: "a", request: "Plan." });
    stageTarsIntake(draft); stageTarsIntake(draft);
    expect(useTarsDraftStore.getState().attachments.map((part) => part.type === "file_context" && part.filePath)).toEqual(["plan.md", "2-plan.md"]);
    setTarsDraftText("x".repeat(32_000));
    expect(() => stageTarsIntake(draft)).toThrow();
    expect(useTarsDraftStore.getState().text).toHaveLength(32_000);
  });
  test("document URL attaches a link without fetching or claiming to have its content", () => {
    const draft = buildTarsDocumentLinkDraft({ url: "https://docs.example.test/prd", request: "Plan from this document." });
    expect(draft.text).toContain("https://docs.example.test/prd");
    expect(draft.attachments[0]).toMatchObject({ filePath: "document-link.md", content: expect.stringContaining("has not been fetched") });
    for (const url of ["http://docs.example.test/prd", "file:///tmp/prd.md", "https://user:pass@docs.example.test/prd", "https://docs.example.test/" + "x".repeat(2_048)]) {
      expect(() => buildTarsDocumentLinkDraft({ url, request: "Plan." })).toThrow();
    }
  });
  test.each(["en", "ko"])("uses localized direction in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    const request = i18n.t("shell:tars.intake.issueRequest");
    expect(request).not.toContain("tars.intake");
    expect(buildTarsIssueDraft({ task, request }).text.startsWith(request)).toBe(true);
    expect(i18n.t("shell:tars.intake.ask")).toBe(locale === "en" ? "Ask Tars" : "Tars에게 요청");
  });
});

describe("Slack source links", () => {
  test("recognizes pasted permalinks, preserves query context, deduplicates and bounds the set", () => {
    expect(recognizeTarsSlackLinks(`Read (${thread}) and <${thread}|thread>.`)).toEqual([thread]);
    expect(recognizeTarsSlackLinks(`Read ${thread}.`)).toEqual([thread]);
    expect(recognizeTarsSlackLinks(Array.from({ length: 10 }, (_, index) => `https://team.slack.com/archives/C123/p123456789012345${index}`).join("\n"))).toHaveLength(8);
    for (const url of ["https://team.slack.com.evil.test/archives/C1/p1234567890123456", "https://slack.com/archives/C1/p1234567890123456",
      "https://team.slack.com/channels/C1", "http://team.slack.com/archives/C1/p1234567890123456", "https://user:pass@team.slack.com/archives/C1/p1234567890123456"]) {
      expect(recognizeTarsSlackLinks(url)).toEqual([]);
    }
    expect(tarsSourceLinkGuidance("no link")).toBeNull();
  });
  test("the real planner and execution lead receive read-only tools and paste fallback instructions", () => {
    const db = new Database(":memory:");
    try {
      const conversations = new TarsConversationStore(db);
      conversations.configure(SETTINGS);
      const message = conversations.create({ requestId: "slack", text: `Handle the request in ${thread}` }, NOW);
      const prompt = buildTarsPlannerPrompt(message, testContext(new TarsStore(db)), []);
      const lead = tarsExecutionInstructions({ model: null, agentId: null, instruction: message.text });
      for (const instructions of [prompt, lead]) {
        expect(instructions).toContain(thread);
        expect(instructions).toContain("read-only with the user's Slack tools");
        expect(instructions).toContain("ask the user to paste the thread text");
        expect(instructions).toContain("Do not post, react, or modify Slack");
      }
      expect(tarsExecutionInstructions({ model: null, agentId: null, mandate: message.text })).toContain(thread);
    } finally { db.close(); }
  });
});
