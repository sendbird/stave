import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ProviderAccountProviderId } from "../../src/lib/providers/provider-accounts";
import type {
  ProviderAccountSetupEntryState,
  ProviderAccountSetupState,
} from "../../src/lib/providers/provider-account-setup";
import { sharedSetupEntries, type SetupSharingEntry } from "../../src/lib/providers/provider-account-setup-plan";

/**
 * Executes the sharing plan in `provider-account-setup-plan.ts` for one managed
 * account: links what stays in sync, writes a filtered copy of what cannot be
 * linked, and records what it added so turning sharing off removes exactly
 * that and nothing the account owns.
 *
 * It never opens a credential file. The plan names no login or history entry
 * (the planner refuses one), and the only file whose contents are read is the
 * System default `settings.json`, which is filtered before it is written.
 */

const LEDGER_NAME = ".stave-shared-setup.json";

interface Ledger {
  version: 1;
  sharedFrom: string;
  /** Entry name to the link target Stave created. */
  links: Record<string, string>;
  /** Entry name to the sha256 of the copy Stave last wrote. */
  copies: Record<string, string>;
}

/** Top-level settings keys that name a credential or a login rule. */
const PRIVATE_SETTINGS_KEYS = new Set([
  "apiKeyHelper",
  "awsAuthRefresh",
  "awsCredentialExport",
  "otelHeadersHelper",
  "forceLoginMethod",
  "forceLoginOrgUUID",
  "oauthAccount",
  "primaryApiKey",
  "apiKey",
]);

/**
 * `env` entries that carry a credential or pick an endpoint or cloud login.
 * The account's own sign-in must answer for the account, so a shared
 * `ANTHROPIC_*` value would defeat the point of a separate account.
 */
const PRIVATE_ENV_NAME =
  /^(ANTHROPIC_|AWS_|AZURE_|CLOUD_ML_|VERTEX_|CLAUDE_CODE_OAUTH|CLAUDE_CODE_USE_|GOOGLE_APPLICATION_CREDENTIALS$)|KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|BEARER/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The part of Claude's `settings.json` an account may share. */
export function filterClaudeSettings(source: Record<string, unknown>): Record<string, unknown> {
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (PRIVATE_SETTINGS_KEYS.has(key)) continue;
    if (key === "env") {
      if (!isRecord(value)) continue;
      const env = Object.fromEntries(Object.entries(value).filter(([name]) => !PRIVATE_ENV_NAME.test(name)));
      if (Object.keys(env).length > 0) shared.env = env;
      continue;
    }
    shared[key] = value;
  }
  return shared;
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function lstatOrNull(target: string) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

function realpathOrNull(target: string) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function readTextOrNull(target: string) {
  try {
    return fs.readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

function readLedger(profileDir: string): Ledger | null {
  const text = readTextOrNull(path.join(profileDir, LEDGER_NAME));
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.links) || !isRecord(parsed.copies)) return null;
    const strings = (record: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return {
      version: 1,
      sharedFrom: typeof parsed.sharedFrom === "string" ? parsed.sharedFrom : "",
      links: strings(parsed.links),
      copies: strings(parsed.copies),
    };
  } catch {
    return null;
  }
}

function writeFileAtomic(target: string, content: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      /* A successful rename consumed the temporary file. */
    }
  }
}

/** The System default entry, resolved to its real path, when it exists with the expected shape. */
function resolveSource(sourceDir: string, entry: SetupSharingEntry) {
  const real = realpathOrNull(path.join(sourceDir, entry.name));
  if (!real) return null;
  try {
    const stat = fs.statSync(real);
    return (entry.kind === "directory" ? stat.isDirectory() : stat.isFile()) ? real : null;
  } catch {
    return null;
  }
}

function assertSeparate(sourceDir: string, profileDir: string) {
  const canonical = (directory: string) => realpathOrNull(directory) ?? path.resolve(directory);
  if (canonical(sourceDir) === canonical(profileDir))
    throw new Error("This account uses the System default folder, so there is nothing to share.");
  const stat = lstatOrNull(profileDir);
  if (!stat?.isDirectory()) throw new Error("The account folder does not exist.");
}

function linkEntry(source: string, target: string, entry: SetupSharingEntry, ledger: Ledger): ProviderAccountSetupEntryState {
  const existing = lstatOrNull(target);
  if (existing?.isSymbolicLink()) {
    const current = fs.readlinkSync(target);
    // A link already in place counts as shared. Only a link Stave created is in the ledger, so only it is removed later.
    if (realpathOrNull(target) === source) return "shared";
    // A dangling link Stave made earlier is debris; a link anyone else aimed elsewhere is theirs.
    if (realpathOrNull(target) !== null || ledger.links[entry.name] !== current) return "kept";
    fs.unlinkSync(target);
  } else if (existing) {
    // An empty folder the CLI created is free to replace; anything else belongs to the account.
    if (entry.kind === "directory" && existing.isDirectory() && fs.readdirSync(target).length === 0) fs.rmdirSync(target);
    else return "kept";
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.symlinkSync(source, target, entry.kind === "directory" ? (process.platform === "win32" ? "junction" : "dir") : "file");
  ledger.links[entry.name] = source;
  return "shared";
}

function copySettingsEntry(source: string, target: string, entry: SetupSharingEntry, ledger: Ledger): ProviderAccountSetupEntryState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(source, "utf8"));
  } catch {
    return "failed";
  }
  if (!isRecord(parsed)) return "failed";
  const content = `${JSON.stringify(filterClaudeSettings(parsed), null, 2)}\n`;
  const hash = sha256(content);
  const existing = lstatOrNull(target);
  if (existing && !existing.isFile()) return "kept";
  const current = existing ? readTextOrNull(target) : null;
  if (existing && current === null) return "kept";
  if (current !== null) {
    const currentHash = sha256(current);
    if (currentHash === hash) {
      ledger.copies[entry.name] = hash;
      return "shared";
    }
    // Overwrite only a copy Stave wrote and nobody has edited since.
    if (ledger.copies[entry.name] !== currentHash) return "kept";
  }
  writeFileAtomic(target, content);
  ledger.copies[entry.name] = hash;
  return "shared";
}

