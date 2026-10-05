import { i18n } from "@/i18n/runtime";
import { SCRIPTS_CONFIG_FILENAME, STAVE_CONFIG_DIR } from "./constants";
import {
  appendScriptEntryToRawConfig,
  collectScriptIdsFromRaw,
  formatScriptConfigFile,
  slugifyScriptId,
} from "./editor";
import type { ScriptKind } from "./types";

export async function persistWorkspaceServiceQuickAdd(args: {
  workspacePath: string;
  label: string;
  command: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  return persistWorkspaceScriptQuickAdd({ ...args, kind: "service" });
}

export async function persistWorkspaceScriptQuickAdd(args: {
  workspacePath: string;
  label: string;
  command: string;
  kind: ScriptKind;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const readFile = window.api?.fs?.readFile;
  const writeFile = window.api?.fs?.writeFile;
  const createDirectory = window.api?.fs?.createDirectory;
  if (!readFile || !writeFile || !createDirectory) {
    return { ok: false, message: i18n.t("scripts:quickAdd.filesystemBridgeUnavailable") };
  }

  const filePath = `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`;
  const mkdir = await createDirectory({
    rootPath: args.workspacePath,
    directoryPath: STAVE_CONFIG_DIR,
  });
  if (!mkdir.ok && !mkdir.alreadyExists) {
    return {
      ok: false,
      message: mkdir.stderr ?? i18n.t("scripts:quickAdd.failedToPrepareStaveDirectory"),
    };
  }

  const commands = args.command
    .split("\n")
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length === 0) {
    return { ok: false, message: i18n.t("scripts:quickAdd.addAtLeastOneCommand") };
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
          message: i18n.t("scripts:quickAdd.expectedAnObjectInValue", { filePath: filePath }),
        };
      }
      raw = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, message: i18n.t("scripts:quickAdd.invalidJsonInValue", { filePath: filePath }) };
    }
  } else if (!read.stderr?.includes("ENOENT")) {
    return {
      ok: false,
      message: read.stderr ?? i18n.t("scripts:quickAdd.failedToReadExecutionConfig"),
    };
  }

  const id = slugifyScriptId(
    args.label.trim() || commands[0] || "process",
    collectScriptIdsFromRaw(raw),
  );
  const block = args.kind === "service" ? "services" : "actions";
  if (raw?.[block] !== undefined && (
    !raw[block] || typeof raw[block] !== "object" || Array.isArray(raw[block])
  )) {
    return { ok: false, message: i18n.t("scripts:quickAdd.fixTheValueSectionInWorkspaceTools", { block: block }) };
  }
  const next = appendScriptEntryToRawConfig({
    rawConfig: raw,
    id,
    label: args.label.trim() || id,
    commands,
    kind: args.kind,
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
        ? i18n.t("scripts:quickAdd.executionConfigChangedOnDiskRefreshAnd")
        : (write.stderr ?? i18n.t("scripts:quickAdd.failedToSaveExecutionConfig")),
    };
  }
  return { ok: true, id };
}
