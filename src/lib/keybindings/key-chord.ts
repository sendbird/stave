/**
 * Key strings used by the keybinding registry.
 *
 * A sequence is one or more steps separated by a space: `"mod+k b"` is
 * Cmd/Ctrl+K followed by B. A step is modifiers and one key joined by `+`:
 * `"mod+shift+t"`.
 *
 * Modifiers:
 * - `mod`: Cmd on macOS, Ctrl elsewhere. Matching accepts Ctrl or Cmd on every
 *   platform, the rule the app shell has always applied.
 * - `ctrl`: the Control key itself (Cmd must be up).
 * - `meta`: the Command key itself (Ctrl must be up). Used for macOS menu keys.
 * - `alt`, `shift`.
 * - A trailing `?` makes a modifier optional (`shift?`). A modifier that is not
 *   named must be up.
 *
 * Keys: `a`-`z`, `0`-`9`, a digit range (`1-9`, or `1-0` for the ten slots in
 * keyboard order), punctuation (`, . / \ \` [ ] - =`), `plus`, and the named
 * keys `enter`, `escape`, `tab`, `space`, `arrowup`, `arrowdown`, `arrowleft`,
 * `arrowright`, `f1`-`f12`.
 */

export type KeybindingPlatform = "mac" | "windows" | "linux";

export type ModifierRule = "required" | "forbidden" | "optional";

export interface KeyStep {
  key: string;
  ctrl: ModifierRule;
  meta: ModifierRule;
  alt: ModifierRule;
  shift: ModifierRule;
  /** Set by `mod`: Ctrl or Cmd must be down. */
  requireCtrlOrMeta: boolean;
}

