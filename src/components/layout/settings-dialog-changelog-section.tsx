import changelogSource from "../../../CHANGELOG.md?raw";
import { ChangelogView } from "./settings-dialog-changelog-view";

/** Settings → Changelog, read from the repository's CHANGELOG.md at build time. */
export function ChangelogSection() {
  return <ChangelogView source={changelogSource} />;
}
