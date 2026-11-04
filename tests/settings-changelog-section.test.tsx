import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChangelogView,
  splitChangelog,
} from "@/components/layout/settings-dialog-changelog-view";

const SOURCE = [
  "## [0.30.0](https://github.com/sendbird/stave/compare/v0.29.2...v0.30.0) (2026-11-03)",
  "",
  "Latest release summary.",
  "",
  "### Changes",
  "",
  "- Latest change.",
  "",
  "```md",
  "## not a release",
  "### not demoted",
  "```",
  "",
  "## [0.29.2](https://github.com/sendbird/stave/compare/v0.29.1...v0.29.2) (2026-11-02)",
  "",
  "### Fixes",
  "",
  "- Older fix.",
].join("\n");

describe("splitChangelog", () => {
  const { preamble, releases } = splitChangelog(SOURCE);

  test("splits one entry per release heading with version and date", () => {
    expect(preamble).toBe("");
    expect(releases.map((release) => [release.version, release.date])).toEqual([
      ["0.30.0", "2026-11-03"],
      ["0.29.2", "2026-11-02"],
    ]);
  });

  test("demotes release sections below the release heading, but not inside code", () => {
    expect(releases[0]?.body).toContain("#### Changes");
    expect(releases[0]?.body).toContain("## not a release");
    expect(releases[0]?.body).toContain("### not demoted");
    expect(releases[1]?.body).toContain("#### Fixes");
  });

  test("keeps text before the first release as a preamble", () => {
    const result = splitChangelog(`# Changelog\n\nIntro.\n\n${SOURCE}`);
    expect(result.preamble).toBe("# Changelog\n\nIntro.");
    expect(result.releases).toHaveLength(2);
  });
});

describe("Settings → Changelog", () => {
  const html = renderToStaticMarkup(createElement(ChangelogView, { source: SOURCE }));

  test("opens the latest release and lists older ones collapsed", () => {
    expect(html).toContain("v0.30.0");
    expect(html).toContain("Latest change.");
    expect(html).toContain("0.29.2");
    // Older releases mount on first open, so their notes are not rendered yet.
    expect(html).not.toContain("Older fix.");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  });
});
