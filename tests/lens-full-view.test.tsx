import { describe, expect, test } from "bun:test";
import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../src/components/ui";
import {
  LensChrome,
  type LensChromeFullView,
} from "../src/components/panes/surfaces/lens/LensChrome";
import { createLensFullViewSource } from "../src/components/panes/surfaces/lens/useLensFullView";
import { toPersistedDockLayout } from "../src/lib/panes/dock-layout-persistence";
import {
  decodeLensFullViewState,
  encodeLensFullViewState,
  resolveLensFullViewState,
} from "../src/lib/lens/lens-full-view";

describe("resolveLensFullViewState", () => {
  test("offers full view to a grid pane that shares the pane area", () => {
    expect(
      resolveLensFullViewState({ location: "grid", isMaximized: false, gridGroupCount: 2 }),
    ).toEqual({ available: true, active: false });
  });

  test("has nothing to grow when Lens is the only grid group", () => {
    expect(
      resolveLensFullViewState({ location: "grid", isMaximized: false, gridGroupCount: 1 }),
    ).toEqual({ available: false, active: false });
  });

  test("leaves floating, popped-out and edge panes alone", () => {
    for (const location of ["floating", "popout", "edge"]) {
      expect(
        resolveLensFullViewState({ location, isMaximized: false, gridGroupCount: 3 }),
      ).toEqual({ available: false, active: false });
    }
  });

  test("always lets a maximized pane leave full view", () => {
    // The layout behind a maximized group can change (a group closed while
    // hidden), and the way back must not depend on it.
    expect(
      resolveLensFullViewState({ location: "grid", isMaximized: true, gridGroupCount: 1 }),
    ).toEqual({ available: true, active: true });
  });

  test("round-trips through the snapshot key", () => {
    for (const state of [
      { available: false, active: false },
      { available: true, active: false },
      { available: true, active: true },
    ]) {
      expect(decodeLensFullViewState(encodeLensFullViewState(state))).toEqual(state);
    }
  });
});

