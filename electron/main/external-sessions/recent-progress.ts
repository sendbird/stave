import { EXTERNAL_PROGRESS_LIMIT, type ExternalAction, type ExternalProgressEntry } from "../../../src/lib/external-sessions/external-sessions";
import { cleanTarget } from "./external-actions";

/** Only enabled on a live tail. Keep summaries, never raw tool input or output. */
export class RecentProgress {
  private sequence = 0;
  private rows: { entry: ExternalProgressEntry; callId?: string }[] = [];
  enabled = false;

  private append(entry: ExternalProgressEntry, callId?: unknown) {
    this.rows.push({ entry, callId: typeof callId === "string" && callId.length <= 200 ? callId : undefined });
    if (this.rows.length > EXTERNAL_PROGRESS_LIMIT) this.rows.shift();
  }

  message(kind: "user" | "text", value: string) {
    if (!this.enabled) return;
    const text = cleanTarget(value);
    if (text) this.append({ id: ++this.sequence, kind, text });
  }

  tool(action: ExternalAction, callId?: unknown) {
    if (this.enabled) this.append({ id: ++this.sequence, kind: "tool", action, status: "called" }, callId);
  }

  finish(callId: unknown, failed: boolean) {
    if (!this.enabled || typeof callId !== "string") return;
    const row = this.rows.findLast((item) => item.callId === callId);
    if (row?.entry.kind === "tool") row.entry = { ...row.entry, status: failed ? "error" : "done" };
  }

  snapshot() {
    return this.rows.map(({ entry }) => entry);
  }
}
