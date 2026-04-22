import { describe, expect, test } from "bun:test";
import {
  isInvalidCodePointError,
  isRecoverableGhosttyRuntimeError,
} from "../src/lib/terminal/ghostty-runtime-guards";
import {
  focusTerminalInstanceSurface,
  isSwallowableTerminalRuntimeError,
  restoreTerminalScreenState,
  restoreVisibleTerminalViewport,
} from "../src/components/layout/useTerminalInstance";

describe("focusTerminalInstanceSurface", () => {
  test("prefers the terminal focus API when it is available", () => {
    let terminalFocusReceiver: unknown = null;
    let textareaFocused = false;
    let activeElement: unknown = null;
    const container = {
      querySelector: () => ({
        focus: () => {
          textareaFocused = true;
          activeElement = "textarea";
        },
      }),
      contains: (target: unknown) => target === container,
      ownerDocument: {
        get activeElement() {
          return activeElement;
        },
      },
    };
    const terminal = {
      focus(this: unknown) {
        terminalFocusReceiver = this;
        activeElement = container;
      },
    };

    const didFocus = focusTerminalInstanceSurface({
      terminal,
      container,
    });

    expect(didFocus).toBe(true);
    expect(terminalFocusReceiver).toBe(terminal);
    expect(textareaFocused).toBe(false);
  });

  test("falls back to the hidden textarea when terminal focus does not land", () => {
    let textareaFocused = false;
    let activeElement: unknown = null;
    const textarea = {
      focus() {
        textareaFocused = true;
        activeElement = textarea;
      },
    };
    const container = {
      querySelector: () => textarea,
      contains: (target: unknown) => target === textarea || target === container,
      ownerDocument: {
        get activeElement() {
          return activeElement;
        },
      },
    };

    const didFocus = focusTerminalInstanceSurface({
      terminal: {
        focus() {
          activeElement = null;
        },
      },
      container,
    });

    expect(didFocus).toBe(true);
    expect(textareaFocused).toBe(true);
    expect(activeElement).toBe(textarea);
  });

  test("falls back to the container when textarea focus is unavailable", () => {
    let containerFocused = false;
    let activeElement: unknown = null;
    const container = {
      querySelector: () => null,
      focus: () => {
        containerFocused = true;
        activeElement = container;
      },
      contains: (target: unknown) => target === container,
      ownerDocument: {
        get activeElement() {
          return activeElement;
        },
      },
    };

    const didFocus = focusTerminalInstanceSurface({ container });

    expect(didFocus).toBe(true);
    expect(containerFocused).toBe(true);
  });

  test("returns false when there is no focusable target", () => {
    expect(focusTerminalInstanceSurface({ container: {} })).toBe(false);
  });
});

describe("isSwallowableTerminalRuntimeError", () => {
  test("matches Ghostty WASM out-of-bounds runtime failures", () => {
    expect(isSwallowableTerminalRuntimeError(
      new Error("RuntimeError: memory access out of bounds"),
    )).toBe(true);
  });

  test("matches invalid code point runtime failures", () => {
    expect(isSwallowableTerminalRuntimeError(
      new RangeError("Invalid code point 1776410"),
    )).toBe(true);
  });

  test("ignores unrelated failures", () => {
    expect(isSwallowableTerminalRuntimeError(new Error("boom"))).toBe(false);
    expect(isSwallowableTerminalRuntimeError("memory access out of bounds")).toBe(false);
  });
});

describe("ghostty runtime guards", () => {
  test("identifies invalid code point failures", () => {
    expect(isInvalidCodePointError(
      new RangeError("Invalid code point 1776410"),
    )).toBe(true);
    expect(isInvalidCodePointError(new Error("Invalid code point 1776410"))).toBe(false);
  });

  test("treats invalid code point and WASM faults as recoverable", () => {
    expect(isRecoverableGhosttyRuntimeError(
      new RangeError("Invalid code point 1776410"),
    )).toBe(true);
    expect(isRecoverableGhosttyRuntimeError(
      new Error("RuntimeError: memory access out of bounds"),
    )).toBe(true);
    expect(isRecoverableGhosttyRuntimeError(new Error("boom"))).toBe(false);
  });
});

