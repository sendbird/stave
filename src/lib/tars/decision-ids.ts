export function tarsConfirmationRequestId(messageId: string, actionIndex: number) {
  return `confirm:${messageId}:${actionIndex}`;
}

export function tarsAskDecisionId(messageId: string, actionIndex: number) {
  return `ask:${messageId}:${actionIndex}`;
}

export function tarsUnverifiedDecisionId(responsibilityId: string, revision: number) {
  return `unverified:${responsibilityId}:${revision}`;
}
