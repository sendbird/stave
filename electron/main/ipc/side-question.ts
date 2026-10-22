import { ipcMain } from "electron";
import { invokeHostService } from "../host-service-client";
import {
  AskSideQuestionArgsSchema,
  SIDE_QUESTION_IPC,
  type AskSideQuestionResponse,
} from "../../../src/lib/side-chat/side-chat-ipc";

/** A side question goes to the host, which runs the provider's read-only prompt path. */
export function registerSideQuestionHandlers() {
  ipcMain.handle(
    SIDE_QUESTION_IPC,
    async (_event, input: unknown): Promise<AskSideQuestionResponse> => {
      const parsed = AskSideQuestionArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid side question." };
      try {
        return await invokeHostService("provider.ask-side-question", parsed.data);
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    },
  );
}
