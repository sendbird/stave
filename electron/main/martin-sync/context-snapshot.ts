import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const MARTIN_PROJECT_SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildMartinContextSnapshotRelativePath(
  slug: string,
): string {
  if (!MARTIN_PROJECT_SLUG_PATTERN.test(slug)) {
    throw new Error("invalid_martin_project_slug");
  }
  return path.posix.join(
    ".stave",
    "context",
    "martin",
    `${slug}.md`,
  );
}

export async function writeMartinContextSnapshot(args: {
  workspacePath: string;
  slug: string;
  markdown: string;
}): Promise<{ absolutePath: string; relativePath: string }> {
  const relativePath = buildMartinContextSnapshotRelativePath(args.slug);
  const absolutePath = path.resolve(
    args.workspacePath,
    ...relativePath.split("/"),
  );
  const directory = path.dirname(absolutePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, args.markdown, "utf8");
    await fs.rename(tempPath, absolutePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
  return { absolutePath, relativePath };
}
