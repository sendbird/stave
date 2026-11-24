import { watch } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";

/**
 * The only file access the external-session watcher has. Read-only by
 * construction: there is no write, rename or delete here. Tests pass a
 * counting wrapper to prove that nothing is read while the feature is off.
 */
export interface ExternalSessionsFs {
  list(dir: string): Promise<string[]>;
  /** `null` when the path is gone or unreadable. */
  stat(file: string): Promise<{ mtimeMs: number; size: number; isDirectory: boolean } | null>;
  /** Up to `length` bytes from `start`; an empty buffer when unreadable. */
  readRange(file: string, start: number, length: number): Promise<Buffer>;
  /** Recursive change notifications; `null` when the platform or folder refuses. */
  watch(dir: string, onChange: (relativePath: string) => void): { close(): void } | null;
}

export const nodeExternalSessionsFs: ExternalSessionsFs = {
  async list(dir) {
    try {
      return await readdir(dir);
    } catch {
      return [];
    }
  },
  async stat(file) {
    try {
      const info = await stat(file);
      return { mtimeMs: info.mtimeMs, size: info.size, isDirectory: info.isDirectory() };
    } catch {
      return null;
    }
  },
  async readRange(file, start, length) {
    if (length <= 0) return Buffer.alloc(0);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(file, "r");
      const buffer = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const { bytesRead } = await handle.read(buffer, read, length - read, start + read);
        if (bytesRead <= 0) break;
        read += bytesRead;
      }
      return buffer.subarray(0, read);
    } catch {
      return Buffer.alloc(0);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  },
  watch(dir, onChange) {
    try {
      const watcher = watch(dir, { recursive: true, persistent: false }, (_event, name) => {
        if (name) onChange(String(name));
      });
      watcher.on("error", () => watcher.close());
      return watcher;
    } catch {
      return null;
    }
  },
};
