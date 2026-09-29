import { describe, expect, test } from "bun:test";
import {
  AGENTS_APP_SURFACE,
  WORKSPACE_APP_SURFACE,
  createAppSurfaceActions,
  normalizeAppActiveSurface,
  type AppActiveSurface,
} from "../src/store/app-surface";

function makeStore() {
  let state: { activeAppSurface: AppActiveSurface } = {
    activeAppSurface: WORKSPACE_APP_SURFACE,
  };
  const set = (
    updater: (
      current: typeof state,
    ) => typeof state | { activeAppSurface: AppActiveSurface },
  ) => {
    state = { ...state, ...updater(state) };
  };
  return {
    actions: createAppSurfaceActions(set),
    get: () => state,
  };
}

describe("app surface: agents", () => {
  test("open, toggle and close move the surface to and from agents", () => {
    const store = makeStore();
    store.actions.openAgents();
    expect(store.get().activeAppSurface.kind).toBe("agents");
    // Opening the same surface keeps the frozen singleton (stable reference).
    expect(store.get().activeAppSurface).toBe(AGENTS_APP_SURFACE);

    store.actions.toggleAgents();
    expect(store.get().activeAppSurface.kind).toBe("workspace");

    store.actions.toggleAgents();
    expect(store.get().activeAppSurface.kind).toBe("agents");

    store.actions.closeAgents();
    expect(store.get().activeAppSurface.kind).toBe("workspace");
  });

  test("closeAgents leaves another surface untouched", () => {
    const store = makeStore();
    store.actions.openProjects();
    store.actions.closeAgents();
    expect(store.get().activeAppSurface.kind).toBe("projects");
  });

  test("persistence normalizes a stored agents surface to its singleton", () => {
    expect(normalizeAppActiveSurface({ kind: "agents" })).toBe(AGENTS_APP_SURFACE);
  });

  test("persistence falls back to workspace for an unknown surface", () => {
    expect(normalizeAppActiveSurface({ kind: "nope" }).kind).toBe("workspace");
    expect(normalizeAppActiveSurface(null).kind).toBe("workspace");
  });
});
