import { create } from "zustand";
import {
  TARS_DRAFT_MAX_CHARS, isEmptyTarsComposerDraft, type TarsComposerDraft,
} from "@/lib/tars/composer-draft";
import type { TarsBridgeApi } from "@/lib/tars/types";
import type { AttachmentContext } from "@/lib/providers/attachment-context";

/**
 * The Tars composer draft, outside any component so it outlives the view: a
 * send that settles after the user left Tars still clears (or keeps) the right
 * draft, and coming back shows it at once. The bridge saves it so it survives
 * a restart; without one it lives for this window only.
 *
 * Attached files belong to the draft but stay in memory: they survive leaving
 * Tars and coming back, not a restart (see `TarsComposerDraftSchema`).
 */
export interface TarsDraftState extends Omit<TarsComposerDraft, "requestHadAttachments"> {
  /** The files the next send carries, read once when they were attached. Changing them is an edit, like changing the words. */
  attachments: readonly AttachmentContext[];
  /** The saved draft was read (or there is nothing to read); the composer waits for it so typing is never overwritten. */
  ready: boolean;
}

type DraftBridge = Pick<TarsBridgeApi, "getDraft" | "saveDraft">;

/** Typing is saved after this pause; leaving the view or the window saves at once. */
export const TARS_DRAFT_SAVE_DELAY_MS = 300;

/** One shared empty list, so a selector on `attachments` keeps its identity while nothing is attached. */
const NO_ATTACHMENTS: readonly AttachmentContext[] = Object.freeze([]);
const EMPTY = { text: "", includeWorkingChanges: false, requestId: null, attachments: NO_ATTACHMENTS } satisfies Omit<TarsDraftState, "ready">;

export const useTarsDraftStore = create<TarsDraftState>(() => ({ ...EMPTY, ready: false }));

let bridge: DraftBridge | undefined;
let hydrating: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** The draft in memory differs from the last successful write. */
let dirty = false;
/** Saves run one after another, so an older write can never land after a newer one; resolves whether the latest write landed. */
let queue: Promise<boolean> = Promise.resolve(true);

/** The saved copy: the files are left out, and a request ID that also carried files says so. */
function snapshot(): TarsComposerDraft {
  const { text, includeWorkingChanges, requestId, attachments } = useTarsDraftStore.getState();
  return { text, includeWorkingChanges, requestId, ...(requestId !== null && attachments.length ? { requestHadAttachments: true as const } : {}) };
}

function write(draft: TarsComposerDraft): Promise<boolean> {
  const save = bridge?.saveDraft;
  if (!save) return queue;
  // Over the stored limit the draft stays in memory; the last saved copy is left as it was.
  if (draft.text.length > TARS_DRAFT_MAX_CHARS) return queue;
  const value = isEmptyTarsComposerDraft(draft) ? null : draft;
  queue = queue.then(() => save({ draft: value })).then(() => true, () => {
    // A failed save keeps the draft in memory, unsaved, so the next flush (a change, leaving, quitting) tries again; the words are never logged.
    dirty = true;
    console.warn("[tars] the composer draft could not be saved");
    return false;
  });
  return queue;
}

/**
 * Writes the current draft now if it is not saved yet, and resolves whether
 * the latest write landed. Quitting awaits it before the store closes.
 */
export function flushTarsDraft(): Promise<boolean> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!dirty) return queue;
  dirty = false;
  return write(snapshot());
}

/**
 * The quit flush's part: writes the draft and rejects when it could not be
 * saved, so the quit reports a failed save like any other store's and main
 * offers to keep Stave open, retry saving, or quit without saving. Without a
 * draft store there is nothing to save and it resolves.
 */
export async function flushTarsDraftForQuit(): Promise<void> {
  // Never the words: only that the latest draft was not written.
  if (!(await flushTarsDraft().catch(() => false))) throw new Error("The Tars draft could not be saved."); // i18n-ignore: diagnostic for the quit flush log
}

function schedule() {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flushTarsDraft(); }, TARS_DRAFT_SAVE_DELAY_MS);
}

function update(patch: Partial<Omit<TarsDraftState, "ready">>) {
  useTarsDraftStore.setState(patch);
  schedule();
}

const flushOnHide = () => { if (document.visibilityState === "hidden") void flushTarsDraft(); };
const flushOnLeave = () => { void flushTarsDraft(); };

/**
 * Reads the saved draft once per bridge. Words typed before it arrives win over
 * the saved copy, so a slow read can never erase them. A saved request ID that
 * also carried files is dropped: those files were not saved, so sending the
 * restored words is a new message, never a retry of the one with files.
 */
