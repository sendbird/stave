import type { ReactNode } from "react";
import { AgentEntranceScope } from "@/components/aui/components/agent-motion";

/**
 * Turns off the AUI agent ENTRANCE motion (the rise-in and the stagger
 * cascade) for the chat transcript and the surfaces that replay it.
 *
 * The transcript is virtualized (`ConversationVirtualList`): a row unmounts
 * when it scrolls out and mounts again when it scrolls back, and opening a long
 * history mounts many rows at once. AUI entrances play on mount, so inside the
 * transcript every scroll or history load would replay them. The run-turn
 * dialog opens a recorded turn all at once, and the composer shelf plan and
 * the task panel plan remount on task and tab switches, so they opt out too.
 *
 * Mechanism: this is AUI `AgentEntranceScope`. Leaves (a ToolRun row or well,
 * a Checkpoint, a scoped Approval card, a Plan's applied note) already skip
 * their own entrance inside it (`useSelfEntrance`). Stave's copies of the
 * containers check it as well: `ToolRun.Group` items and Plan steps and notes
 * skip the arrival-rank cascade, which `useArrivalRank` would otherwise play
 * for every item on first mount.
 *
 * State-change motion still plays: the status glyph swap, the status word's
 * fade, the pulse, and a Plan's current-step highlight and approval word when the
 * status really changes. `useChangeCount` is 0 on mount, so a remounted row
 * does not replay any of these.
 */
export function TranscriptEntranceScope({ children }: { children: ReactNode }) {
  return <AgentEntranceScope>{children}</AgentEntranceScope>;
}
