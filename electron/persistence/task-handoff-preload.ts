import {
  TASK_HANDOFF_READ_IPC,
  TASK_HANDOFF_SAVE_IPC,
  type ReadTaskHandoffArgs,
  type ReadTaskHandoffResponse,
  type SaveTaskHandoffArgs,
  type SaveTaskHandoffResponse,
} from "../../src/lib/task-context/handoff-record-ipc";

export function taskHandoffPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    readTaskHandoff: (args: ReadTaskHandoffArgs) =>
      invoke(TASK_HANDOFF_READ_IPC, args) as Promise<ReadTaskHandoffResponse>,
    saveTaskHandoff: (args: SaveTaskHandoffArgs) =>
      invoke(TASK_HANDOFF_SAVE_IPC, args) as Promise<SaveTaskHandoffResponse>,
  };
}
