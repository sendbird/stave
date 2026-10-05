import { describe, expect, test } from "bun:test";
import { checkNamespace, needsTranslation } from "../scripts/i18n/catalog-check.mjs";

const terms = ["Stave", "Claude", "GitHub"];

function check(en: object, ko: object) {
  return checkNamespace({ namespace: "demo", sourceLocale: "en", catalogs: { en, ko }, terms });
}

describe("i18n catalog check", () => {
  test("accepts complete English and Korean catalogs with Korean plural forms", () => {
    const issues = check(
      {
        title: "Open in GitHub",
        greeting: "Hello {{name}}",
        files_one: "{{count}} file",
        files_other: "{{count}} files",
        rich: "Press <kbd>Enter</kbd> to send",
        brand: "Stave",
        acronym: "MCP",
      },
      {
        title: "GitHub에서 열기",
        greeting: "{{name}}님, 안녕하세요",
        files_other: "파일 {{count}}개",
        rich: "<kbd>Enter</kbd> 키를 눌러 보내기",
        brand: "Stave",
        acronym: "MCP",
      },
    );
    expect(issues).toEqual([]);
  });

  test("rejects missing, empty, untranslated and mismatched Korean entries", () => {
    const issues = check(
      {
        missing: "Save",
        empty: "Cancel",
        english: "Open settings",
        vars: "Hello {{name}}",
        tags: "Press <kbd>Enter</kbd>",
      },
      {
        empty: " ",
        english: "Open settings",
        vars: "안녕하세요 {{user}}",
        tags: "Enter 키를 누르세요",
        extra: "추가",
      },
    );
    const byKey = Object.fromEntries(issues.map((issue) => [issue.key, issue.message]));
    expect(byKey.missing).toBe("missing translation");
    expect(byKey.empty).toBe("empty translation");
    expect(byKey.english).toStartWith("not translated");
    expect(byKey.vars).toContain("interpolation mismatch");
    expect(byKey.tags).toContain("markup mismatch");
    expect(byKey.extra).toBe("not in the source locale");
  });

  test("requires each language's own plural categories", () => {
    const issues = check(
      { files_other: "{{count}} files" },
      { files_one: "파일 {{count}}개", files_other: "파일 {{count}}개" },
    );
    const messages = issues.map((issue) => `${issue.locale}:${issue.key}:${issue.message}`);
    expect(messages).toContain('en:files_one:missing plural form "one"');
    expect(messages).toContain('ko:files_one:plural form "one" is never used in ko');
  });

  test("rejects keys that are not lowerCamelCase", () => {
    const issues = check({ "Bad-Key": "Save" }, { "Bad-Key": "저장" });
    expect(issues.some((issue) => issue.message.includes("lowerCamelCase"))).toBe(true);
  });

  test("treats acronyms and allowlisted terms as already translated", () => {
    expect(needsTranslation("PR #{{number}}", terms)).toBe(false);
    expect(needsTranslation("Claude", terms)).toBe(false);
    expect(needsTranslation("Open Claude", terms)).toBe(true);
  });
});
