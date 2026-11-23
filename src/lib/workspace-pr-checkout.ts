import { z } from "zod";
import { i18n } from "@/i18n/runtime";
import { describeWorktreeCreationFailure, type WorktreeCreationFailure } from "./git-worktree-creation";

export function parseWorkspacePrReference(input: string) {
  const value = input.trim();
  const short = /^#([1-9]\d*)$/.exec(value);
  const url = /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?(?:[?#][^\s]*)?$/i.exec(value);
  const number = Number(short?.[1] ?? url?.[3]);
  if (!Number.isSafeInteger(number) || url?.[2] === "." || url?.[2] === "..") return null;
  return { number, repository: url ? `${url[1]}/${url[2]}` : undefined };
}

/**
 * A pull request's head branch name comes from its author. Accept only names
 * Git would accept as a branch, and never one that a Git command could read as
 * an option.
 */
export function isSafeGitBranchName(value: string) {
  return value.length > 0 && value.length <= 255 && !value.startsWith("-") && !value.startsWith("/") && !value.endsWith("/")
    && !value.endsWith(".") && !value.endsWith(".lock") && !value.includes("..") && !value.includes("@{") && !value.includes("//")
    && !/[\x00-\x20\x7f~^:?*[\\]/.test(value) && !value.split("/").some((part) => part.startsWith("."));
}

export const WorkspacePrCheckoutArgsSchema = z.object({
  cwd: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  reference: z.string().max(2048).refine((value) => parseWorkspacePrReference(value) !== null),
  branch: z.string().trim().min(1).max(255).refine(isSafeGitBranchName).optional(),
}).strict();
export type WorkspacePrCheckoutArgs = z.infer<typeof WorkspacePrCheckoutArgsSchema>;
export type WorkspacePrPushReason = "fork-pr-read-only";

type PrCheckoutErrorCode = "invalidReference" | "wrongRepository" | "ghMissing" | "ghAuth" | "notFound" | "lookupFailed" | "fetchFailed";
export type WorkspacePrCheckoutResult =
  | { ok: true; branch: string; url: string; title: string; base: string; fork: boolean; linkWarning?: string }
  | { ok: false; code: PrCheckoutErrorCode; detail?: string }
  | { ok: false; code: "worktree"; failure: WorktreeCreationFailure };

export function describeWorkspacePrCheckoutError(result: Extract<WorkspacePrCheckoutResult, { ok: false }>) {
  if (result.code === "worktree") return describeWorktreeCreationFailure(result.failure);
  const message = i18n.t(`workspace:prCheckout.errors.${result.code}`);
  return result.detail ? `${message} ${result.detail}` : message;
}
