import { describe, expect, test } from "bun:test";

/**
 * These functions are tested in isolation by copying the implementation.
 * They're pure functions in electron/main/ipc/terminal.ts — we copy them
 * here because they're not exported (internal to the module).
 */

// --- createBufferedDataHandler (copied from terminal.ts) ---
function createBufferedDataHandler(onData: (data: string) => void) {
  let buffer = "";
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
  };
}

// --- createOscColorInterceptor (copied from terminal.ts) ---
function createOscColorInterceptor(args: {
  writeToPty: (data: string) => void;
  foreground: string;
  background: string;
}) {
  function hexToX11(hex: string): string {
    const h = hex.replace("#", "");
    const r = h.substring(0, 2);
    const g = h.substring(2, 4);
    const b = h.substring(4, 6);
    return `rgb:${r}/${g}/${b}`;
  }

  const fgX11 = hexToX11(args.foreground);
  const bgX11 = hexToX11(args.background);

  return (data: string): string => {
    return data.replace(
      /\x1b\](10|11);?\?(?:\x07|\x1b\\)/g,
      (_match, code: string) => {
        const color = code === "10" ? fgX11 : bgX11;
        args.writeToPty(`\x1b]${code};${color}\x1b\\`);
        return "";
      },
    );
  };
}

describe("createBufferedDataHandler", () => {
  test("passes through complete text", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("hello world");
    expect(chunks).toEqual(["hello world"]);
  });

  test("holds back lone ESC at end", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("text\x1b");
    expect(chunks).toEqual(["text"]);
    // Complete the sequence
    handler("[32m");
    expect(chunks).toEqual(["text", "\x1b[32m"]);
  });

  test("holds back partial CSI: ESC [", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("hello\x1b[");
    expect(chunks).toEqual(["hello"]);
    handler("0m");
    expect(chunks).toEqual(["hello", "\x1b[0m"]);
  });

  test("holds back partial CSI with parameters", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("text\x1b[0;3");
    expect(chunks).toEqual(["text"]);
    handler("2m");
    expect(chunks).toEqual(["text", "\x1b[0;32m"]);
  });

  test("holds back partial OSC sequence", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("before\x1b]10;?");
    expect(chunks).toEqual(["before"]);
    // Complete with BEL
    handler("\x07after");
    expect(chunks).toEqual(["before", "\x1b]10;?\x07after"]);
  });

  test("holds back partial OSC until ST terminator", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("text\x1b]11;?");
    expect(chunks).toEqual(["text"]);
    // Complete with ST (ESC \)
    handler("\x1b\\more");
    expect(chunks).toEqual(["text", "\x1b]11;?\x1b\\more"]);
  });

  test("passes through complete OSC with BEL", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("before\x1b]0;title\x07after");
    expect(chunks).toEqual(["before\x1b]0;title\x07after"]);
  });

  test("passes through complete OSC with ST", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("before\x1b]0;title\x1b\\after");
    expect(chunks).toEqual(["before\x1b]0;title\x1b\\after"]);
  });

  test("handles empty data gracefully", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("");
    expect(chunks).toEqual([]);
  });

  test("accumulates multiple partial sequences", () => {
    const chunks: string[] = [];
    const handler = createBufferedDataHandler((data) => chunks.push(data));
    handler("\x1b");
    expect(chunks).toEqual([]);
    handler("[");
    expect(chunks).toEqual([]);
    handler("32m");
    expect(chunks).toEqual(["\x1b[32m"]);
  });
});

describe("createOscColorInterceptor", () => {
  test("intercepts OSC 10 foreground query with BEL terminator", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#d4d4d4",
      background: "#1e1e1e",
    });

    const result = intercept("before\x1b]10;?\x07after");
    expect(result).toBe("beforeafter");
    expect(responses).toEqual(["\x1b]10;rgb:d4/d4/d4\x1b\\"]);
  });

  test("intercepts OSC 11 background query with BEL terminator", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#d4d4d4",
      background: "#1e1e1e",
    });

    const result = intercept("before\x1b]11;?\x07after");
    expect(result).toBe("beforeafter");
    expect(responses).toEqual(["\x1b]11;rgb:1e/1e/1e\x1b\\"]);
  });

  test("intercepts OSC query with ST terminator", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#ffffff",
      background: "#000000",
    });

    const result = intercept("\x1b]10;?\x1b\\");
    expect(result).toBe("");
    expect(responses).toEqual(["\x1b]10;rgb:ff/ff/ff\x1b\\"]);
  });

  test("passes through non-query data unchanged", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#d4d4d4",
      background: "#1e1e1e",
    });

    const result = intercept("normal text \x1b[32m green \x1b[0m");
    expect(result).toBe("normal text \x1b[32m green \x1b[0m");
    expect(responses).toEqual([]);
  });

  test("handles multiple queries in same chunk", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#aabbcc",
      background: "#112233",
    });

    const result = intercept("\x1b]10;?\x07\x1b]11;?\x07");
    expect(result).toBe("");
    expect(responses).toEqual([
      "\x1b]10;rgb:aa/bb/cc\x1b\\",
      "\x1b]11;rgb:11/22/33\x1b\\",
    ]);
  });

  test("returns empty string when entire chunk is a query", () => {
    const responses: string[] = [];
    const intercept = createOscColorInterceptor({
      writeToPty: (data) => responses.push(data),
      foreground: "#d4d4d4",
      background: "#1e1e1e",
    });

    const result = intercept("\x1b]10;?\x07");
    expect(result).toBe("");
    expect(responses.length).toBe(1);
  });
});
