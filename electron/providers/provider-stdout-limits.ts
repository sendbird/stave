/**
 * Byte caps for newline-delimited JSON read from a provider subprocess's
 * stdout (Codex App Server JSON-RPC and ACP agents such as Cursor and Kiro).
 *
 * One line is one protocol message, so the line cap is the largest single
 * response or notification Stave accepts. A Codex `thread/read` with turns,
 * a `thread/fork` response, or an ACP update carrying images can legitimately
 * run past 32 MiB in a long session (a 37.7 MB response was observed).
 * 128 MiB leaves room for image-heavy histories while staying far below V8's
 * single-string ceiling (~512 Mi characters), which a line must fit in before
 * `JSON.parse`. A larger line is dropped without closing the process; see
 * `Utf8LineBuffer`.
 */
export const PROVIDER_STDOUT_LINE_MAX_BYTES = 128 * 1024 * 1024;

/** Pending-text cap; keeps headroom above one maximal line plus a chunk. */
export const PROVIDER_STDOUT_BUFFER_MAX_BYTES = 2 * PROVIDER_STDOUT_LINE_MAX_BYTES;
