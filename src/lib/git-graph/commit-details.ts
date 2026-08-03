import type {
  GraphCommitDetails,
  GraphCommitSignature,
  GraphFileChange,
} from "./types";

type CommitMetadata = Omit<GraphCommitDetails, "files">;

interface NameStatusRecord {
  path: string;
  oldPath?: string;
  status: string;
}

interface NumstatRecord {
  path: string;
  oldPath?: string;
  additions: number | null;
  deletions: number | null;
}

const METADATA_FIELD_COUNT = 13;
const STATUS_TOKEN = /^([A-Z])(?:\d+)?$/;
const DECIMAL_COUNT = /^\d+$/;

function nulTerminatedFields(stdout: string) {
  const fields = stdout.split("\0");
  // The final segment is either empty or an incomplete tail, neither of which
  // is a field terminated by Git's `-z`/`%x00` output contract.
  fields.pop();
  return fields;
}

function stripTrailingLineBreaks(value: string) {
  return value.replace(/(?:\r\n|\r|\n)+$/u, "");
}

function signatureFromFields(
  status: string,
  key: string,
  signer: string,
): GraphCommitSignature | null {
  if (!status || status === "N") {
    return null;
  }
  return { status, key, signer };
}

export function parseGraphCommitMetadata(
  stdout: string,
): CommitMetadata | null {
  const fields = nulTerminatedFields(stdout);
  const hash = fields[0];
  if (fields.length !== METADATA_FIELD_COUNT || !hash) {
    return null;
  }

  const parentList = fields[1] ?? "";
  const subject = fields[2] ?? "";
  const body = fields[3] ?? "";
  const author = fields[4] ?? "";
  const authorEmail = fields[5] ?? "";
  const authorDate = fields[6] ?? "";
  const committer = fields[7] ?? "";
  const committerEmail = fields[8] ?? "";
  const committerDate = fields[9] ?? "";
  const signatureStatus = fields[10] ?? "";
  const signatureKey = fields[11] ?? "";
  const signatureSigner = fields[12] ?? "";

  return {
    hash,
    parents: parentList.split(/\s+/u).filter(Boolean),
    subject,
    body: stripTrailingLineBreaks(body),
    author,
    authorEmail,
    authorDate,
    committer,
    committerEmail,
    committerDate,
    signature: signatureFromFields(
      signatureStatus,
      signatureKey,
      signatureSigner,
    ),
  };
}

function decodeStatusToken(token: string) {
  return STATUS_TOKEN.exec(token)?.[1] ?? null;
}

export function parseGraphNameStatus(stdout: string): NameStatusRecord[] {
  const fields = nulTerminatedFields(stdout);
  const records: NameStatusRecord[] = [];
  let cursor = 0;

  while (cursor < fields.length) {
    const token = fields[cursor] ?? "";
    const status = decodeStatusToken(token);
    cursor += 1;
    if (!status) {
      if (token === "") {
        continue;
      }
      break;
    }

    if (status === "R" || status === "C") {
      const oldPath = fields[cursor];
      const path = fields[cursor + 1];
      if (!oldPath || !path) {
        break;
      }
      records.push({ path, oldPath, status });
      cursor += 2;
      continue;
    }

    const path = fields[cursor];
    if (!path) {
      break;
    }
    records.push({ path, status });
    cursor += 1;
  }

  return records;
}

function parseCount(value: string): number | null | undefined {
  if (value === "-") {
    return null;
  }
  if (!DECIMAL_COUNT.test(value)) {
    return undefined;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
}

function splitNumstatHeader(record: string) {
  const firstTab = record.indexOf("\t");
  const secondTab = record.indexOf("\t", firstTab + 1);
  if (firstTab < 0 || secondTab < 0) {
    return null;
  }
  return {
    additionsText: record.slice(0, firstTab),
    deletionsText: record.slice(firstTab + 1, secondTab),
    path: record.slice(secondTab + 1),
  };
}

export function parseGraphNumstat(stdout: string): NumstatRecord[] {
  const fields = nulTerminatedFields(stdout);
  const records: NumstatRecord[] = [];
  let cursor = 0;

  while (cursor < fields.length) {
    const header = splitNumstatHeader(fields[cursor] ?? "");
    cursor += 1;
    if (!header) {
      continue;
    }

    let path = header.path;
    let oldPath: string | undefined;
    if (!path) {
      // `--numstat -z` uses an empty pathname field as the marker for a
      // rename/copy, followed by its preimage and postimage paths.
      const renameSource = fields[cursor];
      const renameTarget = fields[cursor + 1];
      if (!renameSource || !renameTarget) {
        break;
      }
      oldPath = renameSource;
      path = renameTarget;
      cursor += 2;
    }

    const additions = parseCount(header.additionsText);
    const deletions = parseCount(header.deletionsText);
    if (additions === undefined || deletions === undefined) {
      continue;
    }

    const record: NumstatRecord = { path, additions, deletions };
    if (oldPath !== undefined) {
      record.oldPath = oldPath;
    }
    records.push(record);
  }

  return records;
}

function takeMatchingStats(
  candidates: NumstatRecord[] | undefined,
  oldPath: string | undefined,
) {
  if (!candidates?.length) {
    return undefined;
  }

  let matchIndex = candidates.findIndex(
    (candidate) => candidate.oldPath === oldPath,
  );
  if (matchIndex < 0 && oldPath !== undefined) {
    matchIndex = candidates.findIndex(
      (candidate) => candidate.oldPath === undefined,
    );
  }
  if (matchIndex < 0) {
    matchIndex = 0;
  }
  return candidates.splice(matchIndex, 1)[0];
}

export function mergeGraphFileChanges(args: {
  nameStatus: NameStatusRecord[];
  numstat: NumstatRecord[];
}): GraphFileChange[] {
  const statsByPath = new Map<string, NumstatRecord[]>();
  for (const stats of args.numstat) {
    const candidates = statsByPath.get(stats.path);
    if (candidates) {
      candidates.push(stats);
    } else {
      statsByPath.set(stats.path, [stats]);
    }
  }

  return args.nameStatus.map((change) => {
    const stats = takeMatchingStats(
      statsByPath.get(change.path),
      change.oldPath,
    );
    const file: GraphFileChange = {
      path: change.path,
      status: change.status,
      additions: stats?.additions ?? null,
      deletions: stats?.deletions ?? null,
    };
    if (change.oldPath !== undefined) {
      file.oldPath = change.oldPath;
    }
    return file;
  });
}

export function buildGraphCommitDetails(args: {
  metadataStdout: string;
  nameStatusStdout: string;
  numstatStdout: string;
}): GraphCommitDetails | null {
  const metadata = parseGraphCommitMetadata(args.metadataStdout);
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    files: mergeGraphFileChanges({
      nameStatus: parseGraphNameStatus(args.nameStatusStdout),
      numstat: parseGraphNumstat(args.numstatStdout),
    }),
  };
}
