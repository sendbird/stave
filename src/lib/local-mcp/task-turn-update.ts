import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

/**
 * Content-free signal emitted after the host service has persisted a task turn
 * update. The renderer reloads the task from SQLite instead of replaying this
 * signal, keeping the persisted task session authoritative and avoiding
 * duplicate streamed chunks.
 */
export interface LocalMcpTaskTurnUpdate {
  workspaceId: string;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  model: string;
  sequence: number;
  eventType: "started" | NormalizedProviderEvent["type"];
  done: boolean;
}
