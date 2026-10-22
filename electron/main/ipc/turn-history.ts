import { ipcMain } from "electron";
import { ensurePersistenceReady } from "../state";
import {
  ListTaskTurnHistoryArgsSchema,
  ReadTaskTurnRecordArgsSchema,
  TURN_HISTORY_LIST_IPC,
  TURN_HISTORY_RECORD_IPC,
  type TurnHistoryListResponse,
  type TurnRecordResponse,
} from "../../../src/lib/providers/turn-history";

/** Activity's turn picker and the turn records it opens. Messages are diagnostics; the window words its own errors. */
export function registerTurnHistoryHandlers() {
  ipcMain.handle(
    TURN_HISTORY_LIST_IPC,
    async (_event, input: unknown): Promise<TurnHistoryListResponse> => {
      const parsed = ListTaskTurnHistoryArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid turn history request." };
      try {
        const store = await ensurePersistenceReady();
        return { ok: true, page: store.turnDigests.listTurnHistory(parsed.data) };
      } catch (error) {
        return { ok: false, message: `Turn history could not be read: ${String(error)}` };
      }
    },
  );
  ipcMain.handle(
    TURN_HISTORY_RECORD_IPC,
    async (_event, input: unknown): Promise<TurnRecordResponse> => {
      const parsed = ReadTaskTurnRecordArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid turn record request." };
      try {
        const store = await ensurePersistenceReady();
        return { ok: true, record: store.turnDigests.readTurnRecord(parsed.data) };
      } catch (error) {
        return { ok: false, message: `Turn record could not be read: ${String(error)}` };
      }
    },
  );
}
