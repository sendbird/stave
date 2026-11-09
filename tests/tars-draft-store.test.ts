import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  appendTarsDraft, beginTarsDraftSend, flushTarsDraft, hydrateTarsDraft, resetTarsDraftForTests, setTarsDraftText, setTarsDraftWorkingChanges,
  settleTarsDraftSend, TARS_DRAFT_SAVE_DELAY_MS, useTarsDraftStore,
} from "../src/store/tars-draft-store";
import { TARS_DRAFT_MAX_CHARS, type SaveTarsComposerDraftInput, type TarsComposerDraft } from "../src/lib/tars/composer-draft";

/** A host that saves drafts like the desktop bridge: one row, written in call order. */
function fakeBridge(initial: TarsComposerDraft | null = null) {
  const host = { saved: initial, writes: [] as (TarsComposerDraft | null)[], failSave: false, read: null as Promise<TarsComposerDraft | null> | null };
  return {
    host,
    bridge: {
      getDraft: () => host.read ?? Promise.resolve(host.saved),
      saveDraft: async ({ draft }: SaveTarsComposerDraftInput) => {
        if (host.failSave) throw new Error("disk full");
        host.writes.push(draft);
        host.saved = draft;
      },
    },
  };
}
const draft = () => {
  const { text, includeWorkingChanges, requestId, ready } = useTarsDraftStore.getState();
  return { text, includeWorkingChanges, requestId, ready };
};

beforeEach(() => resetTarsDraftForTests());
afterEach(() => resetTarsDraftForTests());

