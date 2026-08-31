import type { createTurnDiffTracker } from "./turn-diff-tracker";
import type { BridgeEvent } from "./types";

type TurnDiffTracker = Awaited<ReturnType<typeof createTurnDiffTracker>>;

export interface CodexFileChangeItem {
  changes?: Array<{ path?: string }>;
  status?: string;
}

/** Every path this file-change item touched, de-duplicated, in report order. */
export function collectCodexFileChangePaths(item: CodexFileChangeItem) {
  return [
    ...new Set(
      (item.changes ?? [])
        .map((change) => (typeof change.path === "string" ? change.path.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

/**
 * The activity row for a Codex file edit.
 *
 * Codex reports edits as `fileChange` items and, unlike every other item type,
 * used to emit no `tool` event for them — only diffs. So the same edit turn
 * showed `Edit file` rows on Claude and nothing at all on Codex, and the turn
 * activity shelf understated what Codex had done. This restores the row.
 *
 * `toolName` stays the provider's own `fileChange` token: the shelf normalizes
 * it to the same `Edit file` label Claude's `Edit` resolves to, and keeps the
 * raw token for the row's provider-specific slot. `paths` is a plain array
 * rather than Claude's single `file_path` because one Codex patch routinely
 * spans several files, and collapsing that to the first path would misreport it.
 */
export function buildCodexFileChangeToolEvent(args: {
  itemId: string;
  item: CodexFileChangeItem;
}): Extract<BridgeEvent, { type: "tool" }> | null {
  const paths = collectCodexFileChangePaths(args.item);
  if (paths.length === 0) {
    return null;
  }
  return {
    type: "tool",
    ...(args.itemId ? { toolUseId: args.itemId } : {}),
    toolName: "fileChange",
    input: JSON.stringify({ paths }),
    state: "input-available",
  };
}

/**
 * Turn a completed `fileChange` item into its activity row, its result, and the
 * diffs the transcript renders.
 *
 * This lives outside the runtime's notification switch because that file is at
 * its line ceiling, and because the diff work is asynchronous: keeping the
 * fire-and-forget promise and its fallback path in one named function makes the
 * ordering guarantee (row and result first, diffs when they resolve) reviewable.
 */
export function emitCodexFileChangeEvents(args: {
  itemId: string;
  item: CodexFileChangeItem;
  /** The `item/started` opener already announced this row. */
  alreadyStarted: boolean;
  diffTracker: TurnDiffTracker;
  emit: (events: BridgeEvent[]) => void;
}) {
  const { item, itemId } = args;
  const paths = collectCodexFileChangePaths(item);
  const failed = item.status === "failed";
  const toolEvent = args.alreadyStarted
    ? null
    : buildCodexFileChangeToolEvent({ itemId, item });

  args.emit([
    ...(toolEvent ? [toolEvent] : []),
    // The row is only closed when it was opened. A patch that reported no paths
    // never produced one, so a bare result would have nothing to settle.
    ...(toolEvent || args.alreadyStarted
      ? [
          {
            type: "tool_result" as const,
            tool_use_id: itemId,
            output: failed ? "[error] File change failed" : paths.join("\n"),
            ...(failed ? { isError: true } : {}),
          },
        ]
      : []),
    // The turn-level error stays: a failed patch is a turn problem, and the row
    // only says which files it was about.
    ...(failed
      ? [
          {
            type: "error" as const,
            message: `File change failed: ${paths.join(", ")}`,
            recoverable: false,
          },
        ]
      : []),
  ]);

  if (failed) {
    return;
  }

  void args.diffTracker
    .buildDiffEvents({ changedPaths: paths })
    .then(({ diffEvents, unresolvedPaths }) => {
      const fallbackEvents = args.diffTracker.buildFallbackEvents({
        appliedPaths: diffEvents.length === 0 ? paths : [],
        skippedPaths: unresolvedPaths,
      });
      args.emit([...diffEvents, ...fallbackEvents]);
    })
    .catch(() => {
      args.emit(args.diffTracker.buildFallbackEvents({ appliedPaths: paths }));
    });
}
