import { z } from "zod";
import { ENV_VAR_NAME_MAX_LENGTH } from "../../../src/lib/secrets/secrets";
import {
  SECRET_REQUEST_LABEL_MAX_LENGTH,
  SECRET_REQUEST_REASON_MAX_LENGTH,
  SECRET_REQUEST_TIMEOUT_MS,
  type SecretRequestToolResult,
} from "../../../src/lib/secrets/secret-request";
import type { StaveMcpCaller } from "../stave-mcp-caller";
import { SecretRequestError, type SecretRequestBroker } from "./secret-request-broker";

export const SECRET_REQUEST_TOOL_NAME = "stave_request_secret";

/**
 * The only arguments the tool accepts. Strict, so a stray `value` (or any
 * other key) is rejected instead of silently dropped: the value never travels
 * through the tool, and the request log keeps only these keys.
 */
export const SECRET_REQUEST_TOOL_ARGUMENT_KEYS = ["envVar", "reason", "label"] as const;

export const SecretRequestToolInputSchema = z
  .object({
    envVar: z
      .string()
      .trim()
      .min(1)
      .max(ENV_VAR_NAME_MAX_LENGTH)
      .describe("Environment variable to expose the secret as, e.g. OPENAI_API_KEY."),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(SECRET_REQUEST_REASON_MAX_LENGTH)
      .describe("One sentence the user reads on the card: what the secret is for."),
    label: z
      .string()
      .trim()
      .min(1)
      .max(SECRET_REQUEST_LABEL_MAX_LENGTH)
      .optional()
      .describe("Optional name for the saved secret, e.g. \"OpenAI API key\"."),
  })
  .strict();

export type SecretRequestToolInput = z.infer<typeof SecretRequestToolInputSchema>;

const TIMEOUT_MINUTES = Math.round(SECRET_REQUEST_TIMEOUT_MS / 60_000);

export const SECRET_REQUEST_TOOL_CONFIG = {
  description: [
    "Ask the user for a secret (API key, token, password) through a masked card in this task's conversation. Never ask the user to paste a secret into chat.",
    `Waits up to ${TIMEOUT_MINUTES} minutes for the user. You never receive the value: on save Stave stores it in the user's Secrets vault and binds it to this task. If a saved secret already uses envVar, the user can bind that one instead.`,
    "The value is set as envVar for shell commands from the NEXT turn, not this one: a running turn cannot receive a new environment variable.",
    "Returns {status: saved|declined|timed_out, envVar, availableFrom}. After saved, finish what you can without it and ask the user to send a message to continue.",
    "Works only inside a Stave task turn; read-only tasks cannot request secrets.",
  ].join(" "),
  inputSchema: SecretRequestToolInputSchema,
};

/**
 * One `stave_request_secret` call: refuses callers that have no task card to
 * show (an external client) or must never wait on a person (a read-only task),
 * then waits on the broker. Resolves to metadata only.
 */
export async function runSecretRequestTool(args: {
  caller: StaveMcpCaller;
  input: SecretRequestToolInput;
  broker: Pick<SecretRequestBroker, "request">;
  signal?: AbortSignal;
}): Promise<SecretRequestToolResult> {
  if (args.caller.kind !== "turn") {
    throw new SecretRequestError(
      "stave_request_secret works only inside a Stave task turn: the card appears in that task's conversation.",
    );
  }
  const { grant } = args.caller;
  if (grant.autonomy === "read-only") {
    throw new SecretRequestError(
      "A read-only task cannot request secrets. Report what is missing in your answer instead.",
    );
  }
  return args.broker.request({
    caller: {
      taskId: grant.taskId,
      workspaceId: grant.workspaceId,
      turnId: grant.turnId,
      providerId: grant.providerId,
    },
    envVar: args.input.envVar,
    reason: args.input.reason,
    ...(args.input.label ? { label: args.input.label } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