describe("Tars composer draft", () => {
  test("a saved draft is restored on hydration, and the composer is ready only after the read", async () => {
    const { bridge, host } = fakeBridge({ text: "Saved words", includeWorkingChanges: true, requestId: null });
    let resolve!: (value: TarsComposerDraft | null) => void;
    host.read = new Promise((done) => { resolve = done; });
    const hydrating = hydrateTarsDraft(bridge);
    expect(draft().ready).toBe(false);
    resolve(host.saved);
    await hydrating;
    expect(draft()).toEqual({ text: "Saved words", includeWorkingChanges: true, requestId: null, ready: true });
  });

  test("words typed before a slow read win over the saved copy", async () => {
    const { bridge, host } = fakeBridge({ text: "Older saved words", includeWorkingChanges: false, requestId: null });
    let resolve!: (value: TarsComposerDraft | null) => void;
    host.read = new Promise((done) => { resolve = done; });
    const hydrating = hydrateTarsDraft(bridge);
    setTarsDraftText("Typed now");
    resolve(host.saved);
    await hydrating;
    expect(draft().text).toBe("Typed now");
  });

  test("an unreadable draft store still leaves a working composer, kept for this window", async () => {
    await hydrateTarsDraft({ getDraft: () => Promise.reject(new Error("locked")), saveDraft: async () => {} });
    expect(draft().ready).toBe(true);
    await hydrateTarsDraft(undefined);
    setTarsDraftText("In memory only");
    await flushTarsDraft();
    expect(draft()).toMatchObject({ text: "In memory only", ready: true });
  });

  test("typing is saved after a pause, the latest words win, and an empty draft deletes the row", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("F");
    setTarsDraftText("Fix the export");
    expect(host.writes).toEqual([]);
    await Bun.sleep(TARS_DRAFT_SAVE_DELAY_MS + 50);
    expect(host.writes).toEqual([{ text: "Fix the export", includeWorkingChanges: false, requestId: null }]);
    setTarsDraftText("");
    await flushTarsDraft();
    expect(host.saved).toBeNull();
  });

  test("appending keeps what is there, separated by a blank line", async () => {
    await hydrateTarsDraft(undefined);
    appendTarsDraft("First");
    appendTarsDraft("About src/a.ts, lines 2–3:");
    expect(draft().text).toBe("First\n\nAbout src/a.ts, lines 2–3:");
  });

  test("a successful send clears the draft that sent it", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("Ship it");
    setTarsDraftWorkingChanges(true);
    const sending = await beginTarsDraftSend();
    // The request ID is saved with the draft before the message goes out, so the host can drop this exact draft.
    expect(host.saved).toEqual({ text: "Ship it", includeWorkingChanges: true, requestId: sending.requestId });
    settleTarsDraftSend({ ...sending, outcome: "sent" });
    await flushTarsDraft();
    expect(draft()).toMatchObject({ text: "", includeWorkingChanges: false, requestId: null });
    expect(host.saved).toBeNull();
  });

  test("a send that did not go through keeps the words and its request ID, so the retry is the same request", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("Retry me");
    const first = await beginTarsDraftSend();
    settleTarsDraftSend({ ...first, outcome: "unsent" });
    expect(draft()).toMatchObject({ text: "Retry me", requestId: first.requestId });
    expect(host.saved).toEqual({ text: "Retry me", includeWorkingChanges: false, requestId: first.requestId });
    expect((await beginTarsDraftSend()).requestId).toBe(first.requestId);
  });

  test("any edit after a failed send is a new message with a new request ID", async () => {
    await hydrateTarsDraft(fakeBridge().bridge);
    setTarsDraftText("Retry me");
    const first = await beginTarsDraftSend();
    settleTarsDraftSend({ ...first, outcome: "unsent" });
    setTarsDraftText("Retry me, please");
    expect(draft().requestId).toBeNull();
    expect((await beginTarsDraftSend()).requestId).not.toBe(first.requestId);
    setTarsDraftWorkingChanges(true);
    expect(draft().requestId).toBeNull();
  });

  test("a message that exists but failed keeps the words for a new message", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("Explain the failure");
    const sending = await beginTarsDraftSend();
    // The host drops the draft when it saves the message; the renderer writes the kept words back.
    host.saved = null;
    settleTarsDraftSend({ ...sending, outcome: "failed" });
    await flushTarsDraft();
    expect(draft()).toMatchObject({ text: "Explain the failure", requestId: null });
    expect(host.saved).toEqual({ text: "Explain the failure", includeWorkingChanges: false, requestId: null });
  });

  test("words added while a send was in flight stay as a newer draft the settle does not touch", async () => {
    await hydrateTarsDraft(fakeBridge().bridge);
    setTarsDraftText("Sent words");
    const sending = await beginTarsDraftSend();
    appendTarsDraft("Quoted lines");
    settleTarsDraftSend({ ...sending, outcome: "sent" });
    expect(draft()).toMatchObject({ text: "Sent words\n\nQuoted lines", requestId: null });
  });

  test("a sent draft with surrounding whitespace is cleared, though the composer sent it trimmed", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("  Padded words\n");
    const sending = await beginTarsDraftSend();
    expect(sending.text).toBe("  Padded words\n");
    settleTarsDraftSend({ ...sending, outcome: "sent" });
    await flushTarsDraft();
    expect(draft().text).toBe("");
    expect(host.saved).toBeNull();
  });

  test("a late settle from an earlier send leaves a newer send's draft, request ID and choice alone", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("First message");
    const first = await beginTarsDraftSend();
    // The view was left and reopened while the first send was in flight; the user wrote and sent another.
    setTarsDraftText("Second message");
    setTarsDraftWorkingChanges(true);
    const second = await beginTarsDraftSend();
    settleTarsDraftSend({ ...first, outcome: "sent" });
    expect(draft()).toMatchObject({ text: "Second message", includeWorkingChanges: true, requestId: second.requestId });
    settleTarsDraftSend({ ...first, outcome: "failed" });
    expect(draft().requestId).toBe(second.requestId);
    settleTarsDraftSend({ ...second, outcome: "sent" });
    await flushTarsDraft();
    expect(draft()).toMatchObject({ text: "", includeWorkingChanges: false, requestId: null });
    expect(host.saved).toBeNull();
  });

  test("a failed save stays unsaved: the next flush retries it without another edit, and the flush reports the result", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    host.failSave = true;
    setTarsDraftText("Keep me");
    expect(await flushTarsDraft()).toBe(false);
    host.failSave = false;
    expect(await flushTarsDraft()).toBe(true);
    expect(host.saved?.text).toBe("Keep me");
    // Nothing left to write: a quit flush still reports success.
    expect(await flushTarsDraft()).toBe(true);
    warn.mockRestore();
  });

  test("a failed save keeps the draft in memory, never logs its words, and the next change saves again", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    host.failSave = true;
    setTarsDraftText("Private words");
    await flushTarsDraft();
    expect(draft().text).toBe("Private words");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Private words");
    warn.mockRestore();
    host.failSave = false;
    setTarsDraftText("Private words again");
    await flushTarsDraft();
    expect(host.saved?.text).toBe("Private words again");
  });

  test("a draft over the stored limit stays in memory and leaves the last saved copy", async () => {
    const { bridge, host } = fakeBridge();
    await hydrateTarsDraft(bridge);
    setTarsDraftText("Short");
    await flushTarsDraft();
    setTarsDraftText("x".repeat(TARS_DRAFT_MAX_CHARS + 1));
    await flushTarsDraft();
    expect(host.saved?.text).toBe("Short");
    expect(draft().text).toHaveLength(TARS_DRAFT_MAX_CHARS + 1);
  });
});
