import { AsyncLocalStorage } from "node:async_hooks";
import type { LensAutomationState, LensReviewTarget } from "../../../src/lib/lens/lens-review.types";

type State = LensAutomationState & { generation: number };
type Lease = { state?: State; generation?: number; acquired: boolean; tool: string };
const states = new Map<string, State>();
const MAX_PREVIEWS = 8;
const context = new AsyncLocalStorage<Lease>();
function stateFor(target: LensReviewTarget): State {
  const key = JSON.stringify([target.workspaceId, target.lensSessionId ?? "default"]);
  let state = states.get(key);
  if (!state) {
    state = { workspaceId: target.workspaceId, lensSessionId: target.lensSessionId, paused: false, running: 0, generation: 0 };
    states.set(key, state);
  }
  return state;
}
export function getLensAutomation(target: LensReviewTarget): LensAutomationState {
  const { generation: _, ...state } = stateFor(target);
  return state;
}
export function pauseLensAutomation(target: LensReviewTarget, paused: boolean) {
  const state = stateFor(target);
  if (state.paused !== paused) state.generation++;
  state.paused = paused;
  state.preview = undefined;
  state.capturedAt = undefined;
  return getLensAutomation(target);
}
export function assertLensAutomationAllowed() {
  const current = context.getStore();
  if (current?.state && (current.state.paused || current.generation !== current.state.generation)) {
    throw new Error("Lens automation is paused for direct interaction. Wait for the user to resume it in Lens.");
  }
}
/** Pin the resolved session once, including when the caller omitted its id. */
export function bindLensAutomation(target: LensReviewTarget) {
  const current = context.getStore();
  if (!current) return;
  if (!current.state) {
    current.state = stateFor(target);
    current.generation = current.state.generation;
    assertLensAutomationAllowed();
    current.state.running++;
    current.state.tool = current.tool;
    current.acquired = true;
  }
  assertLensAutomationAllowed();
}
export async function runLensAutomation<T>(tool: string, run: () => Promise<T>, capture?: () => Promise<string | undefined>): Promise<T> {
  return context.run({ tool, acquired: false }, async () => {
    try {
      const result = await run();
      assertLensAutomationAllowed();
      const current = context.getStore()!;
      if (current.state && capture) {
        const preview = await capture().catch(() => undefined);
        if (!current.state.paused && current.generation === current.state.generation && preview) {
          current.state.preview = preview;
          current.state.capturedAt = new Date().toISOString();
          const previews = [...states.values()].filter((state) => state.preview).sort((left, right) => (right.capturedAt ?? "").localeCompare(left.capturedAt ?? ""));
          for (const older of previews.slice(MAX_PREVIEWS)) { older.preview = undefined; older.capturedAt = undefined; }
        }
      }
      return result;
    } finally {
      const current = context.getStore()!;
      if (current.acquired && current.state) current.state.running--;
    }
  });
}
