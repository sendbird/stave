export const FLEET_BULK_COMMAND = "stave:fleet-bulk-command";
export interface FleetBulkCommand { operation: "stop" | "archive" | "read"; repositoryPath?: string }
let pending: FleetBulkCommand | null = null;
export function requestFleetBulkCommand(command: FleetBulkCommand) {
  pending = command;
  window.dispatchEvent(new Event(FLEET_BULK_COMMAND));
}
export function takeFleetBulkCommand() { const command = pending; pending = null; return command; }
