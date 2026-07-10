import { describe, expect, test } from "bun:test";
import {
  COMMAND_PRIORITY_EDITOR,
  createEditor,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  registerPromptLexicalPreventedEnterCommand,
} from "@/components/ai-elements/prompt-lexical-editor.commands";

describe("prompt Lexical Enter handling", () => {
  test("consumes Enter after the prompt composer prevents it", () => {
    const editor = createEditor({ namespace: "prompt-enter-prevented" });
    let plainTextHandlerCalls = 0;
    const unregisterGuard =
      registerPromptLexicalPreventedEnterCommand(editor);
    const unregisterPlainTextHandler = editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        plainTextHandlerCalls += 1;
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    const handled = editor.dispatchCommand(KEY_ENTER_COMMAND, {
      defaultPrevented: true,
    } as KeyboardEvent);

    expect(handled).toBe(true);
    expect(plainTextHandlerCalls).toBe(0);
    unregisterPlainTextHandler();
    unregisterGuard();
  });

  test("leaves multiline Enter behavior to Lexical when it is not prevented", () => {
    const editor = createEditor({ namespace: "prompt-enter-multiline" });
    let plainTextHandlerCalls = 0;
    const unregisterGuard =
      registerPromptLexicalPreventedEnterCommand(editor);
    const unregisterPlainTextHandler = editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        plainTextHandlerCalls += 1;
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    const handled = editor.dispatchCommand(KEY_ENTER_COMMAND, {
      defaultPrevented: false,
    } as KeyboardEvent);

    expect(handled).toBe(true);
    expect(plainTextHandlerCalls).toBe(1);
    unregisterPlainTextHandler();
    unregisterGuard();
  });
});
