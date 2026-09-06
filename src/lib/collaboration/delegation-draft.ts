import { z } from "zod";
import {
  ChildTaskDelegateArgsSchema,
  ChildTaskPermissionProfileSchema,
  type ChildTaskDelegateArgs,
} from "@/lib/runs/child-task";

export const DelegationDraftScopeSchema = z
  .object({
    projectPath: z.string().trim().min(1).max(4_096),
    workspaceId: z.string().trim().min(1).max(150),
    taskId: z.string().trim().min(1).max(150),
  })
  .strict();
export type DelegationDraftScope = z.infer<typeof DelegationDraftScopeSchema>;

/** One bounded form draft. It contains no transcript or child-task output. */
export const DelegationDraftSchema = z
  .object({
    prompt: z.string().max(100_000),
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().max(200),
    permissionProfile: ChildTaskPermissionProfileSchema,
    keepOpen: z.boolean(),
    isolated: z.boolean(),
    /**
     * Exact request acknowledged by draft storage before transport begins.
     * It stays present after uncertain delivery so an unchanged retry keeps
     * the same idempotency identity. Editing any field removes it.
     */
    pendingRequest: ChildTaskDelegateArgsSchema.optional(),
    deliveryUncertain: z.boolean(),
  })
  .strict();
export type DelegationDraft = z.infer<typeof DelegationDraftSchema>;

export const SaveDelegationDraftSchema = z
  .object({
    scope: DelegationDraftScopeSchema,
    draft: DelegationDraftSchema.nullable(),
  })
  .strict()
  .superRefine(({ scope, draft }, context) => {
    const pending = draft?.pendingRequest;
    if (
      pending &&
      (pending.projectPath !== scope.projectPath ||
        pending.parentWorkspaceId !== scope.workspaceId ||
        pending.parentTaskId !== scope.taskId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["draft", "pendingRequest"],
        message: "The pending delegation does not belong to this draft.",
      });
    }
  });

export const LoadDelegationDraftSchema = z
  .object({ scope: DelegationDraftScopeSchema })
  .strict();

export const ClearAcceptedDelegationDraftSchema = z
  .object({
    scope: DelegationDraftScopeSchema,
    delegationKey: z.string().trim().min(1).max(120),
  })
  .strict();

export function createEmptyDelegationDraft(): DelegationDraft {
  return {
    prompt: "",
    providerId: "codex",
    model: "",
    permissionProfile: "guided",
    keepOpen: true,
    isolated: true,
    deliveryUncertain: false,
  };
}

/** A deliberate form edit starts a new potential delegation identity. */
export function editDelegationDraft(
  draft: DelegationDraft,
  patch: Partial<
    Pick<
      DelegationDraft,
      | "prompt"
      | "providerId"
      | "model"
      | "permissionProfile"
      | "keepOpen"
      | "isolated"
    >
  >,
): DelegationDraft {
  const next = {
    ...draft,
    ...patch,
    pendingRequest: undefined,
    deliveryUncertain: false,
  };
  return DelegationDraftSchema.parse(next);
}

export function prepareDelegationDraftRequest(args: {
  scope: DelegationDraftScope;
  draft: DelegationDraft;
  createDelegationKey: () => string;
}):
  | { ok: true; draft: DelegationDraft; request: ChildTaskDelegateArgs }
  | { ok: false; message: string } {
  const owned = SaveDelegationDraftSchema.safeParse({
    scope: args.scope,
    draft: args.draft,
  });
  if (!owned.success) {
    return {
      ok: false,
      message:
        owned.error.issues[0]?.message ?? "Check the delegation details.",
    };
  }
  const delegationKey =
    args.draft.pendingRequest?.delegationKey ?? args.createDelegationKey();
  const request = ChildTaskDelegateArgsSchema.safeParse(
    args.draft.pendingRequest ?? {
      projectPath: args.scope.projectPath,
      parentWorkspaceId: args.scope.workspaceId,
      parentTaskId: args.scope.taskId,
      delegationKey,
      prompt: args.draft.prompt,
      providerId: args.draft.providerId,
      model: args.draft.model.trim() || undefined,
      permissionProfile: args.draft.permissionProfile,
      lifecycle: args.draft.keepOpen ? "detached" : "one-turn",
      workspace: args.draft.isolated
        ? { mode: "new-worktree", name: delegationKey }
        : { mode: "same-workspace" },
    },
  );
  if (request.success) {
    return {
      ok: true,
      request: request.data,
      draft: DelegationDraftSchema.parse({
        ...args.draft,
        pendingRequest: request.data,
        deliveryUncertain: true,
      }),
    };
  }
  return {
    ok: false,
    message: request.error.issues[0]?.message ?? "Check the delegation details.",
  };
}

export function delegationDraftScopeKey(scope: DelegationDraftScope): string {
  const parsed = DelegationDraftScopeSchema.parse(scope);
  return JSON.stringify([
    parsed.projectPath,
    parsed.workspaceId,
    parsed.taskId,
  ]);
}
