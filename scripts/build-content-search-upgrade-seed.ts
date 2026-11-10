import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// Build the fixture with the exact prior implementation, including its stored triggers.
const root=path.resolve(import.meta.dir,"..");
const scratch=mkdtempSync(path.join(tmpdir(),"stave-search-old-source-"));
const output=path.join(root,"test-results","content-search-old-seed.cjs");
try {
  const archive=path.join(scratch,"source.tar");
  execFileSync("git",["archive","b41d6f23a","--output",archive],{cwd:root});
  execFileSync("tar",["-xf",archive,"-C",scratch]);
  const require=createRequire(import.meta.url);
  symlinkSync(path.dirname(path.dirname(require.resolve("better-sqlite3/package.json"))),path.join(scratch,"node_modules"));
  const entry=path.join(scratch,"seed.ts");
  writeFileSync(entry,`import {SqliteStore} from './electron/persistence/sqlite-store';
const app=new SqliteStore({dbPath:process.argv[2]!,runMaintenance:false});
app.saveRepositoryRegistry({repositories:[{repositoryPath:'/tmp/project',repositoryName:'Project',workspaces:[{id:'w',name:'Workspace'}],workspaceDefaultById:{w:true}}]});
app.upsertWorkspace({id:'w',name:'Workspace',snapshot:{activeTaskId:'t',tasks:[{id:'t',title:'Task',provider:'codex',updatedAt:'2026-11-16',unread:false}],messagesByTask:{t:[{id:'old',role:'user',model:'user',providerId:'user',content:'oldneedle',parts:[]}]}}});
while(app.contentSearch.buildBatch()) {}
app.close();
`);
  mkdirSync(path.dirname(output),{recursive:true});
  const bundle=await Bun.build({entrypoints:[entry],target:"node",format:"cjs",external:["better-sqlite3"],define:{"import.meta.env.BASE_URL":'"/"'}});
  if(!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
  writeFileSync(output,await bundle.outputs[0]!.text());
  console.log(output);
} finally {rmSync(scratch,{recursive:true,force:true});}
