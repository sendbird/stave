/**
 * Structural sharing for Fleet's published attention snapshot and its task
 * table rows.
 *
 * The producer recomputes the projection whenever streamed task state changes,
 * which is every chunk of a running turn, and each pass builds new objects
 * even when nothing a reader shows has changed. Publishing those as-is would
 * re-render the top bar, the bell, the sidebar and Fleet on every chunk. Here
 * a new pass keeps the previous references for everything equal to them, so a
 * reader re-renders only when its own slice changed.
 */
import type { FleetAttentionItem } from "./attention-projection";
import type { FleetInbox, FleetInboxEntry } from "./inbox-model";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Equal plain data, compared field by field up to `depth` levels; anything
 * else (functions, maps, class instances, deeper levels) by identity.
 */
export function sameData(left: unknown, right: unknown, depth = 3): boolean {
  if (Object.is(left, right)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sameData(value, right[index], depth - 1))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          sameData(left[key], right[key], depth - 1),
      )
    );
  }
  return false;
}

/** `next` with each element replaced by its previous equal; `previous` when nothing changed. */
export function shareList<T>(
  previous: readonly T[] | undefined,
  next: readonly T[],
  share: (value: T) => T,
): T[] {
  const shared = next.map(share);
  return previous &&
    previous.length === shared.length &&
    shared.every((value, index) => value === previous[index])
    ? (previous as T[])
    : shared;
}

/** `next` with each value shared; `previous` when no key or value changed. */
export function shareRecord<T>(
  previous: Readonly<Record<string, T>>,
  next: Readonly<Record<string, T>>,
  share: (value: T, key: string) => T,
): Record<string, T> {
  const keys = Object.keys(next);
  const shared: Record<string, T> = {};
  let changed = keys.length !== Object.keys(previous).length;
  for (const key of keys) {
    const value = share(next[key] as T, key);
    shared[key] = value;
    if (!changed && (!(key in previous) || previous[key] !== value)) changed = true;
  }
  return changed ? shared : (previous as Record<string, T>);
}

interface SharedAttentionSlices {
  items: FleetAttentionItem[];
  blockingItems: FleetAttentionItem[];
  reviewItems: FleetAttentionItem[];
  snoozedItems: FleetAttentionItem[];
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
  attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined>;
  inbox: FleetInbox;
}

/**
 * `next` with every slice equal to `previous`'s replaced by `previous`'s
 * reference, down to single items and inbox entries. Returns `previous`
 * itself when the whole snapshot is equal.
 */
export function shareFleetAttentionSnapshot<T extends SharedAttentionSlices>(
  previous: T,
  next: T,
): T {
  if (previous === next) return previous;
  const previousItems = new Map<string, FleetAttentionItem>();
  for (const item of [...previous.items, ...previous.snoozedItems]) {
    previousItems.set(item.id, item);
  }
  const shareItem = (item: FleetAttentionItem) => {
    const before = previousItems.get(item.id);
    return before && sameData(before, item) ? before : item;
  };
  const shareItems = (before: readonly FleetAttentionItem[] | undefined, after: readonly FleetAttentionItem[]) =>
    shareList(before, after, shareItem);

  const previousEntries = new Map<string, FleetInboxEntry>();
  for (const entry of [
    ...previous.inbox.itemEntries,
    ...previous.inbox.unlinkedEntries,
    ...previous.inbox.historyEntries,
  ]) {
    previousEntries.set(entry.id, entry);
  }
  const shareEntry = (entry: FleetInboxEntry) => {
    const item = entry.item ? shareItem(entry.item) : null;
    const candidate = item === entry.item ? entry : { ...entry, item };
    const before = previousEntries.get(entry.id);
    // Notifications are store objects: compared by identity, fields once.
    return before && sameData(before, candidate, 2) ? before : candidate;
  };
  const itemEntries = shareList(previous.inbox.itemEntries, next.inbox.itemEntries, shareEntry);
  const unlinkedEntries = shareList(previous.inbox.unlinkedEntries, next.inbox.unlinkedEntries, shareEntry);
  const historyEntries = shareList(previous.inbox.historyEntries, next.inbox.historyEntries, shareEntry);
  // Derived from the item entries, as the inbox builds it.
  const entryByItemId =
    itemEntries === previous.inbox.itemEntries
      ? previous.inbox.entryByItemId
      : new Map(itemEntries.map((entry) => [entry.id, entry] as const));
  const inbox =
    itemEntries === previous.inbox.itemEntries &&
    unlinkedEntries === previous.inbox.unlinkedEntries &&
    historyEntries === previous.inbox.historyEntries &&
    entryByItemId === previous.inbox.entryByItemId
      ? previous.inbox
      : { itemEntries, unlinkedEntries, historyEntries, entryByItemId };

  const shared: T = {
    ...next,
    items: shareItems(previous.items, next.items),
    blockingItems: shareItems(previous.blockingItems, next.blockingItems),
    reviewItems: shareItems(previous.reviewItems, next.reviewItems),
    snoozedItems: shareItems(previous.snoozedItems, next.snoozedItems),
    highestAttentionByWorkspaceId: shareRecord(
      previous.highestAttentionByWorkspaceId,
      next.highestAttentionByWorkspaceId,
      (item) => (item ? shareItem(item) : item),
    ),
    attentionItemsByWorkspaceId: shareRecord(
      previous.attentionItemsByWorkspaceId,
      next.attentionItemsByWorkspaceId,
      (items, key) => (items ? shareItems(previous.attentionItemsByWorkspaceId[key], items) : items),
    ),
    inbox,
  };
  const keys = Object.keys(shared) as Array<keyof T>;
  if (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => Object.is(shared[key], previous[key]))
  ) {
    return previous;
  }
  // Nothing was swapped for an earlier reference: the pass stands as built.
  return keys.every((key) => Object.is(shared[key], next[key])) ? next : shared;
}
