import { describe, expect, test } from "bun:test";
import {
  ensureUtf8Locale,
  hasUtf8Codeset,
} from "../electron/shared/utf8-locale";

describe("hasUtf8Codeset", () => {
  test("recognizes UTF-8 codesets case-insensitively", () => {
    expect(hasUtf8Codeset("en_US.UTF-8")).toBe(true);
    expect(hasUtf8Codeset("ko_KR.utf8")).toBe(true);
    expect(hasUtf8Codeset("C.UTF-8")).toBe(true);
  });

  test("rejects non-UTF-8 or missing codesets", () => {
    expect(hasUtf8Codeset("C")).toBe(false);
    expect(hasUtf8Codeset("POSIX")).toBe(false);
    expect(hasUtf8Codeset("en_US")).toBe(false);
    expect(hasUtf8Codeset("en_US.ISO8859-1")).toBe(false);
    expect(hasUtf8Codeset("")).toBe(false);
    expect(hasUtf8Codeset(undefined)).toBe(false);
  });
});

describe("ensureUtf8Locale", () => {
  test("forces a UTF-8 LANG when the env carries no locale (macOS GUI launch)", () => {
    const result = ensureUtf8Locale({ PATH: "/usr/bin" });
    expect(result.LANG).toBe("en_US.UTF-8");
    // Unrelated env is preserved.
    expect(result.PATH).toBe("/usr/bin");
  });

  test("upgrades an empty/C locale to UTF-8", () => {
    expect(ensureUtf8Locale({ LANG: "" }).LANG).toBe("en_US.UTF-8");
    expect(ensureUtf8Locale({ LANG: "C" }).LANG).toBe("en_US.UTF-8");
    expect(ensureUtf8Locale({ LANG: "POSIX" }).LANG).toBe("en_US.UTF-8");
  });

  test("leaves an already-UTF-8 locale untouched", () => {
    const env = { LANG: "ko_KR.UTF-8" };
    expect(ensureUtf8Locale(env)).toEqual({ LANG: "ko_KR.UTF-8" });

    const ctypeEnv = { LANG: "C", LC_CTYPE: "en_US.UTF-8" };
    expect(ensureUtf8Locale(ctypeEnv)).toEqual({
      LANG: "C",
      LC_CTYPE: "en_US.UTF-8",
    });
  });

  test("overrides LC_ALL when it forces a non-UTF-8 codeset", () => {
    const result = ensureUtf8Locale({ LC_ALL: "C", LANG: "ko_KR.UTF-8" });
    expect(result.LC_ALL).toBe("en_US.UTF-8");
  });

  test("aligns LC_CTYPE when it forces a non-UTF-8 codeset", () => {
    const result = ensureUtf8Locale({ LC_CTYPE: "C" });
    expect(result.LANG).toBe("en_US.UTF-8");
    expect(result.LC_CTYPE).toBe("en_US.UTF-8");
  });

  test("does not mutate the input env", () => {
    const env = { LANG: "" } as Record<string, string>;
    const result = ensureUtf8Locale(env);
    expect(env.LANG).toBe("");
    expect(result).not.toBe(env);
  });
});
