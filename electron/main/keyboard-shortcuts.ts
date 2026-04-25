export type ShortcutInput = Pick<
  Electron.Input,
  "alt" | "code" | "control" | "key" | "meta" | "shift" | "type"
>;

function matchesPhysicalKey(
  input: ShortcutInput,
  expectedCode: string,
  expectedKey: string,
) {
  return (
    input.code === expectedCode ||
    input.key.toLowerCase() === expectedKey.toLowerCase()
  );
}

export function isDevToolsShortcut(input: ShortcutInput) {
  return (
    input.type === "keyDown" &&
    ((input.key === "F12" && !input.control && !input.meta && !input.shift && !input.alt) ||
      (input.shift &&
        !input.alt &&
        (input.control || input.meta) &&
        matchesPhysicalKey(input, "KeyI", "i")))
  );
}
