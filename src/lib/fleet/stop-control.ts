/** Ownership is settled before direct control; refusal never falls through. */
export async function stopFleetItem(operations: {
  routeOwnership(): Promise<"direct" | "applied" | "held" | "rejected" | "failed">;
  stop(keepAgentRun: boolean): Promise<boolean | void>;
}): Promise<"stopped" | "managed" | "changed"> {
  const ownership = await operations.routeOwnership();
  if (ownership !== "direct" && ownership !== "applied") return "managed";
  return await operations.stop(ownership === "applied") === false ? "changed" : "stopped";
}
