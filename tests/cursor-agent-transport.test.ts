import { describe, expect, test } from "bun:test";
import {
  CURSOR_AGENT_CAPACITY_MESSAGE,
  CURSOR_AGENT_PING_TIMEOUT_MESSAGE,
  CURSOR_AGENT_RETRIABLE_MESSAGE,
  CURSOR_AGENT_STREAM_CLOSED_MESSAGE,
  describeCursorAgentTransportFailure,
  inspectCursorAgentTransportFailure,
  isCursorAgentPingTimeout,
  isCursorAgentTransportRetryable,
  stripCursorAgentTextTransportEnvelope,
} from "../electron/providers/cursor/cursor-agent-transport";

describe("Cursor Agent transport classification", () => {
  test("reads RetriableError envelopes from stderr and last-line assistant text", () => {
    expect(
      inspectCursorAgentTransportFailure(
        "RetriableError: [unavailable] PING timed out",
      ),
    ).toEqual({
      kind: "stream_drop",
      message: CURSOR_AGENT_PING_TIMEOUT_MESSAGE,
    });
    expect(
      inspectCursorAgentTransportFailure(
        "progress\n\nError: RetriableError: [internal] Stream closed with error code NGHTTP2_INTERNAL_ERROR",
        "agent-text",
      ),
    ).toEqual({
      kind: "stream_drop",
      message: CURSOR_AGENT_STREAM_CLOSED_MESSAGE,
    });
    expect(
      inspectCursorAgentTransportFailure(
        "Error: RetriableError: [resource_exhausted] Error",
        "agent-text",
      ),
    ).toEqual({
      kind: "capacity",
      message: CURSOR_AGENT_CAPACITY_MESSAGE,
    });
    expect(
      describeCursorAgentTransportFailure(
        "RetriableError: [unavailable] something else",
      ),
    ).toBe(CURSOR_AGENT_RETRIABLE_MESSAGE);
  });

  test("does not treat a prose mention of PING as assistant-text transport failure", () => {
    expect(
      inspectCursorAgentTransportFailure(
        "The docs mention PING timed out as a keepalive drop.\nContinue the investigation.",
        "agent-text",
      ),
    ).toBeNull();
    expect(
      isCursorAgentPingTimeout("ACP process closed by Stave."),
    ).toBe(false);
  });

  test("strips a last-line envelope and leaves earlier assistant text", () => {
    expect(
      stripCursorAgentTextTransportEnvelope(
        "Wrote the first file.\n\nError: RetriableError: [unavailable] PING timed out",
      ),
    ).toBe("Wrote the first file.");
    expect(
      stripCursorAgentTextTransportEnvelope(
        "The docs mention PING timed out as a keepalive drop.\nContinue the investigation.",
      ),
    ).toBe(
      "The docs mention PING timed out as a keepalive drop.\nContinue the investigation.",
    );
  });

  test("retries stream drops and not capacity", () => {
    expect(
      isCursorAgentTransportRetryable(
        inspectCursorAgentTransportFailure(
          "RetriableError: [unavailable] PING timed out",
        ),
      ),
    ).toBe(true);
    expect(
      isCursorAgentTransportRetryable(
        inspectCursorAgentTransportFailure(
          "Error: RetriableError: [resource_exhausted] Error",
        ),
      ),
    ).toBe(false);
  });
});
