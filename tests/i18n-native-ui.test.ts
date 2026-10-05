import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanSource } from "../scripts/i18n/hardcoded-strings.mjs";

function scan(source: string) {
  return scanSource("electron/new-feature/dialogs.ts", source, {
    terms: ["Stave"], nativeUiOnly: true,
  }).map((finding) => `${finding.rule}:${finding.text}`);
}

describe("Electron native UI string gate", () => {
  test("the default CLI discovers native UI in a newly added Electron file", () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "stave-native-i18n-"));
    try {
      for (const dir of ["config", "src/locales/en", "src/locales/ko", "electron/new-feature"]) mkdirSync(path.join(fixture, dir), { recursive: true });
      const config = JSON.parse(readFileSync(new URL("../config/i18n.json", import.meta.url), "utf8"));
      writeFileSync(path.join(fixture, "config/i18n.json"), JSON.stringify(config));
      for (const source of config.scan.mainProcessFiles) {
        const target = path.join(fixture, source);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, "");
      }
      const file = path.join(fixture, "electron/new-feature/dialog.ts");
      const protocol = 'const model = { description: "Analyze the source files", message: "Keep exact protocol values" };';
      writeFileSync(file, protocol + 'dialog.showMessageBox({ title: "New native dialog" });');
      const run = () => spawnSync("bun", [new URL("../scripts/check-i18n.mjs", import.meta.url).pathname], { cwd: fixture, encoding: "utf8" });
      const failing = run();
      expect(failing.status).toBe(1);
      expect(failing.stderr).toContain('electron/new-feature/dialog.ts');
      expect(failing.stderr).toContain('electron-dialog "New native dialog"');
      expect(failing.stderr).not.toContain("Analyze the source files");
      expect(failing.stderr).not.toContain("Keep exact protocol values");
      writeFileSync(file, protocol + 'dialog.showMessageBox({ title: tMain("newDialog.title") });');
      const passing = run();
      expect(passing.status).toBe(0);
      expect(passing.stdout).toContain("i18n check passed");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("checks every dialog API, buttons and file-filter names in a new Electron file", () => {
    expect(scan(`
      import { dialog } from "electron";
      dialog.showMessageBox(window, { title: "Delete task", message: "Are you sure?", detail: "This cannot be undone.", checkboxLabel: "Remember choice", buttons: ["Delete", "Cancel"] });
      dialog.showOpenDialog({ buttonLabel: "Choose folder", filters: [{ name: "Text files", extensions: ["txt"] }], properties: ["openDirectory"] });
      dialog.showSaveDialog({ title: "Save export", defaultPath: "/tmp/export" });
      dialog.showErrorBox("Cannot open workspace", "Try another folder.");
    `)).toEqual([
      "electron-dialog:Delete task", "electron-dialog:Are you sure?", "electron-dialog:This cannot be undone.",
      "electron-dialog:Remember choice", "electron-dialog:Delete", "electron-dialog:Cancel",
      "electron-dialog:Choose folder", "electron-dialog:Text files", "electron-dialog:Save export",
      "electron-dialog:Cannot open workspace", "electron-dialog:Try another folder.",
    ]);
  });

  test("follows scoped aliases, shorthand fields, typed objects, spreads and array mutations", () => {
    expect(scan(`
      import { dialog as nativeDialog } from "electron";
      const title = "Outer unused prompt";
      function launch() {
        const title = "Select documents";
        const choices = ["Open"] as const;
        choices.push("Cancel");
        const types = [{ name: "Images", extensions: ["png"] }];
        const base = { title, buttons: choices };
        const opts = { ...base, filters: types } satisfies OpenDialogOptions;
        opts.buttonLabel = "Select";
        const alias = opts;
        nativeDialog.showOpenDialog(window, alias);
      }
    `)).toEqual(expect.arrayContaining([
      "electron-dialog:Select documents", "electron-dialog:Open", "electron-dialog:Cancel",
      "electron-dialog:Images", "electron-dialog:Select",
    ]));
    expect(scan(`const title = "Unused prompt"; const options = { title: tMain("picker.title") }; dialog.showOpenDialog(options);`)).toEqual([]);
  });

  test("checks locally bound menus, nested submenu aliases and pushed items", () => {
    expect(scan(`
      import * as electron from "electron";
      const nested = [{ label: "Recent work", role: "recentDocuments" }];
      const extra = [{ label: "close" }];
      const template = [{ label: "File", submenu: nested }] as const;
      template.push({ label: "Help", submenu: [...extra] });
      const alias = template;
      electron.Menu.buildFromTemplate(alias);
    `)).toEqual([
      "electron-menu:File", "electron-menu:Recent work", "electron-menu:Help", "electron-menu:close",
    ]);
  });

  test("preserves terms, explicit ignores, model prompts, tool descriptions and protocol data", () => {
    expect(scan(`
      const prompt = { title: "Assess the changes", message: "Inspect every file." };
      const tool = { description: "Read files from the repository", buttons: ["model action"] };
      const protocol = { name: "stable protocol name", role: "quit", properties: ["openFile"] };
      const dialogData = { description: "Model tool instructions" };
      const options = { title: "Stave", message: tMain("quit.message"), buttons: [tMain("quit.cancel")] };
      dialog.showMessageBox(options);
      // i18n-ignore: diagnostic shown verbatim at an explicit native error boundary
      dialog.showErrorBox("Provider fault", "Raw diagnostic output");
    `)).toEqual([]);
  });

  test("handles translated options, conditional branches, synchronous dialogs and cyclic bindings", () => {
    expect(scan(`
      const opts = condition ? { title: "Choose project" } : { title: tMain("picker.title") };
      const receiver = dialog;
      receiver.showOpenDialogSync(opts);
      const show = dialog.showErrorBox;
      show(tMain("error.title"), tMain("error.detail"));
      Menu["buildFromTemplate"]([{ label: tMain("menu.file") }]);
      const a = b; const b = a;
      Menu.buildFromTemplate(a);
      const cyclic = [...cyclic];
      Menu.buildFromTemplate(cyclic);
    `)).toEqual(["electron-dialog:Choose project"]);
  });
});
