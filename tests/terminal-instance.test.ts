import { describe, expect, test } from "bun:test";
import {
  focusTerminalInstanceSurface,
  restoreTerminalScreenState,
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
