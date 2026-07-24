import { PROVIDER_STEER_ACK_TIMEOUT_MS } from "../../src/lib/providers/steer-delivery";

export const CODEX_STEER_REQUEST_TIMEOUT_MS =
  PROVIDER_STEER_ACK_TIMEOUT_MS + 1_000;

export function buildCodexTurnSteerParams(args: {
  threadId: string;
  expectedTurnId: string;
  text: string;
  clientMessageId?: string;
}) {
  return {
    threadId: args.threadId,
    expectedTurnId: args.expectedTurnId,
    ...(args.clientMessageId
      ? { clientUserMessageId: args.clientMessageId }
      : {}),
    input: [
      {
        type: "text" as const,
        text: args.text,
        text_elements: [],
      },
    ],
  };
}
