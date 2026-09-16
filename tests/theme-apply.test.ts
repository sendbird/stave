import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  THEME_CHANGING_CLASS,
  applyCustomTheme,
  applyThemeClass,
  applyThemeOverrides,
} from "@/lib/themes/apply";
import type { CustomThemeDefinition } from "@/lib/themes/types";

const globals = readFileSync(
  new URL("../src/globals.css", import.meta.url),
  "utf8",
);

type FrameCallback = (time: number) => void;

const sampleTheme: CustomThemeDefinition = {
  id: "test-theme",
  name: "Test Theme",
  description: "Fixture",
  baseMode: "dark",
  version: "1.0.0",
  tokens: {
    background: "#111111",
    foreground: "#eeeeee",
  },
};

function installDocumentMock() {
  const classSet = new Set<string>();
  const styles = new Map<string, { id: string; textContent: string }>();
  const root = {
    classList: {
      add: (name: string) => {
        classSet.add(name);
      },
      remove: (name: string) => {
        classSet.delete(name);
      },
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classSet.has(name);
        if (next) {
          classSet.add(name);
        } else {
          classSet.delete(name);
        }
        return next;
      },
      contains: (name: string) => classSet.has(name),
    },
    offsetWidth: 1,
  };

  const documentMock = {
    documentElement: root,
    getElementById: (id: string) => styles.get(id) ?? null,
    createElement: (tag: string) => {
      if (tag !== "style") {
        throw new Error(`unexpected createElement(${tag})`);
      }
      const element = {
        id: "",
        textContent: "",
        remove: () => {
          styles.delete(element.id);
        },
      };
      return element;
    },
    head: {
      appendChild: (element: { id: string; textContent: string }) => {
        styles.set(element.id, element);
      },
      insertBefore: (element: { id: string; textContent: string }) => {
        styles.set(element.id, element);
      },
    },
  };

  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const frames: FrameCallback[] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: documentMock,
  });
  globalThis.requestAnimationFrame = (callback: FrameCallback) => {
    frames.push(callback);
    return frames.length;
  };

  return {
    classSet,
    styles,
    flushRaf: () => {
      const batch = frames.splice(0, frames.length);
      for (const callback of batch) {
        callback(0);
      }
    },
    restore: () => {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: previousDocument,
        });
      }
      if (previousRaf) {
        globalThis.requestAnimationFrame = previousRaf;
      } else {
        Reflect.deleteProperty(globalThis, "requestAnimationFrame");
      }
    },
  };
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("theme apply snap", () => {
  it("zeros transition duration on html.theme-changing in globals.css", () => {
    expect(globals).toContain(`html.${THEME_CHANGING_CLASS}`);
    expect(globals).toContain("transition-duration: 0s !important");
    expect(globals).toContain("transition-delay: 0s !important");
  });

  it("holds the snap class until the next paint after toggling dark", () => {
    const mock = installDocumentMock();
    restore = mock.restore;

    applyThemeClass({ enabled: true });

    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(true);
    expect(mock.classSet.has("dark")).toBe(true);

    mock.flushRaf();
    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(true);

    mock.flushRaf();
    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(false);
    expect(mock.classSet.has("dark")).toBe(true);
  });

  it("does not arm a snap when the dark class is already correct", () => {
    const mock = installDocumentMock();
    restore = mock.restore;
    mock.classSet.add("dark");

    applyThemeClass({ enabled: true });

    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(false);
  });

  it("keeps one snap window across a preset plus dark-class write", () => {
    const mock = installDocumentMock();
    restore = mock.restore;

    applyCustomTheme({ theme: sampleTheme });
    applyThemeClass({ enabled: true });

    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(true);
    expect(mock.styles.get("stave-custom-theme")?.textContent).toContain(
      "--background: #111111",
    );
    expect(mock.classSet.has("dark")).toBe(true);

    mock.flushRaf();
    mock.flushRaf();
    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(false);
  });

  it("snaps when clearing a custom theme", () => {
    const mock = installDocumentMock();
    restore = mock.restore;

    applyCustomTheme({ theme: sampleTheme });
    mock.flushRaf();
    mock.flushRaf();
    expect(mock.styles.has("stave-custom-theme")).toBe(true);

    applyCustomTheme({ theme: null });
    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(true);
    expect(mock.styles.has("stave-custom-theme")).toBe(false);

    mock.flushRaf();
    mock.flushRaf();
    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(false);
  });

  it("snaps manual token overrides", () => {
    const mock = installDocumentMock();
    restore = mock.restore;

    applyThemeOverrides({
      themeOverrides: {
        light: { background: "#ffffff" },
        dark: {},
      },
    });

    expect(mock.classSet.has(THEME_CHANGING_CLASS)).toBe(true);
    expect(mock.styles.get("stave-theme-overrides")?.textContent).toContain(
      "--background: #ffffff",
    );
  });
});
