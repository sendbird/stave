import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale, getAppLocale, getIntlLocale, i18n, normalizeAppLocale } from "@/i18n";
import { formatNumber, formatRelativeTime } from "@/i18n/format";
import { resources } from "@/i18n/resources";

afterEach(() => {
  applyAppLocale("en");
});

describe("i18n runtime", () => {
  test("starts in English and resolves keys synchronously", () => {
    expect(getAppLocale()).toBe("en");
    expect(i18n.t("common:actions.save")).toBe("Save");
  });

  test("switches the display language and the Intl locale together", () => {
    applyAppLocale("ko");
    expect(getAppLocale()).toBe("ko");
    expect(getIntlLocale()).toBe("ko-KR");
    expect(i18n.t("common:actions.save")).toBe("저장");
    expect(i18n.t("common:counts.items", { count: 1 })).toBe("1개 항목");
    expect(formatRelativeTime(Date.now() - 3 * 60_000)).toBe("3분 전");
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  test("uses English plural forms in English", () => {
    expect(i18n.t("common:counts.items", { count: 1 })).toBe("1 item");
    expect(i18n.t("common:counts.items", { count: 2 })).toBe("2 items");
    expect(formatRelativeTime(Date.now() - 3 * 60_000)).toBe("3 minutes ago");
  });

  test("falls back to English for unsupported or legacy values", () => {
    expect(normalizeAppLocale("English")).toBe("en");
    expect(normalizeAppLocale(undefined)).toBe("en");
    expect(applyAppLocale("fr")).toBe("en");
  });

  test("bundles every namespace for every locale", () => {
    expect(Object.keys(resources.ko).sort()).toEqual(Object.keys(resources.en).sort());
  });
});
