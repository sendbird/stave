import { describe, expect, test } from "bun:test";
import { sanitizeMcpLogValue } from "../electron/main/stave-mcp-log-sanitizer";

describe("sanitizeMcpLogValue", () => {
  test("redacts nested Lens saved-account passwords", () => {
    expect(
      sanitizeMcpLogValue({
        method: "tools/call",
        params: {
          name: "stave_lens_create_saved_account",
          arguments: {
            input: {
              hosts: ["example.com"],
              username: "person@example.com",
              password: "plain-secret-value",
              autoFill: true,
            },
          },
        },
      }),
    ).toEqual({
      method: "tools/call",
      params: {
        name: "stave_lens_create_saved_account",
        arguments: {
          input: {
            hosts: ["example.com"],
            username: "person@example.com",
            password: "[redacted]",
            autoFill: true,
          },
        },
      },
    });
  });
});
