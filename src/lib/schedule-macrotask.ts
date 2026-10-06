/**
 * Run `callback` in a fresh macrotask and return a function that cancels it.
 *
 * A posted message is not subject to the timer clamping and background-window
 * throttling that `setTimeout` gets, and it queues behind React's own
 * scheduler task (which also uses a posted message), so React can finish
 * pending work before the callback runs. Falls back to `setTimeout(0)` where
 * `MessageChannel` is unavailable.
 */
export function scheduleMacrotask(callback: () => void): () => void {
  if (typeof MessageChannel === "undefined") {
    const handle = setTimeout(callback, 0);
    return () => clearTimeout(handle);
  }

  const channel = new MessageChannel();
  let settled = false;
  const close = () => {
    settled = true;
    channel.port1.onmessage = null;
    channel.port1.close();
    channel.port2.close();
  };
  channel.port1.onmessage = () => {
    if (settled) {
      return;
    }
    close();
    callback();
  };
  channel.port2.postMessage(undefined);
  return () => {
    if (!settled) {
      close();
    }
  };
}
