import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getProviderAccentColor,
  getProviderDescriptor,
  getProviderWaveTone,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import {
  findProviderIdentity,
  PROVIDER_IDENTITIES,
  providerInkColor,
} from "@/lib/providers/provider-identity";
import type { ProviderId } from "@/lib/providers/provider.types";
import { EXTENDED_THEME_TOKEN_NAMES } from "@/lib/themes/types";

const ROOT = path.resolve(import.meta.dir, "..");
const INK_STYLES = "src/components/system/provider-ink.styles.ts";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("provider identity", () => {
  test("every provider has one identity, and its ink is a theme token", () => {
    const ids = listProviderIds();
    expect(Object.keys(PROVIDER_IDENTITIES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const identity = PROVIDER_IDENTITIES[id];
      expect(identity.providerId).toBe(id);
      expect(identity.token).toBe(`provider-${identity.hue}`);
      expect(EXTENDED_THEME_TOKEN_NAMES as readonly string[]).toContain(identity.token);
      expect(identity.monogram.length).toBeGreaterThan(0);
    }
  });

  test("the model catalog reads names, marks and ink from the identity", () => {
    for (const id of listProviderIds()) {
      const identity = PROVIDER_IDENTITIES[id];
      const descriptor = getProviderDescriptor({ providerId: id });
      expect(descriptor.label).toBe(identity.label);
      expect(descriptor.shortLabel).toBe(identity.shortLabel);
      expect(descriptor.iconUrl).toBe(identity.markUrl);
      expect(descriptor.fallbackLabel).toBe(identity.monogram);
      expect(getProviderWaveTone({ providerId: id })).toBe(identity.hue);
      expect(getProviderAccentColor({ providerId: id })).toBe(`var(--${identity.token})`);
      expect(providerInkColor(id)).toBe(`var(--${identity.token})`);
    }
  });

  test("an id Stave does not know has no identity and takes the accent", () => {
    expect(findProviderIdentity("someone-else")).toBeNull();
    expect(findProviderIdentity(undefined)).toBeNull();
    expect(getProviderWaveTone({ providerId: "someone-else" as ProviderId })).toBe("accent");
    expect(providerInkColor("someone-else" as ProviderId)).toBe("var(--primary)");
  });

  test("the StyleX ink map paints each identity's token", () => {
    const source = readFileSync(path.join(ROOT, INK_STYLES), "utf8");
    for (const identity of Object.values(PROVIDER_IDENTITIES)) {
      expect(source).toContain(`${identity.hue}: { color: "var(--${identity.token})" }`);
    }
  });

  test("no other source file restates a provider color", () => {
    const providerColor = new RegExp(
      Object.values(PROVIDER_IDENTITIES)
        .map((identity) => `var\\(--${identity.token}\\)`)
        .join("|"),
    );
    // The registry builds the value and the ink map writes it out; nothing else may.
    const allowed = new Set([INK_STYLES, "src/lib/providers/provider-identity.ts"]);
    const offenders = listSourceFiles(path.join(ROOT, "src"))
      .map((file) => path.relative(ROOT, file))
      .filter((file) => !allowed.has(file))
      .filter((file) => providerColor.test(readFileSync(path.join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
