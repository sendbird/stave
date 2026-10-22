import { ipcMain } from "electron";
import { ensurePersistenceReady } from "../state";
import {
  ReadTaskHandoffArgsSchema,
  SaveTaskHandoffArgsSchema,
  TASK_HANDOFF_READ_IPC,
  TASK_HANDOFF_SAVE_IPC,
  type ReadTaskHandoffResponse,
  type SaveTaskHandoffResponse,
} from "../../../src/lib/task-context/handoff-record-ipc";

/** The Task panel's handoff record. Messages are diagnostics; the window words its own errors. */
export function registerTaskHandoffHandlers() {
  ipcMain.handle(
    TASK_HANDOFF_READ_IPC,
    async (_event, input: unknown): Promise<ReadTaskHandoffResponse> => {
      const parsed = ReadTaskHandoffArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid handoff record request." };
      try {
        const store = await ensurePersistenceReady();
        return { ok: true, record: store.taskHandoffs.read(parsed.data) };
      } catch (error) {
        return { ok: false, message: `The handoff record could not be read: ${String(error)}` };
      }
    },
  );
  ipcMain.handle(
    TASK_HANDOFF_SAVE_IPC,
    async (_event, input: unknown): Promise<SaveTaskHandoffResponse> => {
      const parsed = SaveTaskHandoffArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid handoff record." };
      try {
        const store = await ensurePersistenceReady();
        return store.taskHandoffs.save(parsed.data);
      } catch (error) {
        return { ok: false, message: `The handoff record could not be saved: ${String(error)}` };
      }
    },
  );
}
