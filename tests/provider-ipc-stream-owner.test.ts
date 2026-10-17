import { expect, mock, test } from "bun:test";

const handlers = new Map<
  string,
  (event: unknown, args?: unknown) => unknown
>();
const sent: Array<{ contentsId: number; payload: unknown }> = [];
const streamEventListeners: Array<(payload: { streamId: string; done?: boolean }) => void> = [];
const disconnectListeners: Array<() => void> = [];

function fakeContents(id: number) {
  return {
    id,
    isDestroyed: () => false,
    once: () => undefined,
    send: (_channel: string, payload: unknown) => {
      sent.push({ contentsId: id, payload });
    },
  };
}

mock.module("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, args?: unknown) => unknown,
    ) => handlers.set(channel, handler),
  },
  webContents: { fromId: (id: number) => fakeContents(id) },
}));
mock.module("../electron/main/host-service-client", () => ({
  invokeHostService: async (method: string) => {
    if (method !== "provider.start-push-turn") {
      throw new Error(`Unexpected host request ${method}`);
    }
    return { ok: true, streamId: "stream-1", turnId: "turn-1" };
  },
  onHostServiceEvent: (
    event: string,
    listener: (payload: { streamId: string; done?: boolean }) => void,
  ) => {
    if (event === "provider.stream-event") streamEventListeners.push(listener);
    return () => undefined;
  },
  onHostServiceDisconnect: (listener: () => void) => {
    disconnectListeners.push(listener);
    return () => undefined;
  },
}));

const { registerProviderHandlers } = await import(
  "../electron/main/ipc/provider"
);

test("a host-service disconnect forgets the owners of the streams it was running", async () => {
  registerProviderHandlers();
  const startPushTurn = handlers.get("provider:start-push-turn");
  const result = await startPushTurn?.(
    { sender: { id: 7 } },
    { providerId: "codex", prompt: "continue" },
  );
  expect(result).toMatchObject({ ok: true, streamId: "stream-1" });

  const emit = () => {
    for (const listener of streamEventListeners) {
      listener({ streamId: "stream-1" });
    }
  };
  emit();
  expect(sent.map((entry) => entry.contentsId)).toEqual([7]);

  for (const listener of disconnectListeners) listener();
  emit();
  expect(sent).toHaveLength(1);
});
