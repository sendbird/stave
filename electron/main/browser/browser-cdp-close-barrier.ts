export interface CdpCommandBarrierSnapshot {
  closing: boolean;
  inFlightCommands: number;
}

export interface CdpCommandBarrier {
  acquire(): () => void;
  beginClose(timeoutMs: number): Promise<"drained" | "timed-out">;
  finishClose(): void;
  snapshot(): CdpCommandBarrierSnapshot;
}

/**
 * Tracks native debugger promises separately from their JS caller timeout.
 * A caller may stop waiting for a screenshot while Electron still has the CDP
 * command in flight; closing the target must account for that remaining lease.
 */
export function createCdpCommandBarrier(): CdpCommandBarrier {
  let closing = false;
  let inFlightCommands = 0;
  const drainedWaiters = new Set<() => void>();

  const resolveDrainedWaiters = () => {
    for (const resolve of drainedWaiters) {
      resolve();
    }
    drainedWaiters.clear();
  };

  return {
    acquire() {
      if (closing) {
        throw new Error("WebContents debugger is closing");
      }
      inFlightCommands += 1;
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        inFlightCommands = Math.max(0, inFlightCommands - 1);
        if (inFlightCommands === 0) {
          resolveDrainedWaiters();
        }
      };
    },
    beginClose(timeoutMs) {
      closing = true;
      if (inFlightCommands === 0) {
        return Promise.resolve("drained");
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (result: "drained" | "timed-out") => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          drainedWaiters.delete(onDrained);
          resolve(result);
        };
        const onDrained = () => finish("drained");
        const timer = setTimeout(() => finish("timed-out"), timeoutMs);
        timer.unref?.();
        drainedWaiters.add(onDrained);
      });
    },
    finishClose() {
      closing = true;
      resolveDrainedWaiters();
    },
    snapshot() {
      return { closing, inFlightCommands };
    },
  };
}