export type KeySequence = readonly KeyStep[];

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface ModifierState {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

interface KeyMatcher {
  /** Lowercased `KeyboardEvent.key` values. */
  keys: readonly string[];
  /** `KeyboardEvent.code` values. */
  codes: readonly string[];
}

const NAMED_KEYS = new Set([
  "enter",
  "escape",
  "tab",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

/**
 * How each key token is recognized. Letters match on `key` only and `/` on
 * `code` only, exactly as the app shell matched them before the registry;
 * digits and the backslash accept either.
 */
const PUNCTUATION_MATCHERS: Record<string, KeyMatcher> = {
  ",": { keys: [","], codes: [] },
  ".": { keys: ["."], codes: ["Period"] },
  "/": { keys: [], codes: ["Slash"] },
  "\\": { keys: ["\\"], codes: ["Backslash"] },
  "`": { keys: ["`"], codes: ["Backquote"] },
  "[": { keys: ["["], codes: ["BracketLeft"] },
  "]": { keys: ["]"], codes: ["BracketRight"] },
  "-": { keys: ["-"], codes: ["Minus", "NumpadSubtract"] },
  "=": { keys: ["="], codes: ["Equal"] },
  plus: { keys: ["+", "="], codes: ["Equal", "NumpadAdd"] },
  space: { keys: [" "], codes: ["Space"] },
};

const DIGIT_RANGE = /^([0-9])-([0-9])$/;

/** Digits a range token covers, in keyboard order (`1-0` is 1..9 then 0). */
export function expandDigitRange(token: string): string[] | null {
  const match = DIGIT_RANGE.exec(token);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end === 0 && start > 0) {
    return [
      ...Array.from({ length: 10 - start }, (_, index) => String(start + index)),
      "0",
    ];
  }
  if (end < start) {
    return null;
  }
  return Array.from({ length: end - start + 1 }, (_, index) =>
    String(start + index),
  );
}

function resolveKeyMatcher(token: string): KeyMatcher | null {
  if (/^[a-z]$/.test(token)) {
    return { keys: [token], codes: [] };
  }
  if (/^[0-9]$/.test(token)) {
    return { keys: [token], codes: [`Digit${token}`] };
  }
  const digits = expandDigitRange(token);
  if (digits) {
    return {
      keys: digits,
      codes: digits.map((digit) => `Digit${digit}`),
    };
  }
  if (NAMED_KEYS.has(token)) {
    return { keys: [token], codes: [] };
  }
  return PUNCTUATION_MATCHERS[token] ?? null;
}

function applyModifier(step: KeyStep, token: string) {
  const optional = token.endsWith("?");
  const name = optional ? token.slice(0, -1) : token;
  const rule: ModifierRule = optional ? "optional" : "required";
  switch (name) {
    case "mod":
      step.ctrl = "optional";
      step.meta = "optional";
      step.requireCtrlOrMeta = !optional;
      return true;
    case "ctrl":
      step.ctrl = rule;
      return true;
    case "meta":
      step.meta = rule;
      return true;
    case "alt":
      step.alt = rule;
      return true;
    case "shift":
      step.shift = rule;
      return true;
    default:
      return false;
  }
}

/** Parse one step such as `"mod+shift+t"`. Throws on a malformed step. */
export function parseKeyStep(value: string): KeyStep {
  const tokens = value.trim().toLowerCase().split("+");
  const keyToken = tokens.pop() ?? "";
  const step: KeyStep = {
    key: keyToken,
    ctrl: "forbidden",
    meta: "forbidden",
    alt: "forbidden",
    shift: "forbidden",
    requireCtrlOrMeta: false,
  };
  for (const token of tokens) {
    if (!applyModifier(step, token)) {
      throw new Error(`Unknown modifier "${token}" in key step "${value}"`);
    }
  }
  if (!resolveKeyMatcher(keyToken)) {
    throw new Error(`Unknown key "${keyToken}" in key step "${value}"`);
  }
  return step;
}

/** Parse a sequence such as `"mod+k b"`. Throws on a malformed step. */
export function parseKeySequence(value: string): KeySequence {
  const steps = value.trim().split(/\s+/).filter(Boolean);
  if (steps.length === 0) {
    throw new Error("Empty key sequence");
  }
  return steps.map(parseKeyStep);
}

function ruleAllows(rule: ModifierRule, pressed: boolean) {
  return rule === "optional" || (rule === "required") === pressed;
}

export function matchesModifiers(step: KeyStep, state: ModifierState) {
  return (
    ruleAllows(step.ctrl, state.ctrl) &&
    ruleAllows(step.meta, state.meta) &&
    ruleAllows(step.alt, state.alt) &&
    ruleAllows(step.shift, state.shift) &&
    (!step.requireCtrlOrMeta || state.ctrl || state.meta)
  );
}

export function matchesKeyStep(step: KeyStep, event: KeyEventLike) {
  if (
    !matchesModifiers(step, {
      ctrl: Boolean(event.ctrlKey),
      meta: Boolean(event.metaKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
    })
  ) {
    return false;
  }
  const matcher = resolveKeyMatcher(step.key);
  if (!matcher) {
    return false;
  }
  return (
    matcher.keys.includes(event.key.toLowerCase()) ||
    (event.code !== undefined && matcher.codes.includes(event.code))
  );
}

const MODIFIER_STATES: readonly ModifierState[] = Array.from(
  { length: 16 },
  (_, bits) => ({
    ctrl: Boolean(bits & 1),
    meta: Boolean(bits & 2),
    alt: Boolean(bits & 4),
    shift: Boolean(bits & 8),
  }),
);

/** True when the two keys can be the same physical key press. */
export function keyTokensOverlap(left: string, right: string) {
  const a = resolveKeyMatcher(left);
  const b = resolveKeyMatcher(right);
  if (!a || !b) {
    return false;
  }
  return (
    a.keys.some((key) => b.keys.includes(key)) ||
    a.codes.some((code) => b.codes.includes(code))
  );
}

/** True when one key press could satisfy both steps. */
export function keyStepsOverlap(left: KeyStep, right: KeyStep) {
  if (!keyTokensOverlap(left.key, right.key)) {
    return false;
  }
  return MODIFIER_STATES.some(
    (state) => matchesModifiers(left, state) && matchesModifiers(right, state),
  );
}

/**
 * True when one sequence can fire while the other is being typed: the steps
 * they share overlap pairwise. A sequence that is a prefix of another counts,
 * since the shorter one would fire first.
 */
export function keySequencesOverlap(left: KeySequence, right: KeySequence) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (!keyStepsOverlap(left[index]!, right[index]!)) {
      return false;
    }
  }
  return length > 0;
}

// ── formatting ────────────────────────────────────────────────────────────

const MAC_MODIFIER_GLYPHS = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
} as const;

