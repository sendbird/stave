import { z } from "zod";
import { ProviderAccountProfileIdSchema } from "@/lib/providers/provider-accounts";
import { SIDE_CHAT_PROVIDER_IDS } from "./side-chat";

/**
 * The renderer asks the host for a side question's answer. The host runs the
 * provider's read-only prompt path: no tools, no MCP servers, no plugins, no
 * task-bound secrets, and nothing is written to the task.
 */
export const SIDE_QUESTION_IPC = "provider:ask-side-question";

/** A side question's whole prompt: the excerpt is bounded well below this. */
export const SIDE_QUESTION_PROMPT_MAX_CHARS = 60_000;

const PathSchema = z.string().trim().min(1).max(4096);

export const AskSideQuestionArgsSchema = z
  .object({
    providerId: z.enum(SIDE_CHAT_PROVIDER_IDS),
    model: z.string().trim().min(1).max(200),
    cwd: PathSchema.optional(),
    prompt: z.string().min(1).max(SIDE_QUESTION_PROMPT_MAX_CHARS),
    /** The task's account and executables; the host scopes the request to the account. */
    runtimeOptions: z
      .object({
        claudeAccountProfileId: ProviderAccountProfileIdSchema.optional(),
        codexAccountProfileId: ProviderAccountProfileIdSchema.optional(),
        claudeBinaryPath: PathSchema.optional(),
        codexBinaryPath: PathSchema.optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type AskSideQuestionArgs = z.input<typeof AskSideQuestionArgsSchema>;
export type ParsedAskSideQuestionArgs = z.output<typeof AskSideQuestionArgsSchema>;

export type AskSideQuestionResponse =
  | { ok: true; text: string }
  | { ok: false; message: string };