function renderChrome(fullView: LensChromeFullView, url = "http://localhost:5173/") {
  function Harness() {
    const urlInputRef = useRef<HTMLInputElement | null>(null);
    const isUrlInputFocused = useRef(false);
    const noop = () => {};
    const asyncNoop = async () => {};
    return createElement(
      TooltipProvider,
      null,
      createElement(LensChrome, {
        hasLensApi: true,
        lensPageActionDisabled: false,
        navigation: {
          url,
          inputUrl: url,
          setInputUrl: noop,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          goBack: noop,
          goForward: noop,
          reload: noop,
          stop: noop,
          openDevTools: noop,
          onSubmit: noop,
          onUrlKeyDown: noop,
          urlInputRef,
          isUrlInputFocused,
        },
        panelTab: "preview",
        onPanelTabChange: noop,
        consoleEntryCount: 4,
        networkEntryCount: 0,
        overlayModes: {
          isAnnotationModeActive: false,
          isBoxInspectActive: false,
          isPickerActive: false,
          toggleAnnotationMode: asyncNoop,
          toggleBoxInspect: asyncNoop,
          startElementPicker: asyncNoop,
          setIsAnnotationModeActive: noop,
          setIsBoxInspectActive: noop,
        },
        picker: { disabled: false, tooltip: "Pick" },
        capture: {
          downloads: [],
          saveScreenshot: asyncNoop,
          downloadPageAssets: asyncNoop,
          openDownloadInFinder: noop,
        },
        pageLinks: { copyAddress: noop, openInBrowser: noop },
        fullView,
        onFloatingSurfaceOpenChange: noop,
      }),
    );
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe("LensChrome full view control", () => {
  test("offers to enter full view when it is available", () => {
    const html = renderChrome({ available: true, active: false, toggle: () => {} });
    const control = html.match(/<button[^>]*data-testid="lens-full-view-toggle"[^>]*>/)?.[0] ?? "";
    expect(control).toContain('aria-label="Enter full view"');
    // The label carries the state; aria-pressed would announce it twice.
    expect(control).not.toContain("aria-pressed");
    expect(control).not.toContain("disabled");
  });

  test("offers the way back while in full view", () => {
    const html = renderChrome({ available: true, active: true, toggle: () => {} });
    const control = html.match(/<button[^>]*data-testid="lens-full-view-toggle"[^>]*>/)?.[0] ?? "";
    expect(control).toContain('aria-label="Exit full view"');
  });

  test("disables the control when there is nothing to grow", () => {
    const html = renderChrome({ available: false, active: false, toggle: () => {} });
    const control = html.match(/<button[^>]*data-testid="lens-full-view-toggle"[^>]*>/)?.[0] ?? "";
    expect(control).toContain("disabled");
  });

  test("keeps navigation, address, and page tools in one toolbar", () => {
    const html = renderChrome({ available: true, active: false, toggle: () => {} });
    expect(html).toContain('data-testid="lens-chrome"');
    expect(html).toContain('aria-label="Page address"');
    expect(html).toContain('aria-label="Show console, 4 log entries"');
    // The clear control appears only while the address is being edited.
    expect(html).not.toContain('aria-label="Clear address"');
  });
});

describe("createLensFullViewSource", () => {
  function emitter() {
    const listeners = new Set<() => void>();
    return {
      on: (listener: () => void) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      fire: () => {
        for (const listener of [...listeners]) listener();
      },
      size: () => listeners.size,
    };
  }

  function fakeHost(initial: { groups: string[]; location?: string }) {
    const events = {
      maximized: emitter(),
      layout: emitter(),
      addGroup: emitter(),
      removeGroup: emitter(),
      location: emitter(),
      group: emitter(),
    };
    const state = {
      maximized: false,
      location: initial.location ?? "grid",
      groups: initial.groups.map((type) => ({ api: { location: { type } } })),
      activated: 0,
    };
    const panelApi = {
      get location() {
        return { type: state.location };
      },
      isMaximized: () => state.maximized,
      maximize: () => {
        state.maximized = true;
        events.maximized.fire();
      },
      exitMaximized: () => {
        state.maximized = false;
        events.maximized.fire();
      },
      setActive: () => {
        state.activated += 1;
      },
      onDidLocationChange: events.location.on,
      onDidGroupChange: events.group.on,
    };
    const containerApi = {
      get groups() {
        return state.groups;
      },
      onDidMaximizedGroupChange: events.maximized.on,
      onDidLayoutChange: events.layout.on,
      onDidAddGroup: events.addGroup.on,
      onDidRemoveGroup: events.removeGroup.on,
    };
    return { state, events, source: createLensFullViewSource(panelApi, containerApi) };
  }

  test("enters and leaves full view through the host's maximize", () => {
    const { state, source } = fakeHost({ groups: ["grid", "grid"] });
    expect(decodeLensFullViewState(source.getSnapshot())).toEqual({ available: true, active: false });
    source.toggle();
    expect(state.maximized).toBe(true);
    expect(state.activated).toBe(1);
    expect(decodeLensFullViewState(source.getSnapshot())).toEqual({ available: true, active: true });
    source.toggle();
    expect(state.maximized).toBe(false);
  });

  test("does nothing when there is nothing to grow", () => {
    const { state, source } = fakeHost({ groups: ["grid"] });
    source.toggle();
    expect(state.maximized).toBe(false);
    expect(state.activated).toBe(0);
  });

  test("notices when the host leaves full view on its own", () => {
    const { state, events, source } = fakeHost({ groups: ["grid", "grid"] });
    let changes = 0;
    const unsubscribe = source.subscribe(() => {
      changes += 1;
    });
    source.toggle();
    // A pane added while maximized: the host exits maximize and adds a group.
    state.maximized = false;
    state.groups = [...state.groups, { api: { location: { type: "grid" } } }];
    events.addGroup.fire();
    events.layout.fire();
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(decodeLensFullViewState(source.getSnapshot())).toEqual({ available: true, active: false });
    unsubscribe();
  });

  test("follows the pane when it floats out of the grid", () => {
    const { state, events, source } = fakeHost({ groups: ["grid", "grid"] });
    let changes = 0;
    const unsubscribe = source.subscribe(() => {
      changes += 1;
    });
    state.location = "floating";
    events.location.fire();
    expect(changes).toBe(1);
    expect(decodeLensFullViewState(source.getSnapshot()).available).toBe(false);
    unsubscribe();
  });

  test("releases every listener on unsubscribe", () => {
    const { events, source } = fakeHost({ groups: ["grid", "grid"] });
    const unsubscribe = source.subscribe(() => {});
    const all = Object.values(events);
    expect(all.every((event) => event.size() === 1)).toBe(true);
    unsubscribe();
    expect(all.every((event) => event.size() === 0)).toBe(true);
  });
});

describe("toPersistedDockLayout", () => {
  test("drops a maximized group from the saved arrangement", () => {
    const layout = { grid: { root: {} }, panels: {}, activeGroup: "1", maximizedNode: { location: [0] } };
    const persisted = toPersistedDockLayout(layout);
    expect("maximizedNode" in persisted).toBe(false);
    expect(persisted).toEqual({ grid: { root: {} }, panels: {}, activeGroup: "1" });
    // The live layout object is not mutated.
    expect("maximizedNode" in layout).toBe(true);
  });

  test("returns the same object when nothing is maximized", () => {
    const layout = { grid: { root: {} }, panels: {} };
    expect(toPersistedDockLayout(layout)).toBe(layout);
  });
});