export function hydrateTarsDraft(next: DraftBridge | undefined): Promise<void> {
  if (bridge === next && hydrating) return hydrating;
  bridge = next;
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.removeEventListener("pagehide", flushOnLeave);
    document.removeEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnLeave);
    document.addEventListener("visibilitychange", flushOnHide);
  }
  const read = next?.getDraft;
  if (!read) {
    useTarsDraftStore.setState({ ready: true });
    hydrating = Promise.resolve();
    return hydrating;
  }
  hydrating = read().then((saved) => {
    if (bridge !== next) return;
    const current = useTarsDraftStore.getState();
    if (saved && isEmptyTarsComposerDraft(current) && !current.attachments.length && current.requestId === null) {
      const { requestHadAttachments, ...restored } = saved;
      useTarsDraftStore.setState({ ...restored, requestId: requestHadAttachments ? null : restored.requestId, ready: true });
    } else useTarsDraftStore.setState({ ready: true });
  }).catch(() => {
    // Unreadable storage: the composer still works, with a draft that lasts for this window.
    if (bridge === next) useTarsDraftStore.setState({ ready: true });
  });
  return hydrating;
}

/** An edit is a new message: it drops the request ID a failed send left, so the next send cannot be mistaken for a retry. */
export function setTarsDraftText(text: string) {
  const current = useTarsDraftStore.getState();
  if (current.text === text) return;
  update({ text, requestId: null });
}

export function setTarsDraftWorkingChanges(includeWorkingChanges: boolean) {
  const current = useTarsDraftStore.getState();
  if (current.includeWorkingChanges === includeWorkingChanges) return;
  update({ includeWorkingChanges, requestId: null });
}

/**
 * Replaces the attached files. Like an edit to the words, it drops the request
 * ID a send that did not come back left: the host names each request ID's
 * exact message, so files added or removed make a new message, not a retry.
 */
export function setTarsDraftAttachments(attachments: readonly AttachmentContext[]) {
  const current = useTarsDraftStore.getState();
  if (current.attachments === attachments || (!current.attachments.length && !attachments.length)) return;
  update({ attachments: attachments.length ? attachments : NO_ATTACHMENTS, requestId: null });
}

/** Adds text after what is there, separated by a blank line; nothing is replaced. */
export function appendTarsDraft(addition: string) {
  const { text } = useTarsDraftStore.getState();
  setTarsDraftText(text.trim() ? `${text.trimEnd()}\n\n${addition}` : addition);
}

/**
 * Starts a send of the current draft: reuses the request ID an unchanged
 * retry carries, otherwise mints one, and saves it with the draft before the
 * message goes out, so the host can drop this draft in the same write that
 * saves the message. The send must carry the returned choice and files: they
 * are what this request ID names.
 *
 * Null when a draft store exists but that save failed: the send stops there,
 * with the words kept, and the composer shows it as a failed send. Sending
 * anyway could leave a message the saved draft does not know about, so the
 * draft would come back after a restart and be sent a second time.
 */
export async function beginTarsDraftSend(): Promise<{ requestId: string; text: string; includeWorkingChanges: boolean; attachments: readonly AttachmentContext[] } | null> {
  const { requestId: retried, text, includeWorkingChanges, attachments } = useTarsDraftStore.getState();
  const requestId = retried ?? crypto.randomUUID();
  useTarsDraftStore.setState({ requestId });
  dirty = true;
  // No message carries this request ID yet, so keeping it for the next try is still the same, unsent request.
  if (!(await flushTarsDraft()) && bridge?.saveDraft) return null;
  // The words as they stand in the draft, not as sent (the composer trims what it sends), so settling compares like with like.
  return { requestId, text, includeWorkingChanges, attachments };
}

/**
 * Settles a send with what `beginTarsDraftSend` returned. `sent`: the message
 * exists, so the draft that sent it is cleared. `failed`: the message exists
 * but failed, so the words stay for a new message. `unsent`: nothing is known
 * to exist; the draft and its request ID stay, so an unchanged retry cannot
 * send twice. Only the draft this send carried is touched: one edited since
 * (an edit drops the request ID) or sent again under another ID is newer, and
 * a late settle from an earlier send must not clear or detach it.
 */
export function settleTarsDraftSend(args: { requestId: string; text: string; outcome: "sent" | "failed" | "unsent" }) {
  if (args.outcome === "unsent") return;
  const current = useTarsDraftStore.getState();
  if (current.requestId !== args.requestId) return;
  if (args.outcome === "sent" && current.text === args.text) update({ ...EMPTY });
  else update({ requestId: null });
  void flushTarsDraft();
}

/** Test seam: forget the bridge and the in-memory draft. */
export function resetTarsDraftForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
  bridge = undefined;
  hydrating = null;
  queue = Promise.resolve(true);
  useTarsDraftStore.setState({ ...EMPTY, ready: false });
}
