import type { AgentRunInitialContext } from "@/lib/agent-runs/initial-context";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { LensReferenceState } from "@/lib/workspace-information-references";
import type { AppState } from "@/store/app-store.types";
import { collectTaskReferenceContextParts } from "@/store/attached-task-context-runtime";
import { getDraftImageContexts, promptDraftReferencesLens, type DraftFileContext, type DraftImageContext } from "@/store/prompt-draft-context";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import { TRACKER_ISSUE_KICKOFF_SOURCE_PREFIX } from "@/lib/tracker-issues/context";
import type { PromptDraft } from "@/types/chat";

/** Freeze explicitly supplied context once, before admitting the run. */
export async function resolveAgentRunInitialContext(args: {
  getState: () => AppState;
  workspaceId: string;
  taskId: string;
  prompt: string;
  promptDraft: PromptDraft;
  session: WorkspaceSessionState;
  fileContexts?: DraftFileContext[];
  imageContexts?: DraftImageContext[];
  includeLensCommentImages: boolean;
  informationContext: (lensState: LensReferenceState | null) => CanonicalRetrievedContextPart | null;
}): Promise<AgentRunInitialContext> {
  let lensState: LensReferenceState | null = null;
  if (promptDraftReferencesLens(args.promptDraft)) {
    const result = await window.api?.lens?.getState?.({ workspaceId: args.workspaceId });
    lensState = result?.ok && result.state ? result.state : null;
  }
  const information = args.informationContext(lensState);
  const references = await collectTaskReferenceContextParts({
    getState: args.getState,
    prompt: args.prompt,
    promptDraft: args.promptDraft,
    currentTaskId: args.taskId,
    tasks: args.session.tasks,
    messagesByTask: args.session.messagesByTask,
  });
  const task = args.session.tasks.find(({ id }) => id === args.taskId);
  const trackerContexts = task?.sourceContexts?.filter(({ sourceId }) =>
    sourceId.startsWith(TRACKER_ISSUE_KICKOFF_SOURCE_PREFIX),
  ) ?? [];
  return structuredClone({
    ...(args.promptDraft.questionReply ? { questionReply: args.promptDraft.questionReply } : {}),
    fileContexts: args.fileContexts ?? [],
    imageContexts: getDraftImageContexts(args),
    retrievedContextParts: [...trackerContexts, ...(information ? [information] : []), ...references],
  });
}
