import { describe, expect, test } from "bun:test";
import { sanitizeMcpLogValue } from "../electron/main/stave-mcp-log-sanitizer";

describe("sanitizeMcpLogValue", () => {
  test("redacts legacy model arguments and transport grant headers", () => {
    const result = sanitizeMcpLogValue({
      consultKey: "advisor-private",
      workerKey: "worker-private",
      headers: {
        "x-stave-advisor-key": "advisor-private",
        "x-stave-worker-key": "worker-private",
      },
      question: "Review the change",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).toMatchObject({
      question: "Review the change",
      consultKey: "[redacted]",
      workerKey: "[redacted]",
    });
  });
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
