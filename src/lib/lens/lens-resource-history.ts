export interface LensResourceEvent {
  workspaceId: string;
  lensSessionId: string;
  kind: "released" | "reopened";
  at: number;
}

/** App-run history contains identities only; never page contents or URLs. */
export class LensResourceHistory {
  private events: LensResourceEvent[] = [];

  released(workspaceId: string, lensSessionId: string, at = Date.now()) {
    this.append({ workspaceId, lensSessionId, kind: "released", at });
  }

  opened(workspaceId: string, lensSessionId: string, at = Date.now()) {
    const last = [...this.events].reverse().find((event) => event.workspaceId === workspaceId && event.lensSessionId === lensSessionId);
    if (last?.kind === "released") this.append({ workspaceId, lensSessionId, kind: "reopened", at });
  }

  snapshot(): LensResourceEvent[] { return this.events.map((event) => ({ ...event })); }

  private append(event: LensResourceEvent) {
    this.events.push(event);
    if (this.events.length > 120) this.events.shift();
  }
}
