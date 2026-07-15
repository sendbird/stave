export interface TerminalWriteTarget {
  write(data: string, callback?: () => void): void;
}

export interface TerminalOutputSchedulerOptions {
  /** Keep a single xterm parse turn small enough for cooperative yielding. */
  maxChunkChars?: number;
  schedule?: (callback: () => void) => void;
  onWriteError?: (error: unknown) => void;
  onWriteParsed?: () => void;
}

interface PendingWrite {
  data: string;
  onParsed?: () => void;
  beforeWrite?: () => void;
}

function scheduleWithMessageChannel(callback: () => void) {
  if (typeof MessageChannel === "undefined") {
    setTimeout(callback, 0);
    return;
  }

  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    channel.port2.close();
    callback();
  };
  channel.port2.postMessage(undefined);
}

/**
 * Serializes xterm writes and waits for xterm's parse callback before
 * releasing the next chunk. This keeps PTY backpressure tied to parsing,
 * rather than merely to delivery into the renderer event loop.
 */
export class TerminalOutputScheduler {
  private readonly maxChunkChars: number;
  private readonly schedule: (callback: () => void) => void;
  private readonly onWriteError: (error: unknown) => void;
  private readonly onWriteParsed: () => void;
  private readonly pending: PendingWrite[] = [];
  private scheduled = false;
  private writing = false;
  private disposed = false;
  private settleActiveWrite: (() => void) | null = null;

  constructor(
    private readonly target: TerminalWriteTarget,
    options: TerminalOutputSchedulerOptions = {},
  ) {
    this.maxChunkChars = Math.max(1, options.maxChunkChars ?? 128 * 1024);
    this.schedule = options.schedule ?? scheduleWithMessageChannel;
    this.onWriteError = options.onWriteError ?? (() => {});
    this.onWriteParsed = options.onWriteParsed ?? (() => {});
  }

  enqueue(data: string, onParsed?: () => void) {
    if (this.disposed) {
      onParsed?.();
      return;
    }
    if (!data) {
      onParsed?.();
      return;
    }

    this.pending.push({ data, onParsed });
    this.scheduleDrain();
  }

  replace(data: string, beforeWrite: () => void, onParsed?: () => void) {
    if (this.disposed) {
      onParsed?.();
      return;
    }

    const retained = this.writing ? this.pending.slice(0, 1) : [];
    const discarded = this.writing ? this.pending.slice(1) : this.pending;
    this.pending.length = 0;
    this.pending.push(...retained);
    for (const pendingWrite of discarded) {
      pendingWrite.onParsed?.();
    }
    this.pending.push({ data, beforeWrite, onParsed });
    this.scheduleDrain();
  }

  dispose() {
    this.disposed = true;
    this.settleActiveWrite?.();
    this.settleActiveWrite = null;
    for (const pendingWrite of this.pending.splice(0)) {
      pendingWrite.onParsed?.();
    }
  }

  private scheduleDrain() {
    if (this.disposed || this.scheduled || this.writing) {
      return;
    }

    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      this.drainOne();
    });
  }

  private drainOne() {
    if (this.disposed || this.writing) {
      return;
    }

    const pendingWrite = this.pending[0];
    if (!pendingWrite) {
      return;
    }

    const chunk = pendingWrite.data.slice(0, this.maxChunkChars);
    pendingWrite.data = pendingWrite.data.slice(chunk.length);
    this.writing = true;

    let settled = false;
    const settle = (parsedByTarget: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      this.settleActiveWrite = null;
      this.writing = false;
      if (parsedByTarget) {
        this.onWriteParsed();
      }

      if (pendingWrite.data.length === 0) {
        this.pending.shift();
        pendingWrite.onParsed?.();
      }

      this.scheduleDrain();
    };
    this.settleActiveWrite = () => settle(false);

    try {
      pendingWrite.beforeWrite?.();
      pendingWrite.beforeWrite = undefined;
      if (!chunk) {
        settle(true);
        return;
      }
      this.target.write(chunk, () => settle(true));
    } catch (error) {
      // A disposed or failed xterm instance must not permanently hold the
      // renderer flow-control window open.
      this.onWriteError(error);
      settle(false);
    }
  }
}
