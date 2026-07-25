export interface ComparePreparationRequest {
  taskId: string;
  nonce: number;
}

let latestRequest: ComparePreparationRequest | null = null;
let nextNonce = 0;
let consumedNonce = 0;
const listeners = new Set<() => void>();

export function requestComparePreparation(taskId: string) {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    return false;
  }
  latestRequest = {
    taskId: normalizedTaskId,
    nonce: ++nextNonce,
  };
  for (const listener of listeners) {
    listener();
  }
  return true;
}

export function consumeComparePreparationRequest(taskId: string) {
  const normalizedTaskId = taskId.trim();
  if (
    !latestRequest ||
    latestRequest.taskId !== normalizedTaskId ||
    consumedNonce >= latestRequest.nonce
  ) {
    return null;
  }
  consumedNonce = latestRequest.nonce;
  return latestRequest;
}

export function subscribeComparePreparationRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