describe("restoreVisibleTerminalViewport", () => {
  test("re-emits backend resize when hidden layout changes changed terminal geometry", async () => {
    const resizeCalls: Array<{ cols: number; rows: number }> = [];
    const backendResizeCalls: Array<{ cols: number; rows: number }> = [];
    const renderCalls: Array<{ viewportY: number }> = [];
    const terminal = {
      cols: 80,
      rows: 24,
      resize(cols: number, rows: number) {
        resizeCalls.push({ cols, rows });
      },
      getViewportY() {
        return 18;
      },
      renderer: {
        render(
          _wasmTerm: unknown,
          force: boolean,
          viewportY: number,
          receiver: unknown,
        ) {
          expect(force).toBe(true);
          expect(receiver).toBe(terminal);
          renderCalls.push({ viewportY });
        },
      },
      wasmTerm: { id: "wasm-term" },
    };

    await restoreVisibleTerminalViewport({
      terminal,
      proposed: { cols: 120, rows: 40 },
      notifyResize: (cols, rows) => {
        backendResizeCalls.push({ cols, rows });
      },
    });

    expect(resizeCalls).toEqual([]);
    expect(backendResizeCalls).toEqual([{ cols: 120, rows: 40 }]);
    expect(renderCalls).toEqual([]);
  });

  test("refreshes the canvas backing store when geometry is unchanged", async () => {
    const rendererResizeCalls: Array<{ cols: number; rows: number }> = [];
    const renderCalls: Array<{ viewportY: number }> = [];
    const terminal = {
      cols: 120,
      rows: 40,
      resize() {
        throw new Error("geometry should not be resized locally");
      },
      getViewportY() {
        return 18;
      },
      renderer: {
        resize(cols: number, rows: number) {
          rendererResizeCalls.push({ cols, rows });
        },
        render(
          _wasmTerm: unknown,
          force: boolean,
          viewportY: number,
          receiver: unknown,
        ) {
          expect(force).toBe(true);
          expect(receiver).toBe(terminal);
          renderCalls.push({ viewportY });
        },
      },
      wasmTerm: { id: "wasm-term" },
    };

    await restoreVisibleTerminalViewport({
      terminal,
      proposed: { cols: 120, rows: 40 },
    });

    expect(rendererResizeCalls).toEqual([{ cols: 120, rows: 40 }]);
    expect(renderCalls).toEqual([{ viewportY: 18 }]);
  });

  test("still repaints when a resize measurement is unavailable", async () => {
    let rendered = false;
    const terminal = {
      cols: 0,
      rows: 0,
      resize() {
        throw new Error("resize should not run without measured dimensions");
      },
      getViewportY() {
        return 4;
      },
      renderer: {
        render() {
          rendered = true;
        },
      },
      wasmTerm: { id: "wasm-term" },
    };

    await restoreVisibleTerminalViewport({ terminal });

    expect(rendered).toBe(true);
  });
});

describe("restoreTerminalScreenState", () => {
  test("resets the renderer before replaying a restored screen state", () => {
    const calls: string[] = [];
    const terminal = {
      reset() {
        calls.push("reset");
      },
      write(data: string) {
        calls.push(`write:${data}`);
      },
    };

    restoreTerminalScreenState({
      terminal,
      screenState: "prompt$ ls\r\n",
    });

    expect(calls).toEqual(["reset", "write:prompt$ ls\r\n"]);
  });

  test("still resets when the restored screen state is empty", () => {
    const calls: string[] = [];
    const terminal = {
      reset() {
        calls.push("reset");
      },
      write() {
        calls.push("write");
      },
    };

    restoreTerminalScreenState({
      terminal,
      screenState: "",
    });

    expect(calls).toEqual(["reset"]);
  });
});
