export interface TaskScrollToLatestRequest {
  taskId: string;
  nonce: number;
}

export interface TaskScrollAnchor {
  messageId: string;
  offset: number;
}

interface TaskScrollToLatestState {
  scrollToLatestMessageRequest: TaskScrollToLatestRequest | null;
}

export function createTaskScrollAnchorCache(limit = 200) {
  const anchors = new Map<string, TaskScrollAnchor>();
  const normalizedLimit = Math.max(1, Math.floor(limit));

  return {
    get(taskId: string) {
      return anchors.get(taskId);
    },
    save(taskId: string, anchor: TaskScrollAnchor) {
      anchors.delete(taskId);
      anchors.set(taskId, anchor);
      if (anchors.size <= normalizedLimit) {
        return;
      }
      const oldestTaskId = anchors.keys().next().value;
      if (oldestTaskId !== undefined) {
        anchors.delete(oldestTaskId);
      }
    },
    delete(taskId: string) {
      anchors.delete(taskId);
    },
  };
}

export const taskScrollAnchorCache = createTaskScrollAnchorCache();

export function retainTaskScrollToLatestNonce(args: {
  currentNonce: number;
  request: TaskScrollToLatestRequest | null;
  taskId: string;
}) {
  if (args.request?.taskId !== args.taskId) {
    return args.currentNonce;
  }
  return Math.max(args.currentNonce, args.request.nonce);
}

export function reduceTaskScrollToLatestRequest(args: {
  state: TaskScrollToLatestState;
  taskId: string;
}): TaskScrollToLatestState {
  const taskId = args.taskId.trim();
  if (!taskId) {
    return args.state;
  }
  return {
    scrollToLatestMessageRequest: {
      taskId,
      nonce: (args.state.scrollToLatestMessageRequest?.nonce ?? 0) + 1,
    },
  };
}
