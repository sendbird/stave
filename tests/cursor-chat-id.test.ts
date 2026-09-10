import { describe, expect, test } from "bun:test";
import { parseCursorChatId } from "../electron/host-service/cursor-chat-id";

describe("parseCursorChatId", () => {
  test("reads the id the CLI prints", () => {
    expect(
      parseCursorChatId({
        stdout: "642d42d2-3017-4b86-988a-54a2317faeb9\n",
      }),
    ).toBe("642d42d2-3017-4b86-988a-54a2317faeb9");
  });

  test("ignores a leading update notice", () => {
    expect(
      parseCursorChatId({
        stdout:
          "A new version of Cursor Agent is available.\n642d42d2-3017-4b86-988a-54a2317faeb9\n",
      }),
    ).toBe("642d42d2-3017-4b86-988a-54a2317faeb9");
  });

  test("rejects output that is not an id", () => {
    expect(parseCursorChatId({ stdout: "" })).toBe("");
    expect(parseCursorChatId({ stdout: "Not logged in." })).toBe("");
    expect(parseCursorChatId({ stdout: "abc" })).toBe("");
  });
});
