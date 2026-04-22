import { describe, expect, test } from "bun:test";
import { RuntimeOptionsObjectSchema } from "../electron/main/ipc/schemas";
import {
  NORMALIZED_PROVIDER_EVENT_TYPES,
  PROVIDER_RUNTIME_OPTION_KEYS,
} from "@/lib/providers/runtime-option-contract";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";

function sortStrings(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("provider runtime contracts", () => {
  test("keeps runtime option keys aligned with the IPC schema", () => {
    expect(sortStrings(PROVIDER_RUNTIME_OPTION_KEYS)).toEqual(
      sortStrings(Object.keys(RuntimeOptionsObjectSchema.shape)),
    );
  });

  test("keeps normalized provider event discriminants aligned with the Zod schema", () => {
    expect(sortStrings(NORMALIZED_PROVIDER_EVENT_TYPES)).toEqual(
      sortStrings(NormalizedProviderEventSchema.options.map((option) => option.shape.type.value)),
    );
  });
});