const KEY_LABELS: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  tab: "Tab",
  space: "␣",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  plus: "+",
};

function formatKeyToken(token: string) {
  return KEY_LABELS[token] ?? token.toUpperCase();
}

/**
 * The visible parts of one step, such as `["⌘", "⇧", "T"]` on macOS and
 * `["Ctrl", "Shift", "T"]` elsewhere. Optional modifiers are not shown.
 */
export function formatKeyStepParts(
  step: KeyStep,
  platform: KeybindingPlatform,
): string[] {
  const usesMod = step.requireCtrlOrMeta;
  const ctrl = !usesMod && step.ctrl === "required";
  const meta = !usesMod && step.meta === "required";
  const alt = step.alt === "required";
  const shift = step.shift === "required";
  const key = formatKeyToken(step.key);
  if (platform === "mac") {
    return [
      ...(ctrl ? [MAC_MODIFIER_GLYPHS.ctrl] : []),
      ...(alt ? [MAC_MODIFIER_GLYPHS.alt] : []),
      ...(shift ? [MAC_MODIFIER_GLYPHS.shift] : []),
      ...(usesMod || meta ? [MAC_MODIFIER_GLYPHS.meta] : []),
      key,
    ];
  }
  return [
    ...(usesMod || ctrl ? ["Ctrl"] : []),
    ...(meta ? ["Win"] : []),
    ...(alt ? ["Alt"] : []),
    ...(shift ? ["Shift"] : []),
    key,
  ];
}

/** One string per step of the sequence, parts joined with `+`. */
export function formatKeySequenceParts(
  sequence: KeySequence,
  platform: KeybindingPlatform,
): string[][] {
  return sequence.map((step) => formatKeyStepParts(step, platform));
}

const DOC_KEY_LABELS: Record<string, string> = {
  ...KEY_LABELS,
  // i18n-ignore: notation for the English Markdown docs and their test
  plus: "Plus",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

function formatDocKeyToken(token: string) {
  const digits = expandDigitRange(token);
  if (digits) {
    return token.replace("-", "..");
  }
  return DOC_KEY_LABELS[token] ?? token.toUpperCase();
}

/** Platform-neutral notation the user docs use, such as `Cmd/Ctrl+Shift+T`. */
export function formatKeyStepForDocs(step: KeyStep) {
  const parts = [
    ...(step.requireCtrlOrMeta ? ["Cmd/Ctrl"] : []),
    ...(!step.requireCtrlOrMeta && step.ctrl === "required" ? ["Ctrl"] : []),
    ...(!step.requireCtrlOrMeta && step.meta === "required" ? ["Cmd"] : []),
    ...(step.alt === "required" ? ["Alt"] : []),
    ...(step.shift === "required" ? ["Shift"] : []),
    formatDocKeyToken(step.key),
  ];
  return parts.join("+");
}

/** A whole sequence in doc notation: `` `Cmd/Ctrl+K` then `B` ``. */
export function formatKeySequenceForDocs(sequence: KeySequence) {
  return sequence
    .map((step) => {
      const text = formatKeyStepForDocs(step);
      // A backtick key needs a double-backtick code span.
      return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
    })
    .join(" then ");
}

/** Which platform the renderer runs on, for labels and per-platform keys. */
export function resolveKeybindingPlatform(source?: {
  electronPlatform?: string | null;
  navigatorPlatform?: string | null;
}): KeybindingPlatform {
  const electronPlatform =
    source?.electronPlatform ??
    (typeof window !== "undefined" ? window.api?.platform : undefined);
  if (electronPlatform === "darwin") return "mac";
  if (electronPlatform === "win32") return "windows";
  if (electronPlatform === "linux") return "linux";
  const navigatorPlatform =
    source?.navigatorPlatform ??
    (typeof navigator !== "undefined"
      ? navigator.platform || navigator.userAgent
      : "");
  if (/(Mac|iPhone|iPad)/i.test(navigatorPlatform)) return "mac";
  if (/Win/i.test(navigatorPlatform)) return "windows";
  return "linux";
}
