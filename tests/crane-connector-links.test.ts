import { describe, expect, it } from "bun:test";
import {
  buildCraneConnectorSettingsUrl,
  STAVE_CRANE_CONNECTOR_GUIDE_URL,
} from "../src/lib/crane-connector/links";

describe("Crane connector links", () => {
  it("opens the routed Stave connector settings page", () => {
    expect(
      buildCraneConnectorSettingsUrl("https://atelier.example.com/"),
    ).toBe("https://atelier.example.com/apps/crane/settings/stave");
  });

  it("discards stale base URL paths, queries, and fragments", () => {
    expect(
      buildCraneConnectorSettingsUrl(
        "https://atelier.example.com/old?section=fields#settings",
      ),
    ).toBe("https://atelier.example.com/apps/crane/settings/stave");
  });

  it("keeps the setup guide on the public Stave repository", () => {
    expect(STAVE_CRANE_CONNECTOR_GUIDE_URL).toBe(
      "https://github.com/sendbird/stave/blob/main/docs/features/crane-connector.md",
    );
  });
});
