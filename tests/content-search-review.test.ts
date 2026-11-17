import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

for(const scenario of ["C1","C2","S1","S2","S6","S7"]) test(scenario+" review regressions use the application native SQLite persistence", async () => {
  mkdirSync("test-results", {recursive:true});
  const dir=mkdtempSync(path.resolve("test-results/content-search-"));
  try {
    const bundle=spawnSync("bun",["build","tests/content-search-review.native.ts","--target=node","--format=cjs","--external=better-sqlite3",'--define=import.meta.env.BASE_URL="/"',"--outfile="+path.join(dir,"native.cjs")],{encoding:"utf8"});
    if(bundle.status!==0) console.error(bundle.stderr);
    expect(bundle.status).toBe(0);
    let result=spawnSync("node",[path.join(dir,"native.cjs")],{encoding:"utf8",timeout:60_000,env:{...process.env,SEARCH_REVIEW_CASE:scenario}});
    // Installation may have rebuilt native bindings for the desktop runtime.
    if(result.status!==0 && /NODE_MODULE_VERSION|compiled against a different Node/.test(result.stderr ?? "")) {
      const desktopRuntime=createRequire(import.meta.url)("electron") as string;
      result=spawnSync(desktopRuntime,[path.join(dir,"native.cjs")],{encoding:"utf8",timeout:60_000,env:{...process.env,SEARCH_REVIEW_CASE:scenario,ELECTRON_RUN_AS_NODE:"1"}});
    }
    console.log(result.stdout);
    if(result.status!==0) console.error(result.stderr);
    expect(result.status).toBe(0);
  } finally {rmSync(dir,{recursive:true,force:true});}
},60_000);
