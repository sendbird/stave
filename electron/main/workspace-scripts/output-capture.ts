import { byteLengthUtf8, takeUtf8PrefixByBytes } from "../../shared/bounded-text";

const LIMIT = 64 * 1024;
const TRUNCATED = "\n[Verification output truncated at 64 KiB. Inspect the full tool log.]";

/** Bound verification copies independently from the streamed tool log. */
export function createScriptOutputCapture() {
  let output = "";
  let remaining = LIMIT - byteLengthUtf8(TRUNCATED);
  let truncated = false;
  return {
    append(text: string) {
      if (!text) return;
      if (remaining <= 0) { truncated = true; return; }
      const { prefix, rest } = takeUtf8PrefixByBytes({ value: text, maxBytes: remaining });
      output += prefix;
      remaining -= byteLengthUtf8(prefix);
      if (rest) truncated = true;
    },
    read() { return output + (truncated ? TRUNCATED : ""); },
  };
}
