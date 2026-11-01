import { useState } from "react";
import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { PresetsSection } from "@/components/layout/settings-dialog-presets-section";
import { KeyboardShortcutsDrawer } from "@/components/layout/KeyboardShortcutsDrawer";
import { PaneNewTabSplitButton } from "@/components/panes/PaneNewTabSplitButton";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { useAppStore } from "@/store/app.store";
import type { TaskPreset } from "@/lib/task-presets";
import "@/components/ads/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
document.documentElement.classList.toggle("dark", params.get("theme") === "dark");
document.documentElement.dataset.uiDensity = params.get("density") ?? "regular";

const presets: TaskPreset[] = [
  { id: "claude", label: "Planning", kind: "task", provider: "claude-code", model: "claude-opus-5-5", effort: "max" },
  { id: "codex", label: "Implementation", kind: "task", provider: "codex", model: "gpt-6.1-sol" },
  { id: "cursor", label: "길이가 긴 사용자 지정 프리셋 이름 Long custom preset label", kind: "task", provider: "cursor", model: "composer-2", effort: "high" },
  { id: "kiro", label: "Investigation", kind: "task", provider: "kiro", model: "auto" },
  { id: "opencode", label: "Default effort", kind: "task", provider: "opencode", model: "openai/gpt-6.1-sol" },
  { id: "cli", label: "Codex CLI", kind: "cli-session", provider: "codex" },
];
useAppStore.persist.setOptions({ name: "task-presets-visibility-fixture" });
useAppStore.setState((state) => ({
  settings: { ...state.settings, taskPresets: presets },
}));

function Fixture() {
  const [shortcutsOpen, setShortcutsOpen] = useState(params.has("shortcuts"));
  return (
    <StaveDesignProvider>
      <main>
        <PaneNewTabSplitButton groupId="preset-fixture" />
        <PresetsSection />
        <KeyboardShortcutsDrawer open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </main>
    </StaveDesignProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
