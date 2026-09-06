import type { PersistenceFlushOutcome } from "./persistence-flush-gate";

/**
 * Decide whether quitting may continue after the renderer persistence flush.
 *
 * Only a confirmed `failed` save blocks quitting and asks the user. A `timeout`
 * means the renderer never answered (wedged, crashed, or already gone); that
 * was never a signal that data is at risk, so it keeps the historical
 * "quit anyway" behavior instead of trapping the user behind a dialog.
 */
export async function confirmPersistenceBeforeQuit(args: {
  flush: () => Promise<PersistenceFlushOutcome>;
  choose: () => Promise<"stay" | "retry" | "quit">;
}): Promise<boolean> {
  for (;;) {
    const outcome = await args.flush();
    if (outcome !== "failed") return true;
    const choice = await args.choose();
    if (choice !== "retry") return choice === "quit";
  }
}
