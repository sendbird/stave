import { create } from "zustand";
import {
  TARS_DRAFT_MAX_CHARS, isEmptyTarsComposerDraft, type TarsComposerDraft,
} from "@/lib/tars/composer-draft";
import type { TarsBridgeApi } from "@/lib/tars/types";

/**
 * The Tars composer draft, outside any component so it outlives the view: a
 * send that settles after the user left Tars still clears (or keeps) the right
 * draft, and coming back shows it at once. The bridge saves it so it survives
 * a restart; without one it lives for this window only.
 */
export interface TarsDraftState extends TarsComposerDraft {
  /** The saved draft was read (or there is nothing to read); the composer waits for it so typing is never overwritten. */
  ready: boolean;
}

type DraftBridge = Pick<TarsBridgeApi, "getDraft" | "saveDraft">;

/** Typing is saved after this pause; leaving the view or the window saves at once. */
export const TARS_DRAFT_SAVE_DELAY_MS = 300;

const EMPTY: TarsComposerDraft = { text: "", includeWorkingChanges: false, requestId: null };

export const useTarsDraftStore = create<TarsDraftState>(() => ({ ...EMPTY, ready: false }));

let bridge: DraftBridge | undefined;
let hydrating: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** The draft in memory differs from the last successful write. */
let dirty = false;
/** Saves run one after another, so an older write can never land after a newer one; resolves whether the latest write landed. */
let queue: Promise<boolean> = Promise.resolve(true);

function snapshot(): TarsComposerDraft {
  const { text, includeWorkingChanges, requestId } = useTarsDraftStore.getState();
  return { text, includeWorkingChanges, requestId };
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

function schedule() {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flushTarsDraft(); }, TARS_DRAFT_SAVE_DELAY_MS);
}

function update(patch: Partial<TarsComposerDraft>) {
  useTarsDraftStore.setState(patch);
  schedule();
}

const flushOnHide = () => { if (document.visibilityState === "hidden") void flushTarsDraft(); };
const flushOnLeave = () => { void flushTarsDraft(); };

/**
 * Reads the saved draft once per bridge. Words typed before it arrives win over
 * the saved copy, so a slow read can never erase them.
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
    if (saved && isEmptyTarsComposerDraft(current) && current.requestId === null) useTarsDraftStore.setState({ ...saved, ready: true });
    else useTarsDraftStore.setState({ ready: true });
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

/** Adds text after what is there, separated by a blank line; nothing is replaced. */
export function appendTarsDraft(addition: string) {
  const { text } = useTarsDraftStore.getState();
  setTarsDraftText(text.trim() ? `${text.trimEnd()}\n\n${addition}` : addition);
}

/**
 * Starts a send of the current draft: reuses the request ID an unchanged
 * retry carries, otherwise mints one, and saves it with the draft before the
 * message goes out, so the host can drop this draft in the same write that
 * saves the message.
 */
export async function beginTarsDraftSend(): Promise<{ requestId: string; text: string }> {
  const { requestId: retried, text } = useTarsDraftStore.getState();
  const requestId = retried ?? crypto.randomUUID();
  useTarsDraftStore.setState({ requestId });
  dirty = true;
  await flushTarsDraft();
  // The words as they stand in the draft, not as sent (the composer trims what it sends), so settling compares like with like.
  return { requestId, text };
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