function entryState(
  entry: SetupSharingEntry,
  source: string | null,
  target: string,
  ledger: Ledger | null,
): ProviderAccountSetupEntryState {
  if (!source) return "missing";
  const existing = lstatOrNull(target);
  if (!existing) return "not-shared";
  if (entry.action === "link") return existing.isSymbolicLink() && realpathOrNull(target) === source ? "shared" : "kept";
  const recorded = ledger?.copies[entry.name];
  const current = existing.isFile() ? readTextOrNull(target) : null;
  return recorded !== undefined && current !== null && sha256(current) === recorded ? "shared" : "kept";
}

function describe(
  providerId: ProviderAccountProviderId,
  sourceDir: string,
  profileDir: string,
  outcomes?: Map<string, ProviderAccountSetupEntryState>,
): ProviderAccountSetupState {
  const ledger = readLedger(profileDir);
  return {
    enabled: ledger !== null,
    entries: sharedSetupEntries(providerId).map((entry) => ({
      name: entry.name,
      label: entry.label,
      action: entry.action as "link" | "copy",
      state:
        outcomes?.get(entry.name) ??
        entryState(entry, resolveSource(sourceDir, entry), path.join(profileDir, entry.name), ledger),
    })),
  };
}

export interface SetupSharingTarget {
  providerId: ProviderAccountProviderId;
  /** System default's configuration folder. */
  sourceDir: string;
  /** The managed account's configuration folder. */
  profileDir: string;
}

/** What the account shares now. Reads folder entries and the ledger; writes nothing. */
export function readSetupSharing(target: SetupSharingTarget): ProviderAccountSetupState {
  return describe(target.providerId, target.sourceDir, target.profileDir);
}

/**
 * Link or copy System default's setup into the account. Safe to repeat: an
 * entry the account already has stays as it is, and a copied settings file is
 * refreshed only while it still matches what Stave wrote.
 */
export function applySetupSharing(target: SetupSharingTarget): ProviderAccountSetupState {
  assertSeparate(target.sourceDir, target.profileDir);
  const ledger: Ledger = readLedger(target.profileDir) ?? {
    version: 1,
    sharedFrom: target.sourceDir,
    links: {},
    copies: {},
  };
  const outcomes = new Map<string, ProviderAccountSetupEntryState>();
  for (const entry of sharedSetupEntries(target.providerId)) {
    const source = resolveSource(target.sourceDir, entry);
    if (!source) {
      outcomes.set(entry.name, "missing");
      continue;
    }
    const destination = path.join(target.profileDir, entry.name);
    try {
      outcomes.set(
        entry.name,
        entry.action === "link"
          ? linkEntry(source, destination, entry, ledger)
          : copySettingsEntry(source, destination, entry, ledger),
      );
    } catch {
      outcomes.set(entry.name, "failed");
    }
  }
  ledger.sharedFrom = target.sourceDir;
  writeFileAtomic(path.join(target.profileDir, LEDGER_NAME), JSON.stringify(ledger));
  return describe(target.providerId, target.sourceDir, target.profileDir, outcomes);
}

/**
 * Stop sharing. Removes the links Stave created and a copied settings file that
 * still matches what Stave wrote, then forgets the record. Folders, files and
 * links the account owns, and everything inside System default, stay.
 */
export function removeSetupSharing(target: SetupSharingTarget): ProviderAccountSetupState {
  assertSeparate(target.sourceDir, target.profileDir);
  const ledger = readLedger(target.profileDir);
  if (ledger) {
    for (const entry of sharedSetupEntries(target.providerId)) {
      const destination = path.join(target.profileDir, entry.name);
      const stat = lstatOrNull(destination);
      if (!stat) continue;
      try {
        const linked = ledger.links[entry.name];
        const copied = ledger.copies[entry.name];
        if (linked !== undefined && stat.isSymbolicLink() && fs.readlinkSync(destination) === linked) fs.unlinkSync(destination);
        else if (copied !== undefined && stat.isFile() && sha256(fs.readFileSync(destination, "utf8")) === copied)
          fs.unlinkSync(destination);
      } catch {
        /* Leave anything that cannot be removed in place. */
      }
    }
    try {
      fs.unlinkSync(path.join(target.profileDir, LEDGER_NAME));
    } catch {
      /* Already gone. */
    }
  }
  return describe(target.providerId, target.sourceDir, target.profileDir);
}
