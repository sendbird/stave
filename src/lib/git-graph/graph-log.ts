import type { GraphCommit, GraphRef } from "./types";

const FIELD = "\x1f";

export function parseRefDecoration(decoration: string): GraphRef[] {
  const trimmed = decoration.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): GraphRef => {
      if (part.startsWith("tag:")) {
        return { type: "tag", name: part.slice(4).trim(), isHead: false };
      }
      if (part.startsWith("HEAD ->")) {
        return {
          type: "localBranch",
          name: part.slice("HEAD ->".length).trim(),
          isHead: true,
        };
      }
      if (part === "HEAD") {
        return { type: "head", name: "HEAD", isHead: true };
      }
      const isRemote = part.includes("/");
      return {
        type: isRemote ? "remoteBranch" : "localBranch",
        name: part,
        isHead: false,
      };
    });
}

export function parseGraphLog(stdout: string): GraphCommit[] {
  if (!stdout.trim()) {
    return [];
  }
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): GraphCommit => {
      const [hash = "", parents = "", author = "", authorDate = "", decoration = "", subject = ""] =
        line.split(FIELD);
      return {
        hash,
        parents: parents.split(" ").filter(Boolean),
        author,
        authorDate,
        subject,
        refs: parseRefDecoration(decoration),
      };
    });
}
