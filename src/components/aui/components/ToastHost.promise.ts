import type * as React from "react";

/**
 * A settled-toast message: a node, or a function of what the promise settled
 * with. The function form is the whole point — a toast that can only say
 * "Import finished" is barely worth the pixels, while one that says "Imported
 * 412 rows" or quotes the server's rejection reason is the result itself. The
 * value is passed rather than closed over so the message is written where the
 * call is, not stashed in a `let` above it.
 */
export type ToastPromiseMessage<Value> =
  | React.ReactNode
  | ((value: Value) => React.ReactNode);

export type ToastPromiseOptions<Value> = {
  /** Rendered on rejection, with the thrown value (typed `unknown`: a throw
   * is not required to be an `Error`, and pretending otherwise is how
   * `error.message` becomes `undefined` in a toast). */
  error: ToastPromiseMessage<unknown>;
  /** Rendered immediately and pinned (`timeout: 0`) until the promise settles. */
  loading: React.ReactNode;
  /** Rendered on fulfilment, with the resolved value. */
  success: ToastPromiseMessage<Value>;
};

/**
 * The `promise` half of `ToastApi`, declared beside its implementation;
 * `ToastHost.tsx` intersects it into the public handle. It is generic in the
 * promise's own value, so `success` is typed against what the caller actually
 * awaited instead of `unknown`.
 */
export type ToastPromiseApi = {
  promise: <Value>(
    promise: Promise<Value>,
    messages: ToastPromiseOptions<Value>,
  ) => Promise<Value>;
};

/**
 * The two primitives this borrows off `useToast()`'s handle, spelled out here
 * rather than `Pick`ed off `ToastApi`. A type-only import is erased at runtime,
 * but `scripts/check-source-structure.mjs` (and any tool that walks the module
 * graph rather than the emitted one) still counts it as a cycle, and this file
 * exists precisely so that `ToastHost.tsx` can depend on IT. Structural typing
 * means the real handle satisfies this without declaring that it does.
 */
type ToastPromiseHost = {
  loading: (title: React.ReactNode, description?: React.ReactNode) => string;
  update: (
    id: string,
    options: { title?: React.ReactNode; tone?: "danger" | "success" },
  ) => void;
};

/**
 * `React.ReactNode` cannot be a function — it is elements, strings, numbers,
 * iterables, booleans, `null`/`undefined` — so `typeof` is a total discriminant
 * between "a message" and "a message factory". No sentinel wrapper needed.
 */
function resolveMessage<Value>(
  message: ToastPromiseMessage<Value>,
  value: Value,
): React.ReactNode {
  return typeof message === "function"
    ? (message as (value: Value) => React.ReactNode)(value)
    : message;
}

/**
 * Run one async action through the toast lifecycle: a pinned loading toast that
 * is rewritten in place, on the SAME id, into the settled one. Every call site
 * was hand-rolling this try/catch/update dance, and each copy got a different
 * detail wrong — two stacked cards because the settled toast was `push`ed
 * instead of `update`d, a swallowed rejection because the `catch` never
 * re-threw, or a success toast that never went away.
 *
 * Two contracts make it safe to wrap anything:
 *
 * 1. **Transparent.** It returns the promise's own value and re-throws its own
 *    rejection, so dropping `toast.promise(...)` around an existing `await`
 *    changes nothing about the caller's control flow. The returned promise
 *    still rejects — it is the caller's, not ours, and swallowing it here would
 *    turn a failed action into a silent one.
 * 2. **The settled toast auto-closes.** The loading toast carries `timeout: 0`
 *    so in-flight work cannot silently vanish, and that pin would otherwise be
 *    inherited forever by the toast it becomes. `update` is deliberately given
 *    a `tone` and NO `timeout`: `toManagerOptions` reads a defined non-loading
 *    tone as "this toast is terminal" and writes the manager's normal delay
 *    back over the `0`. Passing an explicit `timeout` here would defeat that,
 *    and so would resolving with `title` alone.
 */
export async function runToastPromise<Value>(
  toast: ToastPromiseHost,
  promise: Promise<Value>,
  { error, loading, success }: ToastPromiseOptions<Value>,
): Promise<Value> {
  const id = toast.loading(loading);

  try {
    const value = await promise;

    toast.update(id, {
      title: resolveMessage(success, value),
      tone: "success",
    });

    return value;
  } catch (cause) {
    toast.update(id, { title: resolveMessage(error, cause), tone: "danger" });

    throw cause;
  }
}
