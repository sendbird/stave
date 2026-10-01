/** Terminal transport evidence; task deliverable acceptance is independent. */
export class DelegatedTaskTurnError extends Error {
  constructor(
    message: string,
    readonly outcome: "cancelled" | "unknown",
  ) {
    super(message);
    this.name = "DelegatedTaskTurnError";
  }
}
