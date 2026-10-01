import { expect, test } from "bun:test";
import { CraneRepositoryMappingSchema } from "@/lib/crane-connector/types";

test("team memory saved with the retired advisor key still parses, without it", () => {
  for (const advisor of [null, { providerId: "codex", model: "gpt-5.6-sol" }]) {
    const parsed = CraneRepositoryMappingSchema.parse({
      craneTeamKey: "web",
      staveProjectPath: "/tmp/stave",
      runtime: { provider: "codex", model: "gpt-5.6", effort: "low", advisor },
    });
    expect(parsed.runtime).toEqual({ provider: "codex", model: "gpt-5.6", effort: "low" });
  }
});
