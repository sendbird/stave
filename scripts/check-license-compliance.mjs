import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const policyPath = path.join(root, "config/license-compliance.json");
const policy = JSON.parse(await readFile(policyPath, "utf8"));
const checkerPackagePath = path.join(
  root,
  "node_modules/license-checker/package.json",
);
const checkerPackage = JSON.parse(
  await readFile(checkerPackagePath, "utf8"),
);
const checkerBin =
  typeof checkerPackage.bin === "string"
    ? checkerPackage.bin
    : checkerPackage.bin?.["license-checker"];

if (!checkerBin) {
  console.error("License compliance failed: license-checker has no executable.");
  process.exit(1);
}

const checkerPath = path.resolve(
  path.dirname(checkerPackagePath),
  checkerBin,
);
const checker = spawnSync(
  process.execPath,
  [checkerPath, "--production", "--excludePrivatePackages", "--json"],
  {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (checker.error || checker.status !== 0) {
  console.error("License compliance failed: license-checker could not run.");
  if (checker.error) console.error(`- ${checker.error.message}`);
  if (checker.stderr?.trim()) console.error(checker.stderr.trim());
  process.exit(1);
}

let report;
try {
  report = JSON.parse(checker.stdout);
} catch (error) {
  console.error("License compliance failed: license-checker returned invalid JSON.");
  if (error instanceof Error) console.error(`- ${error.message}`);
  process.exit(1);
}

const allowedLicenseAtoms = new Set(policy.allowedLicenseAtoms ?? []);
const obligationLicenseAtoms = new Set(
  policy.obligationLicenseAtoms ?? [],
);
const failures = [];
const obligations = [];
const exceptions = [];

function parsePackageRef(packageRef) {
  const separator = packageRef.lastIndexOf("@");
  if (separator <= 0) return { name: packageRef, version: "" };
  return {
    name: packageRef.slice(0, separator),
    version: packageRef.slice(separator + 1),
  };
}

function splitLicenseExpression(license) {
  return license
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/i)
    .map((option) => option.split(/\s+AND\s+/i).map((atom) => atom.trim()))
    .filter((option) => option.every(Boolean));
}

function isAllowedAtom(atom) {
  return allowedLicenseAtoms.has(atom);
}

function findException(name, version, license) {
  return (policy.exceptions ?? []).find((exception) => {
    return (
      new RegExp(exception.packagePattern).test(name) &&
      exception.version === version &&
      new RegExp(exception.licensePattern).test(license)
    );
  });
}

function hasBlockedLicense(license) {
  const normalized = license.replace(/LGPL/gi, "");
  return /AGPL|\bGPL(?:[-.]|\b)|SSPL|BUSL|\bBSL\b|ELASTIC|COMMONS\s+CLAUSE|POLYFORM|CC-BY-NC|CC-BY-ND|NON[- ]?COMMERCIAL/i.test(
    normalized,
  );
}

function hasConditionalLicense(license) {
  return /LGPL|MPL|EPL|CDDL/i.test(license);
}

function classifyLicense(license) {
  const options = splitLicenseExpression(license);
  if (options.some((option) => option.every(isAllowedAtom))) {
    return {
      kind: "allowed",
      obligationAtoms: options
        .flat()
        .filter((atom) => obligationLicenseAtoms.has(atom)),
    };
  }
  if (hasBlockedLicense(license)) return { kind: "blocked" };
  if (hasConditionalLicense(license)) return { kind: "conditional" };
  return { kind: "unknown" };
}

for (const [packageRef, metadata] of Object.entries(report)) {
  const { name, version } = parsePackageRef(packageRef);
  const license = Array.isArray(metadata.licenses)
    ? metadata.licenses.join(" OR ")
    : String(metadata.licenses ?? "").trim();
  const exception = findException(name, version, license);

  if (exception) {
    exceptions.push(`${packageRef}: ${exception.reason}`);
    continue;
  }

  const classification = classifyLicense(license);
  if (classification.kind === "allowed") {
    for (const atom of new Set(classification.obligationAtoms)) {
      obligations.push(`${packageRef}: preserve ${atom} attribution and license text`);
    }
    continue;
  }

  const reason =
    classification.kind === "blocked"
      ? "blocked license"
      : classification.kind === "conditional"
        ? "conditional copyleft license requires an explicit review"
        : "unknown or missing license";
  const repository = metadata.repository
    ? ` (${typeof metadata.repository === "string" ? metadata.repository : JSON.stringify(metadata.repository)})`
    : "";
  failures.push(`${packageRef}: ${reason}: ${license || "<missing>"}${repository}`);
}

if (failures.length > 0) {
  console.error("License compliance failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `License compliance passed (${Object.keys(report).length} production packages; ${exceptions.length} explicit exceptions).`,
);
for (const obligation of obligations) console.log(`- ${obligation}`);
