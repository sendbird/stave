export interface WorkspaceScriptEventSubscriptionRegistry {
  workspaceIdsByContentsId: Map<number, Set<string>>;
}

export function createWorkspaceScriptEventSubscriptionRegistry(): WorkspaceScriptEventSubscriptionRegistry {
  return {
    workspaceIdsByContentsId: new Map(),
  };
}

export function addWorkspaceScriptEventSubscription(args: {
  registry: WorkspaceScriptEventSubscriptionRegistry;
  contentsId: number;
  workspaceId: string;
}) {
  const workspaceIds = args.registry.workspaceIdsByContentsId.get(args.contentsId) ?? new Set<string>();
  workspaceIds.add(args.workspaceId);
  args.registry.workspaceIdsByContentsId.set(args.contentsId, workspaceIds);
}

export function removeWorkspaceScriptEventSubscription(args: {
  registry: WorkspaceScriptEventSubscriptionRegistry;
  contentsId: number;
  workspaceId: string;
}) {
  const workspaceIds = args.registry.workspaceIdsByContentsId.get(args.contentsId);
  if (!workspaceIds) {
    return;
  }
  workspaceIds.delete(args.workspaceId);
  if (workspaceIds.size === 0) {
    args.registry.workspaceIdsByContentsId.delete(args.contentsId);
  }
}

export function removeAllWorkspaceScriptEventSubscriptions(args: {
  registry: WorkspaceScriptEventSubscriptionRegistry;
  contentsId: number;
}) {
  args.registry.workspaceIdsByContentsId.delete(args.contentsId);
}

export function listWorkspaceScriptEventSubscriberIds(args: {
  registry: WorkspaceScriptEventSubscriptionRegistry;
  workspaceId: string;
}) {
  const subscriberIds: number[] = [];
  for (const [contentsId, workspaceIds] of args.registry.workspaceIdsByContentsId.entries()) {
    if (!workspaceIds.has(args.workspaceId)) {
      continue;
    }
    subscriberIds.push(contentsId);
  }
  return subscriberIds;
}
