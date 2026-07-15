export const DEFAULT_TERMINAL_TRANSCRIPT_MAX_CHARS = 2_000_000;

/** A bounded chunk buffer that avoids repeated whole-string concatenation. */
export class TerminalTranscriptBuffer {
  private readonly chunks: string[] = [];
  private length = 0;

  constructor(
    private readonly maxChars = DEFAULT_TERMINAL_TRANSCRIPT_MAX_CHARS,
    initialValue = "",
  ) {
    this.append(initialValue);
  }

  append(value: string) {
    if (!value || this.maxChars <= 0) {
      return;
    }

    const next =
      value.length > this.maxChars ? value.slice(-this.maxChars) : value;
    this.chunks.push(next);
    this.length += next.length;

    while (this.length > this.maxChars && this.chunks.length > 0) {
      const first = this.chunks[0];
      if (!first) {
        break;
      }
      const remove = Math.min(first.length, this.length - this.maxChars);
      if (remove === first.length) {
        this.chunks.shift();
      } else {
        this.chunks[0] = first.slice(remove);
      }
      this.length -= remove;
    }
  }

  clear() {
    this.chunks.length = 0;
    this.length = 0;
  }

  toString() {
    return this.chunks.join("");
  }

  get size() {
    return this.length;
  }
}

export function createTerminalTranscriptBuffer(
  value = "",
  maxChars = DEFAULT_TERMINAL_TRANSCRIPT_MAX_CHARS,
) {
  return new TerminalTranscriptBuffer(maxChars, value);
}
