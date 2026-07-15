/**
 * Serialize the cursor location after a terminal snapshot so a restore does
 * not depend on the relative cursor position left by xterm's serializer.
 */
export function appendAbsoluteCursorPosition(
  screenState: string,
  cursorX: number,
  cursorY: number,
) {
  if (!screenState || cursorX < 0 || cursorY < 0) {
    return screenState;
  }

  return `${screenState}\x1b[${cursorY + 1};${cursorX + 1}H`;
}
