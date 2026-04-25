import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_TOOLTIP_VERSION = "1.2.8";
const tooltipPackageJsonPath = path.join(
  rootDir,
  "node_modules",
  "@radix-ui",
  "react-tooltip",
  "package.json",
);
const tooltipBundlePath = path.join(
  rootDir,
  "node_modules",
  "@radix-ui",
  "react-tooltip",
  "dist",
  "index.mjs",
);

if (!fs.existsSync(tooltipBundlePath) || !fs.existsSync(tooltipPackageJsonPath)) {
  console.warn("[patch-radix-tooltip] skipped: tooltip bundle not found");
  process.exit(0);
}

const tooltipPackage = JSON.parse(fs.readFileSync(tooltipPackageJsonPath, "utf8"));
const source = fs.readFileSync(tooltipBundlePath, "utf8");
const installedVersion = typeof tooltipPackage?.version === "string"
  ? tooltipPackage.version
  : "unknown";

if (
  source.includes("const triggerRef = React.useRef(null);")
  && source.includes("if (nextTrigger === null)")
) {
  console.log("[patch-radix-tooltip] already applied");
  process.exit(0);
}

if (installedVersion !== EXPECTED_TOOLTIP_VERSION) {
  throw new Error(
    `[patch-radix-tooltip] unsupported @radix-ui/react-tooltip version ${installedVersion}; expected ${EXPECTED_TOOLTIP_VERSION}`,
  );
}

const stateTarget = "  const [trigger, setTrigger] = React.useState(null);\n";
const stateReplacement = `${stateTarget}  const triggerRef = React.useRef(null);\n`;
const setterTarget = "      onTriggerChange: setTrigger,\n";
const setterReplacement = `      onTriggerChange: React.useCallback((nextTrigger) => {\n        if (nextTrigger === null) {\n          return;\n        }\n        if (triggerRef.current !== nextTrigger) {\n          triggerRef.current = nextTrigger;\n          setTrigger(nextTrigger);\n        }\n      }, []),\n`;

if (!source.includes(stateTarget) || !source.includes(setterTarget)) {
  throw new Error("[patch-radix-tooltip] unexpected upstream bundle shape");
}

const patched = source
  .replace(stateTarget, stateReplacement)
  .replace(setterTarget, setterReplacement);

fs.writeFileSync(tooltipBundlePath, patched);
console.log("[patch-radix-tooltip] applied");
