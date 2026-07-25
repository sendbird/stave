import { describe, expect, test } from "bun:test";
import {
  formatLensNetworkBytes,
  formatLensNetworkStatus,
  isLensTextMimeType,
  MAX_LENS_NETWORK_BODY_BYTES,
  sanitizeLensNetworkBody,
  sanitizeLensNetworkHeaders,
  sanitizeLensNetworkUrl,
} from "@/lib/lens/lens-network";
import {
  LensLogClearArgsSchema,
  LensLogQueryArgsSchema,
} from "../electron/main/ipc/schemas";

describe("Lens network metadata", () => {
  test("preserves useful headers while redacting credentials", () => {
    expect(
      sanitizeLensNetworkHeaders({
        Accept: "application/json",
        Authorization: "Bearer secret",
        Cookie: ["session=secret"],
        "Set-Cookie": ["session=secret; Secure"],
        "X-Amz-Credential": "signed-secret",
        "X-CSRFToken": "csrf-secret",
        "X-Session-Id": "session-secret",
        "X-Request-Id": "request-1",
      }),
    ).toEqual({
      Accept: ["application/json"],
      Authorization: ["[redacted]"],
      Cookie: ["[redacted]"],
      "Set-Cookie": ["[redacted]"],
      "X-Amz-Credential": ["[redacted]"],
      "X-CSRFToken": ["[redacted]"],
      "X-Session-Id": ["[redacted]"],
      "X-Request-Id": ["request-1"],
    });
  });

  test("bounds header names, values, and the complete serialized block", () => {
    const sanitized = sanitizeLensNetworkHeaders(
      Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [
          `X-${"n".repeat(1_024)}-${index}`,
          Array.from({ length: 20 }, () => "v".repeat(4_096)),
        ]),
      ),
    );

    expect(sanitized).toBeDefined();
    expect(Buffer.byteLength(JSON.stringify(sanitized))).toBeLessThanOrEqual(
      64 * 1_024,
    );
    for (const [name, values] of Object.entries(sanitized ?? {})) {
      expect(Buffer.byteLength(name)).toBeLessThanOrEqual(256);
      expect(values.length).toBeLessThanOrEqual(10);
      for (const value of values) {
        expect(Buffer.byteLength(value)).toBeLessThanOrEqual(2_048);
      }
    }
  });

  test("redacts complete quoted plaintext values without leaking suffixes", () => {
    const result = sanitizeLensNetworkBody({
      content: `password="hello world" token: 'abc def' trailing=ok`,
      mimeType: "text/plain",
    });

    expect(result.content).toBe(
      `password="[redacted]" token: '[redacted]' trailing=ok`,
    );
    expect(result.redacted).toBe(true);
    expect(result.content).not.toContain("hello world");
    expect(result.content).not.toContain("abc def");
  });

  test("redacts OAuth query fields and never echoes invalid URL queries", () => {
    const sanitized = new URL(
      sanitizeLensNetworkUrl(
        "https://alice:pw@example.com/callback?token=fixture-token&code=fixture-code&state=fixture-state&X-Amz-Credential=fixture-credential&X-Amz-Signature=fixture-signature&view=network",
      ),
    );

    expect(decodeURIComponent(sanitized.username)).toBe("[redacted]");
    expect(decodeURIComponent(sanitized.password)).toBe("[redacted]");
    expect(sanitized.searchParams.get("token")).toBe("[redacted]");
    expect(sanitized.searchParams.get("code")).toBe("[redacted]");
    expect(sanitized.searchParams.get("state")).toBe("[redacted]");
    expect(sanitized.searchParams.get("X-Amz-Credential")).toBe("[redacted]");
    expect(sanitized.searchParams.get("X-Amz-Signature")).toBe("[redacted]");
    expect(sanitized.searchParams.get("view")).toBe("network");

    const invalid = sanitizeLensNetworkUrl(
      "not a url?token=fixture-token&code=fixture-code",
    );
    expect(invalid).not.toContain("fixture-token");
    expect(invalid).not.toContain("fixture-code");
  });

  test("propagates structured depth and item truncation", () => {
    const items = sanitizeLensNetworkBody({
      content: JSON.stringify(Array.from({ length: 101 }, (_, index) => index)),
      mimeType: "application/json",
    });
    const depth = sanitizeLensNetworkBody({
      content: JSON.stringify({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: {
                        level9: "bounded",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      mimeType: "application/json",
    });

    expect(items.content).toContain("[1 more items]");
    expect(items.truncated).toBe(true);
    expect(depth.content).toContain("[depth limit]");
    expect(depth.truncated).toBe(true);
  });

  test("treats missing and unknown MIME types as binary", () => {
    expect(isLensTextMimeType(undefined)).toBe(false);
    expect(isLensTextMimeType("application/octet-stream")).toBe(false);

    const result = sanitizeLensNetworkBody({
      content: "opaque payload",
      mimeType: undefined,
    });
    expect(result.kind).toBe("binary");
    expect(result.content).toBeUndefined();
    expect(result.capturedBytes).toBe(0);
  });

  test("caps UTF-8 input before structured parsing and caps final output", () => {
    const maxBytes = 96;
    const result = sanitizeLensNetworkBody({
      content: JSON.stringify({
        password: "fixture secret",
        payload: "한".repeat(MAX_LENS_NETWORK_BODY_BYTES),
      }),
      mimeType: "application/json",
      maxBytes,
    });

    expect(result.truncated).toBe(true);
    expect(result.redacted).toBe(true);
    expect(result.content).not.toContain("fixture secret");
    expect(Buffer.byteLength(result.content ?? "")).toBeLessThanOrEqual(
      maxBytes,
    );
    expect(result.capturedBytes).toBeLessThanOrEqual(maxBytes);
  });

  test("preserves upstream truncation metadata after a bounded decode", () => {
    const result = sanitizeLensNetworkBody({
      content: '{"result":"bounded preview"}',
      mimeType: "application/json",
      size: MAX_LENS_NETWORK_BODY_BYTES + 1,
      sourceTruncated: true,
    });

    expect(result.content).toContain("bounded preview");
    expect(result.truncated).toBe(true);
    expect(result.size).toBe(MAX_LENS_NETWORK_BODY_BYTES + 1);
  });

  test("validates bounded log query and clear arguments", () => {
    expect(
      LensLogQueryArgsSchema.parse({
        workspaceId: "workspace-1",
        lensSessionId: "default",
        limit: 200,
      }),
    ).toEqual({
      workspaceId: "workspace-1",
      lensSessionId: "default",
      limit: 200,
    });
    expect(
      LensLogClearArgsSchema.parse({
        workspaceId: "workspace-1",
        lensSessionId: "default",
      }),
    ).toEqual({
      workspaceId: "workspace-1",
      lensSessionId: "default",
    });
    expect(
      LensLogQueryArgsSchema.safeParse({
        workspaceId: "workspace-1",
        limit: 501,
      }).success,
    ).toBe(false);
  });

  test("formats zero-byte transfers and de-duplicates HTTP status lines", () => {
    expect(formatLensNetworkBytes(0)).toBe("0 B");
    expect(formatLensNetworkBytes(undefined)).toBe("-");
    expect(
      formatLensNetworkStatus({
        status: 200,
        statusText: "HTTP/1.1 200 OK",
      }),
    ).toBe("200 · OK");
    expect(formatLensNetworkStatus({ status: 204 })).toBe("204");
  });
});
