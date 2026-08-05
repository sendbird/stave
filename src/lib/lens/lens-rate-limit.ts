export interface LensRateLimitDecision {
  accepted: boolean;
  /** Drops from the completed window, reported once on its successor. */
  droppedCount: number;
}

/** Fixed-window backpressure shared by untrusted Lens event streams. */
export class LensFixedWindowRateLimiter {
  private windowStartedAt: number | undefined;
  private acceptedCount = 0;
  private droppedCount = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly label: string,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError(`${label} rate limit must be a positive integer`);
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError(`${label} rate window must be positive`);
    }
  }

  accept(now = Date.now()): LensRateLimitDecision {
    const startsNewWindow =
      this.windowStartedAt === undefined ||
      now < this.windowStartedAt ||
      now - this.windowStartedAt >= this.windowMs;

    let completedWindowDrops = 0;
    if (startsNewWindow) {
      completedWindowDrops = this.droppedCount;
      this.windowStartedAt = now;
      this.acceptedCount = 0;
      this.droppedCount = 0;
    }

    if (this.acceptedCount < this.limit) {
      this.acceptedCount += 1;
      return {
        accepted: true,
        droppedCount: completedWindowDrops,
      };
    }

    this.droppedCount += 1;
    return { accepted: false, droppedCount: 0 };
  }
}
