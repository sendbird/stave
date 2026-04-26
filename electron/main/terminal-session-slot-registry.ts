export interface TerminalSessionSlotRegistry {
  sessionIdBySlotKey: Map<string, string>;
  slotKeyBySessionId: Map<string, string>;
}

export function createTerminalSessionSlotRegistry(): TerminalSessionSlotRegistry {
  return {
    sessionIdBySlotKey: new Map<string, string>(),
    slotKeyBySessionId: new Map<string, string>(),
  };
}

export function bindTerminalSessionSlot(args: {
  registry: TerminalSessionSlotRegistry;
  sessionId: string;
  slotKey: string;
}) {
  const previousSessionId = args.registry.sessionIdBySlotKey.get(args.slotKey);
  if (previousSessionId && previousSessionId !== args.sessionId) {
    args.registry.slotKeyBySessionId.delete(previousSessionId);
  }

  const previousSlotKey = args.registry.slotKeyBySessionId.get(args.sessionId);
  if (previousSlotKey && previousSlotKey !== args.slotKey) {
    args.registry.sessionIdBySlotKey.delete(previousSlotKey);
  }

  args.registry.sessionIdBySlotKey.set(args.slotKey, args.sessionId);
  args.registry.slotKeyBySessionId.set(args.sessionId, args.slotKey);
}

export function getTerminalSessionIdForSlotKey(args: {
  registry: TerminalSessionSlotRegistry;
  slotKey: string;
}) {
  return args.registry.sessionIdBySlotKey.get(args.slotKey) ?? null;
}

export function unbindTerminalSessionSlotBySessionId(args: {
  registry: TerminalSessionSlotRegistry;
  sessionId: string;
}) {
  const slotKey = args.registry.slotKeyBySessionId.get(args.sessionId);
  if (!slotKey) {
    return;
  }

  args.registry.slotKeyBySessionId.delete(args.sessionId);
  if (args.registry.sessionIdBySlotKey.get(slotKey) === args.sessionId) {
    args.registry.sessionIdBySlotKey.delete(slotKey);
  }
}

export function unbindTerminalSessionSlotBySlotKey(args: {
  registry: TerminalSessionSlotRegistry;
  slotKey: string;
}) {
  const sessionId = args.registry.sessionIdBySlotKey.get(args.slotKey);
  if (!sessionId) {
    return;
  }

  args.registry.sessionIdBySlotKey.delete(args.slotKey);
  if (args.registry.slotKeyBySessionId.get(sessionId) === args.slotKey) {
    args.registry.slotKeyBySessionId.delete(sessionId);
  }
}

export function clearTerminalSessionSlotRegistry(args: {
  registry: TerminalSessionSlotRegistry;
}) {
  args.registry.sessionIdBySlotKey.clear();
  args.registry.slotKeyBySessionId.clear();
}
