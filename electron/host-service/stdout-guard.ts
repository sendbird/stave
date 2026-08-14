/**
 * The host-service protocol channel *is* stdout. `writeMessage` emits
 * length-prefixed JSON frames there, and the parent (`host-service-client`)
 * decodes them strictly: one stray byte between frames and
 * `JsonMessageFrameDecoder` throws `invalid message frame header`, which fails
 * the child and tears down every in-flight task.
 *
 * Node routes `console.log` / `console.info` / `console.debug` to that very
 * stream, so any diagnostic logging from anywhere in this process — provider
 * runtimes, a dependency, a third-party SDK — corrupts the channel. Enabling
 * Provider Debug Logging did exactly that: `[claude-sdk-runtime] stream_event`
 * fired on every streaming delta and killed the turn.
 *
 * Patching each call site would only hold until the next one is added, so the
 * channel is claimed instead: the framing layer keeps the real writer, and
 * every other stdout write is rerouted to stderr, which the parent already
 * treats as diagnostic-only (forwarded in dev, drained otherwise). Replacing
 * the `write` method rather than the `process.stdout` property is deliberate —
 * Node's global console resolves the stream lazily on each call, so it picks up
 * the guarded method automatically.
 *
 * That last point is why this only covers a Node runtime, which is exactly what
 * the host service is: `host-service-client` spawns it as
 * `process.execPath` + `ELECTRON_RUN_AS_NODE=1`. Some other runtimes (Bun, for
 * one) write console output straight to the file descriptor and would bypass
 * this entirely.
 */

type WriteCallback = (error?: Error | null) => void;

export type StdoutLikeStream = {
  write: (chunk: string | Uint8Array, ...rest: never[]) => boolean;
};

export type HostServiceStdoutClaim = {
  /** Writes straight to the real stdout. Reserved for protocol frames. */
  writeFrame: (chunk: string, callback?: WriteCallback) => boolean;
  /** Puts the original writer back. Exists for tests. */
  restore: () => void;
};

export function claimHostServiceStdout(
  streams: { stdout: StdoutLikeStream; stderr: StdoutLikeStream } = {
    stdout: process.stdout,
    stderr: process.stderr,
  },
): HostServiceStdoutClaim {
  const { stdout, stderr } = streams;
  const originalWrite = stdout.write.bind(stdout) as (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ) => boolean;
  const forwardToStderr = stderr.write.bind(stderr) as (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ) => boolean;

  stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) =>
    forwardToStderr(chunk, ...rest)) as StdoutLikeStream["write"];

  return {
    writeFrame: (chunk, callback) =>
      callback ? originalWrite(chunk, callback) : originalWrite(chunk),
    restore: () => {
      stdout.write = originalWrite as StdoutLikeStream["write"];
    },
  };
}
