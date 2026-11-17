import {
  RemoteRendererResponseSchema,
  RemoteResultSchema,
  RemoteSnapshotSchema,
  type RemoteAction,
  type RemoteRendererRequest,
  type RemoteResult,
  type RemoteSnapshot,
} from "../../../src/lib/remote-control";

export const REMOTE_CONTROL_REQUEST_CHANNEL = "remote-control:request";

/** Long enough for a question answer to be delivered and recorded; bounded so a wedged window answers `unavailable`. */
export const REMOTE_CONTROL_RENDERER_TIMEOUT_MS = 15_000;

/** The desktop window that answers. Only a window that said it is ready receives requests. */
export interface RemoteRendererTarget {
  id: number;
  send(channel: string, payload: RemoteRendererRequest): void;
}

export class RemoteRendererUnavailableError extends Error {
  constructor() {
    super("No desktop window is ready to answer.");
  }
}

interface Pending {
  targetId: number;
  kind: RemoteRendererRequest["kind"];
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Main -> renderer request/ack for remote control.
 *
 * Main never decides an answer itself: it forwards the action to the open
 * desktop window, which runs the same respond path as a click there and
 * replies once. No queueing: without a ready window the request fails at once.
 * A reply is accepted only from the window that was asked, only once, and only
 * if it matches the strict response schema for what was asked.
 */
export class RemoteRendererBridge {
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly getTarget: () => RemoteRendererTarget | null,
    private readonly timeoutMs = REMOTE_CONTROL_RENDERER_TIMEOUT_MS,
  ) {}

  private request(payload: { kind: "snapshot" } | { kind: "act"; action: RemoteAction }) {
    const target = this.getTarget();
    if (!target) return Promise.reject(new RemoteRendererUnavailableError());
    const requestId = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RemoteRendererUnavailableError());
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { targetId: target.id, kind: payload.kind, resolve, reject, timer });
      try {
        target.send(REMOTE_CONTROL_REQUEST_CHANNEL, { requestId, ...payload } as RemoteRendererRequest);
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new RemoteRendererUnavailableError());
      }
    });
  }

  async snapshot(): Promise<RemoteSnapshot> {
    return RemoteSnapshotSchema.parse(await this.request({ kind: "snapshot" }));
  }

  /** Never rejects: a missing, slow or malformed answer is `unavailable`. */
  async act(action: RemoteAction): Promise<RemoteResult> {
    try {
      return RemoteResultSchema.parse(await this.request({ kind: "act", action }));
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  /** Called from the renderer's reply handler with the sending window's id. */
  resolve(senderId: number, raw: unknown): { ok: boolean } {
    const parsed = RemoteRendererResponseSchema.safeParse(raw);
    if (!parsed.success) return { ok: false };
    const pending = this.pending.get(parsed.data.requestId);
    if (!pending || pending.targetId !== senderId || pending.kind !== parsed.data.kind) return { ok: false };
    this.pending.delete(parsed.data.requestId);
    clearTimeout(pending.timer);
    pending.resolve(parsed.data.kind === "snapshot" ? parsed.data.snapshot : parsed.data.result);
    return { ok: true };
  }

  /** The window went away: fail what it was asked instead of waiting for the timeout. */
  dropTarget(targetId: number) {
    for (const [requestId, pending] of this.pending) {
      if (pending.targetId !== targetId) continue;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      pending.reject(new RemoteRendererUnavailableError());
    }
  }
}
