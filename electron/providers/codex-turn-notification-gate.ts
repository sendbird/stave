type TurnNotification = { method?: string; params?: unknown };
const MAX_PENDING_EVENTS = 1_024;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;
const MAX_PENDING_AGE_MS = 45_000;

function notificationTurnId(message: TurnNotification): string | null {
  const params = message.params;
  if (!params || typeof params !== "object") {
    return null;
  }
  if ("turnId" in params && typeof params.turnId === "string") {
    return params.turnId;
  }
  if (
    (message.method === "turn/started" || message.method === "turn/completed") &&
    "turn" in params && params.turn && typeof params.turn === "object" &&
    "id" in params.turn && typeof params.turn.id === "string"
  ) {
    return params.turn.id;
  }
  return null;
}

/** Hold turn-scoped notifications until turn/start identifies their owner. */
export function createCodexTurnNotificationGate<T extends TurnNotification>() {
  let pending: Array<{ turnId: string | null; foreign: boolean; message: T }> = [];
  let pendingBytes = 0;
  let expiry: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    pending = [];
    pendingBytes = 0;
    if (expiry) clearTimeout(expiry);
    expiry = null;
  };

  const hold = (message: T, turnId: string | null, foreign: boolean) => {
    const messageBytes = Buffer.byteLength(JSON.stringify(message), "utf8");
    if (messageBytes > MAX_PENDING_BYTES) return;
    if (!expiry) {
      expiry = setTimeout(clear, MAX_PENDING_AGE_MS);
      expiry.unref?.();
    }
    while (
      pending.length >= MAX_PENDING_EVENTS ||
      pendingBytes + messageBytes > MAX_PENDING_BYTES
    ) {
      const oldest = pending.shift();
      if (!oldest) break;
      pendingBytes -= Buffer.byteLength(JSON.stringify(oldest.message), "utf8");
    }
    pending.push({ turnId, foreign, message });
    pendingBytes += messageBytes;
  };

  return {
    shouldDeliver(message: T, activeTurnId: string): boolean {
      const turnId = notificationTurnId(message);
      if (!turnId) return true;
      if (!activeTurnId) {
        hold(message, turnId, false);
        return false;
      }
      return turnId === activeTurnId;
    },
    holdForeign(message: T) {
      hold(message, notificationTurnId(message), true);
    },
    takePending(activeTurnId: string): T[] {
      const matching = pending
        .filter((entry) => entry.foreign || entry.turnId === activeTurnId)
        .map((entry) => entry.message);
      clear();
      return matching;
    },
    clear,
  };
}
