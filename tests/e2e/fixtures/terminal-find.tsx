import { createRoot } from "react-dom/client";
import { TerminalTabSurface } from "@/components/layout/TerminalTabSurface";
import { useTerminalTabManager } from "@/components/layout/useTerminalTabManager";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { applyAppLocale } from "@/i18n";
import "@/globals.css";
applyAppLocale("en");
const tabs = [{ id: "find-terminal" }];
const getTabKey = () => "find-terminal";
function Fixture() {
  const manager = useTerminalTabManager({ tabs, activeTabId: tabs[0]!.id, isVisible: true, getTabKey });
  return <div style={{ height: "600px", width: "800px" }}><TerminalTabSurface tabKey="find-terminal" sessionId={null} surface="terminal-pane" isActive isVisible fontFamily="monospace" fontSize={14} isDarkMode={false}
    tabManager={{ ...manager, registerInstance: (key, controller) => {
      Object.assign(window, { terminalFindFixture: controller });
      return manager.registerInstance(key, controller);
    } }} onData={() => {}} onResize={(key, cols, rows) => manager.resize(key, cols, rows)} /></div>;
}
createRoot(document.getElementById("root")!).render(<StaveDesignProvider><Fixture /></StaveDesignProvider>);
