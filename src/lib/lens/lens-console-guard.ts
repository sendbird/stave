export const LENS_PAGE_CONSOLE_RATE_LIMIT = 100;
export const LENS_PAGE_CONSOLE_RATE_WINDOW_MS = 1_000;
export const LENS_PAGE_CONSOLE_TOTAL_LIMIT = 50_000;

const GUARDED_CONSOLE_METHODS = [
  "assert",
  "count",
  "countReset",
  "debug",
  "dir",
  "dirxml",
  "error",
  "group",
  "groupCollapsed",
  "info",
  "log",
  "table",
  "timeEnd",
  "timeLog",
  "trace",
  "warn",
] as const;

interface LensConsoleGuardOptions {
  rateLimit?: number;
  windowMs?: number;
  totalLimit?: number;
}

/**
 * Runs in the guest page's main world before page scripts. Electron constructs
 * a native frame object before delivering `console-message`, so this guard must
 * suppress floods at the source rather than in the main-process listener.
 */
export function getLensConsoleGuardScript(
  options: LensConsoleGuardOptions = {},
): string {
  const rateLimit = options.rateLimit ?? LENS_PAGE_CONSOLE_RATE_LIMIT;
  const windowMs = options.windowMs ?? LENS_PAGE_CONSOLE_RATE_WINDOW_MS;
  const totalLimit = options.totalLimit ?? LENS_PAGE_CONSOLE_TOTAL_LIMIT;

  if (!Number.isInteger(rateLimit) || rateLimit <= 0) {
    throw new RangeError("Lens page console rate limit must be positive");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError("Lens page console rate window must be positive");
  }
  if (!Number.isInteger(totalLimit) || totalLimit < rateLimit) {
    throw new RangeError(
      "Lens page console total limit must cover at least one rate window",
    );
  }

  return `(() => {
    const target = globalThis.console;
    if (!target) return;
    const marker = Symbol.for("stave.lens.console-guard");
    if (target[marker]) return;
    Object.defineProperty(target, marker, { value: true });

    const methods = ${JSON.stringify(GUARDED_CONSOLE_METHODS)};
    const originals = new Map();
    for (const name of methods) {
      const original = target[name];
      if (typeof original === "function") originals.set(name, original);
    }

    let windowStartedAt = globalThis.Date.now();
    let acceptedInWindow = 0;
    let acceptedTotal = 0;
    let droppedInWindow = 0;
    let totalWarningEmitted = false;

    const emitWarning = (message) => {
      const warn = originals.get("warn") || originals.get("log");
      if (warn) Reflect.apply(warn, target, [message]);
    };

    const accept = () => {
      const now = globalThis.Date.now();
      if (now < windowStartedAt || now - windowStartedAt >= ${windowMs}) {
        if (droppedInWindow > 0) {
          emitWarning("Lens suppressed " + droppedInWindow + " excessive page console messages.");
        }
        windowStartedAt = now;
        acceptedInWindow = 0;
        droppedInWindow = 0;
      }
      if (acceptedTotal >= ${totalLimit}) {
        if (!totalWarningEmitted) {
          totalWarningEmitted = true;
          emitWarning("Lens stopped page console forwarding after ${totalLimit} messages in this document.");
        }
        return false;
      }
      if (acceptedInWindow >= ${rateLimit}) {
        droppedInWindow += 1;
        return false;
      }
      acceptedInWindow += 1;
      acceptedTotal += 1;
      return true;
    };

    for (const [name, original] of originals) {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      const wrapped = function (...args) {
        if (!accept()) return;
        return Reflect.apply(original, this, args);
      };
      try {
        Object.defineProperty(target, name, {
          ...descriptor,
          configurable: descriptor?.configurable ?? true,
          writable: descriptor?.writable ?? true,
          value: wrapped,
        });
      } catch {
        try { target[name] = wrapped; } catch {}
      }
    }
  })();`;
}
