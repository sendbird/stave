import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from "lexical";

/**
 * The prompt composer handles plain Enter during React's capture phase.
 * Lexical's plain-text plugin does not honor `defaultPrevented` and would
 * otherwise insert a trailing line break after the prompt has been sent.
 */
export function registerPromptLexicalPreventedEnterCommand(
  editor: LexicalEditor,
) {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => event?.defaultPrevented === true,
    COMMAND_PRIORITY_CRITICAL,
  );
}
