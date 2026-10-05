import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { ScriptsManager } from "@/components/scripts/ScriptsManager";
import { TooltipProvider } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import "@/globals.css";

let reads = 0;
const content = JSON.stringify({
  version: 2,
  services: { dev: { label: "User service", commands: ["bun run dev"] } },
});
window.api = {
  fs: {
    readFile: async () => {
      reads += 1;
      return { ok: true, content, revision: "fixture-revision" };
    },
  },
} as unknown as typeof window.api;
useAppStore.persist.setOptions({ name: "scripts-locale-regression-fixture" });
Object.assign(window, {
  scriptsFixture: { locale: applyAppLocale, reads: () => reads },
});
createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <ScriptsManager repositoryPath="/tmp/script-repository" workspacePath="/tmp/script-workspace" resolvedConfig={null} />
  </TooltipProvider>,
);
