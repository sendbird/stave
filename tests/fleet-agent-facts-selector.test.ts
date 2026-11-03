import { expect, test } from "bun:test";
import { createFleetAgentFactsSelector } from "@/components/layout/fleet-agent-facts-selector";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import type { AppState } from "@/store/app-store.types";
import type { ChatMessage } from "@/types/chat";

test("an unrelated store update does not re-read row messages; a changed task still updates", () => {
  let reads = 0;
  const messages = [{ role: "assistant", get model() { reads++; return "model-a"; } }] as ChatMessage[];
  const row = { key: "row", repositoryPath: "/tmp/project", workspaceId: "ws", task: { id: "task" } } as FleetTaskRow;
  const state = { repositoryPath: "/tmp/project", activeWorkspaceId: "ws", messagesByTask: { task: messages }, providerTurnActivityByTask: {} } as AppState;
  const select = createFleetAgentFactsSelector([row]);
  const first = select(state);
  expect(first.row?.model).toBe("model-a");
  reads = 0;
  expect(select({ ...state })).toBe(first);
  expect(select(state)).toBe(first);
  expect(reads).toBe(0);
  const changed = select({ ...state, messagesByTask: { task: [{ role: "assistant", model: "model-b" } as ChatMessage] } });
  expect(changed.row?.model).toBe("model-b");
  expect(select({ ...state, repositoryPath: "/tmp/other" }).row?.model).toBeNull();
});
