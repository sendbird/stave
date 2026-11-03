/**
 * The worker that raised a Codex server request. A request raised on a
 * worker's own thread names that worker, the same id its tool events carry as
 * `ownerAgentId` (symmetric with Claude's `agentID`); the turn's own thread
 * names nobody.
 */
export function codexChildRequestOwner(args: {
  requestThreadId: string | null | undefined;
  threadId: string | null | undefined;
}): { ownerAgentId?: string } {
  const { requestThreadId, threadId } = args;
  return requestThreadId && threadId && requestThreadId !== threadId ? { ownerAgentId: requestThreadId } : {};
}
