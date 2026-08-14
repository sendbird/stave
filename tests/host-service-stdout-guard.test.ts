import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { claimHostServiceStdout } from "../electron/host-service/stdout-guard";
import {
  JsonMessageFrameDecoder,
  serializeJsonFramedMessage,
} from "../electron/shared/json-message-framing";

/**
 * The host-service protocol channel *is* stdout: the child writes
 * length-prefixed JSON frames there and the parent decodes them strictly. Any
 * other stdout write from that process lands between frames and the parent
 * dies with `invalid message frame header`.
 *
 * That is not hypothetical: turning on Provider Debug Logging made
 * `console.debug("[claude-sdk-runtime] stream_event", …)` fire on every
 * streaming delta, and each one killed the turn. These tests pin the guard that
 * makes the whole class of bug impossible instead of chasing individual call
 * sites.
 */

const repoRoot = path.resolve(import.meta.dir, "..");

function createFakeStream() {
  const chunks: string[] = [];
  return {
    chunks,
    stream: {
      write: (chunk: string | Uint8Array, ...rest: unknown[]) => {
        chunks.push(String(chunk));
        const callback = rest.find((value) => typeof value === "function");
        (callback as ((error?: Error | null) => void) | undefined)?.(null);
        return true;
      },
    },
  };
}

describe("host service stdout guard", () => {
  test("hands the framing layer a writer that still reaches real stdout", () => {
    const stdout = createFakeStream();
    const stderr = createFakeStream();

    const { writeFrame } = claimHostServiceStdout({
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    writeFrame("5\nhello");

    expect(stdout.chunks).toEqual(["5\nhello"]);
    expect(stderr.chunks).toEqual([]);
  });

  test("reroutes every other stdout write to stderr", () => {
    const stdout = createFakeStream();
    const stderr = createFakeStream();

    claimHostServiceStdout({ stdout: stdout.stream, stderr: stderr.stream });
    // Exactly what `console.debug` does once Provider Debug Logging is on.
    stdout.stream.write("[claude-sdk-runtime] stream_event {}\n");

    expect(stdout.chunks).toEqual([]);
    expect(stderr.chunks).toEqual(["[claude-sdk-runtime] stream_event {}\n"]);
  });

  test("forwards the completion callback so write accounting still settles", () => {
    const stdout = createFakeStream();
    const stderr = createFakeStream();

    claimHostServiceStdout({ stdout: stdout.stream, stderr: stderr.stream });
    let settled = false;
    stdout.stream.write("noise\n", () => {
      settled = true;
    });

    // `writeMessageNow` resolves on this callback; a swallowed one would stall
    // the outbound queue forever.
    expect(settled).toBe(true);
  });

  test("restores the original writer", () => {
    const stdout = createFakeStream();
    const stderr = createFakeStream();

    const { restore } = claimHostServiceStdout({
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    restore();
    stdout.stream.write("direct\n");

    expect(stdout.chunks).toEqual(["direct\n"]);
    expect(stderr.chunks).toEqual([]);
  });

  test("an unguarded log between frames is what breaks the parent decoder", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "host-service stdout",
      maxBufferBytes: 1_000_000,
      maxMessageBytes: 1_000_000,
    });
    const frame = serializeJsonFramedMessage({ type: "event" }).serialized;

    expect(decoder.append(frame)).toHaveLength(1);
    expect(() =>
      decoder.append("[claude-sdk-runtime] stream_event {}\n"),
    ).toThrow(/invalid message frame header/);
  });

  test("guarded, the same log never reaches the frame stream", () => {
    const decoder = new JsonMessageFrameDecoder({
      label: "host-service stdout",
      maxBufferBytes: 1_000_000,
      maxMessageBytes: 1_000_000,
    });
    const stdout = createFakeStream();
    const stderr = createFakeStream();
    const { writeFrame } = claimHostServiceStdout({
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    writeFrame(serializeJsonFramedMessage({ type: "event" }).serialized);
    stdout.stream.write("[claude-sdk-runtime] stream_event {}\n");
    writeFrame(serializeJsonFramedMessage({ type: "event" }).serialized);

    expect(() => {
      for (const chunk of stdout.chunks) {
        decoder.append(chunk);
      }
    }).not.toThrow();
  });

  test("host-service routes protocol frames only through the claimed writer", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "electron/host-service.ts"),
      "utf8",
    );

    expect(source).toContain("claimHostServiceStdout");
    // A direct `process.stdout.write` would bypass the guard and reintroduce
    // the interleaving it exists to prevent.
    expect(source).not.toContain("process.stdout.write");
  });
});
