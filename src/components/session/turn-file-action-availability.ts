import type { TurnSnapshotSkipReason } from "@/lib/turn-snapshots";
import type { ChatMessage } from "@/types/chat";

export interface TurnSnapshotCatalogView {
  snapshotTurnIds: ReadonlySet<string>;
  skipped: ReadonlyMap<string, TurnSnapshotSkipReason>;
}

export type TurnFileAction =
  | { kind: "restore" }
  | { kind: "noSnapshot"; reason: TurnSnapshotSkipReason }
  | { kind: "none" };

/** A turn offers a file restore only when the host retained its snapshot. */
export function resolveTurnFileAction(args: { turnId: string | undefined; catalog: TurnSnapshotCatalogView }): TurnFileAction {
  if (!args.turnId) return { kind: "none" };
  if (args.catalog.snapshotTurnIds.has(args.turnId)) return { kind: "restore" };
  const reason = args.catalog.skipped.get(args.turnId);
  return reason ? { kind: "noSnapshot", reason } : { kind: "none" };
}

/**
 * Claude history recorded before turn snapshots keeps the provider's own file
 * rewind. A turn with a retained snapshot uses the snapshot restore instead.
 */
export function canOfferClaudeFileRewind(args: {
  message: ChatMessage;
  activeTurnId: string | undefined;
  rewindSupported: boolean;
  hasSnapshot: boolean;
}): boolean {
  const boundary = args.message.providerBoundary;
  return Boolean(
    !args.activeTurnId
    && !args.message.isStreaming
    && args.message.role === "user"
    && boundary?.providerId === "claude-code"
    && boundary.kind === "message"
    && args.rewindSupported
    && !args.hasSnapshot,
  );
}
