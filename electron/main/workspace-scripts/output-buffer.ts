import { takeUtf8PrefixByBytes } from "../../shared/bounded-text";

export interface ScriptOutputBuffer {
  push(chunk: string): void;
  flush(): void;
}

const MAX_SCRIPT_OUTPUT_CHUNK_BYTES = 64 * 1024;

export function createScriptOutputBuffer(
  onFlush: (output: string) => void,
): ScriptOutputBuffer {
  let pending = "";
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    while (pending) {
      const { prefix, rest } = takeUtf8PrefixByBytes({
        value: pending,
        maxBytes: MAX_SCRIPT_OUTPUT_CHUNK_BYTES,
      });
      if (!prefix) {
        break;
      }
      pending = rest;
      onFlush(prefix);
    }
  };

  return {
    push(chunk: string) {
      if (!chunk) {
        return;
      }
      pending += chunk;
      if (!scheduled) {
        scheduled = true;
        setImmediate(flush);
      }
    },
    flush,
  };
}
