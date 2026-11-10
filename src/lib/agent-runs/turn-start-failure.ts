/**
 * The stuck-stage sentence for a stage turn that could not start. This module
 * owns its fixed English lead, so Tars can recognize the failure as a code
 * (`turnStartFailed`) and translate it, keeping the provider's own diagnostic
 * as a separate, expandable detail. The full sentence stays the stage's
 * diagnostic for the run log and the model.
 */
// i18n-ignore: diagnostic lead recorded on the stage; surfaces translate it by code
const TURN_START_FAILURE_LEAD = "The stage's turn could not start: ";

export function agentRunTurnStartFailureDetail(diagnostic: string) {
  return `${TURN_START_FAILURE_LEAD}${diagnostic}`;
}

/** The provider's diagnostic of a turn-start failure; null for any other stage detail. */
export function parseAgentRunTurnStartFailure(detail: string | null | undefined): string | null {
  return detail?.startsWith(TURN_START_FAILURE_LEAD) ? detail.slice(TURN_START_FAILURE_LEAD.length).trim() || null : null;
}
