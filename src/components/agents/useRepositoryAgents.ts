import { i18n } from "@/i18n/runtime";
import { useCallback, useEffect, useState } from "react";
import { scanRepositoryAgents, type RepositoryAgentScan, type RepositoryFileAccess } from "@/lib/agents/repository";

/** The workspace file bridge as `RepositoryFileAccess`; null when the app has no file access (browser preview). */
function repositoryFileAccess(rootPath: string): RepositoryFileAccess | null {
  const fs = typeof window === "undefined" ? undefined : window.api?.fs;
  const listDirectory = fs?.listDirectory;
  const readFile = fs?.readFile;
  if (!listDirectory || !readFile) return null;
  return {
    listDirectory: async (directoryPath) => {
      const result = await listDirectory({ rootPath, directoryPath }).catch(() => null);
      // A missing folder is the common case, not a problem worth reporting.
      return result?.ok ? result.entries : null;
    },
    readFile: async (filePath) => {
      let result: Awaited<ReturnType<typeof readFile>>;
      try {
        result = await readFile({ rootPath, filePath });
      } catch (error) {
        return { error: i18n.t("agents:useRepositoryAgents.extraCopy41", { value1: String(error) }) };
      }
      if (result.ok) return { content: result.content };
      if (result.tooLarge) return { error: i18n.t("agents:useRepositoryAgents.extraCopy40") };
      return { error: result.stderr ? i18n.t("agents:useRepositoryAgents.extraCopy41", { value1: result.stderr }) : i18n.t("agents:useRepositoryAgents.extraCopy42") };
    },
  };
}

const EMPTY_SCAN: RepositoryAgentScan = { agents: [], problems: [] };

/**
 * Agents read from the provider agent folders of `rootPath`. Read when the
 * root changes and on `reload`, so an edited file shows up without a restart;
 * a scan that finishes after the root changed is ignored.
 */
export function useRepositoryAgents(rootPath: string | null) {
  const [scan, setScan] = useState<RepositoryAgentScan>(EMPTY_SCAN);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const access = rootPath ? repositoryFileAccess(rootPath) : null;
    if (!access) {
      setScan(EMPTY_SCAN);
      return;
    }
    let current = true;
    setLoading(true);
    void scanRepositoryAgents(access)
      .then((next) => {
        if (current) setScan(next);
      })
      .catch((error: unknown) => {
        if (current) setScan({ agents: [], problems: [{ path: rootPath ?? "", message: String(error) }] });
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [rootPath, nonce]);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { scan, loading, reload };
}
