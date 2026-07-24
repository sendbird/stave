import { describe, expect, test } from "bun:test";
import {
  ensureUtf8Locale,
  hasUtf8Codeset,
  pickUtf8Locale,
} from "../electron/shared/utf8-locale";

// Locale sets as reported by `locale -a` on representative platforms. Entries
// without a UTF-8 codeset (`C`, `POSIX`, bare `UTF-8`) must be ignored.
const LINUX_LOCALES = ["C", "C.UTF-8", "POSIX", "en_US.UTF-8", "ko_KR.UTF-8"];
const MAC_LOCALES = ["C", "POSIX", "UTF-8", "en_US.UTF-8", "ko_KR.UTF-8"];
const KO_ONLY_LOCALES = ["C", "POSIX", "ko_KR.utf8"];

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
    expect(hasUtf8Codeset("UTF-8")).toBe(false);
    expect(hasUtf8Codeset("")).toBe(false);
    expect(hasUtf8Codeset(undefined)).toBe(false);
  });
});

describe("pickUtf8Locale", () => {
  test("prefers portable C.UTF-8 when no language hint and it is installed", () => {
    expect(pickUtf8Locale("C", LINUX_LOCALES)).toBe("C.UTF-8");
    expect(pickUtf8Locale("", LINUX_LOCALES)).toBe("C.UTF-8");
    expect(pickUtf8Locale(undefined, LINUX_LOCALES)).toBe("C.UTF-8");
    expect(pickUtf8Locale("POSIX", LINUX_LOCALES)).toBe("C.UTF-8");
  });

  test("falls back to en_US.UTF-8 when C.UTF-8 is absent (macOS)", () => {
    expect(pickUtf8Locale("C", MAC_LOCALES)).toBe("en_US.UTF-8");
  });

  test("preserves the language/region when a UTF-8 variant is installed", () => {
    expect(pickUtf8Locale("en_US", LINUX_LOCALES)).toBe("en_US.UTF-8");
    expect(pickUtf8Locale("ko_KR.ISO8859-1", MAC_LOCALES)).toBe("ko_KR.UTF-8");
  });

  test("ignores an uninstalled language and uses a neutral fallback", () => {
    expect(pickUtf8Locale("de_DE", LINUX_LOCALES)).toBe("C.UTF-8");
  });

  test("uses any installed UTF-8 locale when no preferred one exists", () => {
    expect(pickUtf8Locale("C", KO_ONLY_LOCALES)).toBe("ko_KR.utf8");
  });

  test("matches locale names case-insensitively", () => {
    expect(pickUtf8Locale("EN_us", ["en_US.utf8"])).toBe("en_US.utf8");
  });

  test("returns a last-resort UTF-8 locale when nothing is installed", () => {
    expect(pickUtf8Locale("C", [])).toBe("en_US.UTF-8");
  });
});

describe("ensureUtf8Locale", () => {
  test("forces a portable UTF-8 LANG when the env carries no locale (Linux)", () => {
    const result = ensureUtf8Locale({ PATH: "/usr/bin" }, LINUX_LOCALES);
    expect(result.LANG).toBe("C.UTF-8");
    // Unrelated env is preserved.
    expect(result.PATH).toBe("/usr/bin");
  });

  test("uses en_US.UTF-8 on systems without C.UTF-8 (macOS GUI launch)", () => {
    expect(ensureUtf8Locale({ PATH: "/usr/bin" }, MAC_LOCALES).LANG).toBe(
      "en_US.UTF-8",
    );
  });

  test("upgrades an empty/C/POSIX locale to an installed UTF-8 locale", () => {
    expect(ensureUtf8Locale({ LANG: "" }, LINUX_LOCALES).LANG).toBe("C.UTF-8");
    expect(ensureUtf8Locale({ LANG: "C" }, LINUX_LOCALES).LANG).toBe("C.UTF-8");
    expect(ensureUtf8Locale({ LANG: "POSIX" }, LINUX_LOCALES).LANG).toBe(
      "C.UTF-8",
    );
  });

  test("preserves the language when upgrading a codeset-less locale", () => {
    expect(ensureUtf8Locale({ LANG: "en_US" }, LINUX_LOCALES).LANG).toBe(
      "en_US.UTF-8",
    );
  });

  test("leaves an already-UTF-8 locale untouched", () => {
    const env = { LANG: "ko_KR.UTF-8" };
    expect(ensureUtf8Locale(env, LINUX_LOCALES)).toEqual({
      LANG: "ko_KR.UTF-8",
    });

    const ctypeEnv = { LANG: "C", LC_CTYPE: "en_US.UTF-8" };
    expect(ensureUtf8Locale(ctypeEnv, LINUX_LOCALES)).toEqual({
      LANG: "C",
      LC_CTYPE: "en_US.UTF-8",
    });
  });

  test("overrides LC_ALL when it forces a non-UTF-8 codeset", () => {
    const result = ensureUtf8Locale(
      { LC_ALL: "C", LANG: "ko_KR.UTF-8" },
      LINUX_LOCALES,
    );
    expect(result.LC_ALL).toBe("C.UTF-8");
  });

  test("aligns LC_CTYPE when it forces a non-UTF-8 codeset", () => {
    const result = ensureUtf8Locale({ LC_CTYPE: "C" }, LINUX_LOCALES);
    expect(result.LANG).toBe("C.UTF-8");
    expect(result.LC_CTYPE).toBe("C.UTF-8");
  });

  test("falls back to a last-resort UTF-8 locale when detection is empty", () => {
    expect(ensureUtf8Locale({ LANG: "C" }, []).LANG).toBe("en_US.UTF-8");
  });

  test("does not mutate the input env", () => {
    const env = { LANG: "" } as Record<string, string>;
    const result = ensureUtf8Locale(env, LINUX_LOCALES);
    expect(env.LANG).toBe("");
    expect(result).not.toBe(env);
  });
});
