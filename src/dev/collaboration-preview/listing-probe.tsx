import { useState } from "react";
import { useChildTasks } from "@/components/session/useChildTasks";
/** Development-only lifecycle probe for delayed IPC replies. */
export function ChildListingProbe() {
  const [enabled, setEnabled] = useState(true);
  const listing = useChildTasks({ parentTaskId: "probe-parent", enabled });
  return (
    <main>
      <button onClick={() => setEnabled(false)}>Disable listing</button>
      <output aria-label="Listed children">{listing.children.length}</output>
      <output aria-label="Listing pending">{String(listing.loading)}</output>
    </main>
  );
}
