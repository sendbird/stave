import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("PR stack discovery and retarget cross real preload, main and host with strict requests", async () => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(path.join(tmpdir(), "pr-stack-native-"));
  const cwd = path.join(directory, "repository");
  const bin = path.join(directory, "bin");
  const statePath = path.join(directory, "state.json");
  const logPath = path.join(directory, "calls.jsonl");
  await mkdir(cwd); await mkdir(bin);
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
  await writeFile(path.join(cwd, "file"), "base"); git("add", "."); git("commit", "-m", "test: base");
  const pr = (number: number, headRefName: string, baseRefName: string, state: string) => ({ number, headRefName, baseRefName, state, title: `Change ${number}`, url: `https://example.test/repo/pull/${number}` });
  await writeFile(statePath, JSON.stringify([pr(1, "parent", "main", "MERGED"), pr(2, "child", "parent", "OPEN")]));
  await writeFile(path.join(bin, "gh"), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STACK_CALLS, JSON.stringify(args)+'\\n');
const prs = JSON.parse(fs.readFileSync(process.env.STACK_STATE,'utf8'));
const out = value => process.stdout.write(JSON.stringify(value));
if(args[0]==='auth') process.exit(0);
if(args[0]==='repo') out({defaultBranchRef:{name:'main'}});
else if(args[1]==='view') {
 const pr=prs.find(pr=>pr.number===(args[2]==='--json'?2:Number(args[2])));
 out(args.at(-1)==='headRefName,baseRefName'?{headRefName:pr.headRefName,baseRefName:pr.baseRefName}:pr);
} else if(args[1]==='list') {
 const head=args.includes('--head');const ref=args[args.indexOf(head?'--head':'--base')+1];
 out(prs.filter(pr=>(head?pr.headRefName:pr.baseRefName)===ref&&(args.includes('all')||pr.state==='OPEN')));
} else if(args[1]==='edit') {
 prs.find(pr=>pr.number===Number(args[2])).baseRefName=args.at(-1);
 fs.writeFileSync(process.env.STACK_STATE,JSON.stringify(prs));
} else if(args[1]!=='update-branch') {process.stderr.write('unexpected fake command');process.exit(1);}
`);
  await chmod(path.join(bin, "gh"), 0o755);
  const stave = await launchStave({ env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, STACK_STATE: statePath, STACK_CALLS: logPath } });
  try {
    await stave.page.waitForFunction(() => Boolean(window.api?.sourceControl?.getPrStack));
    const result = await stave.page.evaluate(cwd => window.api.sourceControl!.getPrStack!({ cwd }), cwd);
    expect(result.ok, result.stderr).toBe(true);
    expect(result.stack).toMatchObject({ position: 2, total: 2, parent: { number: 1, state: "MERGED" } });
    const rejected = await stave.page.evaluate(async cwd => {
      try {
        await window.api.sourceControl!.retargetPrStack!({ cwd, parentNumber: 1, childNumbers: [2], force: true } as never);
        return false;
      } catch { return true; }
    }, cwd);
    expect(rejected).toBe(true);
    const updated = await stave.page.evaluate(cwd => window.api.sourceControl!.retargetPrStack!({ cwd, parentNumber: 1, childNumbers: [2] }), cwd);
    expect(updated, JSON.stringify(updated)).toMatchObject({ ok: true, updated: [2] });
    const calls = (await readFile(logPath, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    expect(calls).toContainEqual(["pr", "update-branch", "2"]);
    expect(calls.flat().some(arg => arg.includes("force"))).toBe(false);
    expect(git("branch", "--show-current")).toBe("main");
  } finally { await stave.close(); await rm(directory, { recursive: true, force: true }); }
});
