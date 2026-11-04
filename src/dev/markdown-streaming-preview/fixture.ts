/**
 * A long assistant reply with every block kind the transcript renders:
 * headings, prose with inline code and links, loose and nested lists, tables,
 * fenced code with blank lines inside, a quote and a rule. Shared by the
 * streaming preview and `scripts/measure-markdown-streaming.ts`.
 */
const SECTION = (index: number) => `## ${index}. Session restore after a crash

The restore path reads \`workspace_sessions\` before the renderer mounts, so a
crash between **write** and *commit* leaves the previous snapshot in place. See
[the persistence notes](https://example.com/docs/persistence) and
\`src/store/workspace-session-state.ts\` for the owner.

What changed:

- The snapshot is written to a temporary file first.

- The rename happens only after \`fsync\` returns.
  - On Windows the rename retries three times.
  - Other platforms rename once.

- A failed rename keeps the old snapshot and logs the error.

| Step | Before | After |
| --- | --- | ---: |
| Write | in place | temp file |
| Commit | none | rename |
| Restore | ${index * 12} ms | ${index * 9} ms |

\`\`\`ts
export async function writeSnapshot(path: string, data: string) {
  const temp = \`\${path}.tmp\`;
  await writeFile(temp, data);

  await fsyncFile(temp);
  await rename(temp, path);
}
\`\`\`

> The old snapshot stays readable until the rename succeeds, so a crash at
> any point restores a complete session.

1. Run \`bun test tests/workspace-session-state.test.ts\`.
2. Kill the app while it saves.
3. Reopen it and check the last task is still there.

---
`;

export const LONG_STREAMING_REPLY = [
  "# Restore and persistence review\n\nI checked every write path. Summary first, then details per area.\n",
  ...Array.from({ length: 8 }, (_, index) => SECTION(index + 1)),
  "That covers all eight areas. The remaining risk is the rename retry on network drives.",
].join("\n");

/** Split a reply into deltas of a few characters, like a provider stream. */
export function streamingDeltas(text: string, size = 12): string[] {
  const deltas: string[] = [];
  for (let start = 0; start < text.length; start += size) {
    deltas.push(text.slice(start, start + size));
  }
  return deltas;
}
