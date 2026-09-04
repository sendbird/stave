import { SCRIPTS_CONFIG_FILENAME, STAVE_CONFIG_DIR } from "./constants";
import {
  appendServiceEntryToRawConfig,
  collectScriptIdsFromRaw,
  formatScriptConfigFile,
  slugifyScriptId,
} from "./editor";

export async function persistWorkspaceServiceQuickAdd(args: {
  workspacePath: string;
  label: string;
  command: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const readFile = window.api?.fs?.readFile;
  const writeFile = window.api?.fs?.writeFile;
  const createDirectory = window.api?.fs?.createDirectory;
  if (!readFile || !writeFile || !createDirectory) {
    return { ok: false, message: "Filesystem bridge unavailable" };
  }

  const filePath = `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`;
  const mkdir = await createDirectory({
    rootPath: args.workspacePath,
    directoryPath: STAVE_CONFIG_DIR,
  });
  if (!mkdir.ok && !mkdir.alreadyExists) {
    return {
      ok: false,
      message: mkdir.stderr ?? "Failed to prepare .stave directory",
    };
  }

  const commands = args.command
    .split("\n")
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length === 0) {
    return { ok: false, message: "Add at least one command." };
  }

  let raw: Record<string, unknown> | null = null;
  let revision: string | null = null;
  const read = await readFile({
    rootPath: args.workspacePath,
    filePath,
  });
  if (read.ok) {
    revision = read.revision;
    try {
      const parsed: unknown = JSON.parse(read.content);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return {
          ok: false,
          message: `Expected an object in ${filePath}.`,
        };
      }
      raw = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, message: `Invalid JSON in ${filePath}.` };
    }
  } else if (!read.stderr?.includes("ENOENT")) {
    return {
      ok: false,
      message: read.stderr ?? "Failed to read execution config.",
    };
  }

  const id = slugifyScriptId(
    args.label.trim() || commands[0] || "process",
    collectScriptIdsFromRaw(raw),
  );
  const next = appendServiceEntryToRawConfig({
    rawConfig: raw,
    id,
    label: args.label.trim() || id,
    commands,
  });
  const write = await writeFile({
    rootPath: args.workspacePath,
    filePath,
    content: formatScriptConfigFile(next),
    expectedRevision: revision,
  });
  if (!write.ok) {
    return {
      ok: false,
      message: write.conflict
        ? "Execution config changed on disk. Refresh and try again."
        : (write.stderr ?? "Failed to save execution config."),
    };
  }
  return { ok: true, id };
}
