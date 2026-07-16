import { spawnSync } from "node:child_process";

const result = spawnSync(
  "bunx",
  ["--bun", "eslint", "src/lib/terminal/osc133.ts"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
