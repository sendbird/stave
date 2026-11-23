import { useState } from "react";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { i18n } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";

const params = new URLSearchParams(window.location.search);
applyThemeClass({ enabled: params.get("theme") !== "light" });
void i18n.changeLanguage(params.get("lang") === "ko" ? "ko" : "en");
window.api = { sourceControl: {} } as typeof window.api;

export function WorkspacePrPreview() {
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState("");
  return <>
    <output data-testid="submitted-reference">{submitted}</output>
    <CreateWorkspaceDialog open={open} activeBranch="main" defaultBranch="main"
      onOpenChange={setOpen} onImportWorkspace={async () => ({ ok: false })}
      onCreateWorkspace={async ({ mode, prReference }) => {
        if (mode !== "pr" || !prReference) return { ok: false };
        setSubmitted(prReference);
        return { ok: true };
      }}
    />
  </>;
}
