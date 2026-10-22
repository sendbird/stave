import {
  TURN_HISTORY_LIST_IPC,
  TURN_HISTORY_RECORD_IPC,
  type ListTaskTurnHistoryArgs,
  type ReadTaskTurnRecordArgs,
  type TurnHistoryListResponse,
  type TurnRecordResponse,
} from "../../src/lib/providers/turn-history";

export function turnHistoryPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    listTaskTurnHistory: (args: ListTaskTurnHistoryArgs) =>
      invoke(TURN_HISTORY_LIST_IPC, args) as Promise<TurnHistoryListResponse>,
    readTaskTurnRecord: (args: ReadTaskTurnRecordArgs) =>
      invoke(TURN_HISTORY_RECORD_IPC, args) as Promise<TurnRecordResponse>,
  };
}
