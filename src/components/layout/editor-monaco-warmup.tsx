import MonacoEditor from "@monaco-editor/react";
import { configureMonacoDefaults } from "./editor-monaco-workspace-support";

// Mounts a hidden Monaco editor so module, workers, CSS and language services
// are initialised before the user first opens the editor panel. Without this,
// the very first `editor.create()` blocks the main thread for a few hundred ms
// and the UI appears to freeze when toggling the panel open on a file click.
export function EditorMonacoWarmup({ onReady }: { onReady: () => void }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: "-9999px",
        width: "400px",
        height: "200px",
        visibility: "hidden",
        pointerEvents: "none",
      }}
    >
      <MonacoEditor
        height="200px"
        width="400px"
        language="plaintext"
        value=""
        beforeMount={(monaco) => configureMonacoDefaults(monaco)}
        onMount={() => onReady()}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: "off",
          folding: false,
          automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: "none",
          occurrencesHighlight: "off",
          overviewRulerLanes: 0,
        }}
      />
    </div>
  );
}
