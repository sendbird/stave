/**
 * PTY byte-stream shaping: coalescing partial ANSI/OSC sequences before they
 * reach the headless mirror or renderer, and answering OSC 10/11 colour queries
 * locally so the shell does not block waiting on a reply.
 *
 * Extracted verbatim from `terminal-runtime.ts` to keep that file within the
 * max-lines ratchet; no behavior changed.
 */

export function createBufferedDataHandler(onData: (data: string) => void) {
  let buffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    flushTimer = null;
    if (buffer.length > 0) {
      onData(buffer);
      buffer = "";
    }
  }

  return (data: string) => {
    buffer += data;
    let sendUpTo = buffer.length;

    if (buffer.endsWith("\x1b")) {
      sendUpTo = buffer.length - 1;
    } else if (buffer.endsWith("\x1b[")) {
      sendUpTo = buffer.length - 2;
    } else {
      const csiTail = buffer.match(/\x1b\[[0-9;]*$/);
      if (csiTail) {
        sendUpTo = buffer.length - csiTail[0].length;
      }
    }

    if (sendUpTo === buffer.length) {
      const oscStart = buffer.lastIndexOf("\x1b]");
      if (oscStart >= 0) {
        const afterOsc = buffer.substring(oscStart);
        const hasTerminator =
          afterOsc.includes("\x07") || afterOsc.includes("\x1b\\");
        if (!hasTerminator) {
          sendUpTo = oscStart;
        }
      }
    }

    if (sendUpTo > 0) {
      onData(buffer.substring(0, sendUpTo));
      buffer = buffer.substring(sendUpTo);
    }

    // If incomplete sequence remains, schedule a flush timeout so it doesn't
    // block spinner/animation frames indefinitely.  xterm.js parsers on both
    // the headless mirror and the renderer handle partial sequences gracefully.
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (buffer.length > 0) {
      flushTimer = setTimeout(flush, 32);
    }
  };
}

export function createOscColorInterceptor(args: {
  writeToPty: (data: string) => void;
  foreground: string;
  background: string;
}) {
  function hexToX11(hex: string) {
    const value = hex.replace("#", "");
    return `rgb:${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4, 6)}`;
  }

  const foreground = hexToX11(args.foreground);
  const background = hexToX11(args.background);

  return (data: string) =>
    data.replace(
      /\x1b\](10|11);?\?(?:\x07|\x1b\\)/g,
      (_match, code: string) => {
        args.writeToPty(
          `\x1b]${code};${code === "10" ? foreground : background}\x1b\\`,
        );
        return "";
      },
    );
}
