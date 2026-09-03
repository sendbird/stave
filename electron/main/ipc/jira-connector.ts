/**
 * The credential travels one way only.
 *
 * `email` and `token` are read out of the parsed request, handed straight to
 * the service, and never referenced again: every handler below answers with a
 * `JiraConnectorPublicStatus`, which has no field either value could occupy.
 * The renderer therefore has no way to read back what it wrote, and no getter
 * exists in preload that would let it try.
 */

import { ipcMain } from "electron";

import {
  clearJiraCredential,
  configureJiraConnector,
  getJiraConnectorStatus,
  loadJiraConnectorStatus,
  safeJiraErrorMessage,
  setJiraCredential,
  testJiraConnection,
} from "../jira-connector/service";
import { refreshTrackerSourceAvailability } from "../tracker-tasks/service";
import {
  JiraConnectorConfigureArgsSchema,
  JiraConnectorSetCredentialArgsSchema,
  JiraConnectorTestConnectionArgsSchema,
} from "./schemas";

/**
 * Availability is recomputed after every credential or settings change so the
 * Tasks surface flips between "not configured" and "ready" without a restart.
 * A failure here is deliberately swallowed: the connector operation already
 * succeeded, and the surface refreshes itself on its own schedule anyway.
 */
async function notifyTrackerSources() {
  try {
    await refreshTrackerSourceAvailability();
  } catch (error) {
    console.error("[jira-connector] source availability refresh failed", error);
  }
}

export function registerJiraConnectorHandlers() {
  ipcMain.handle("jira-connector:get-status", async () => {
    try {
      return { ok: true, status: await loadJiraConnectorStatus() };
    } catch (error) {
      return {
        ok: false,
        status: getJiraConnectorStatus(),
        message: safeJiraErrorMessage(error),
      };
    }
  });

  ipcMain.handle("jira-connector:configure", async (_event, args: unknown) => {
    const parsed = JiraConnectorConfigureArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        status: getJiraConnectorStatus(),
        message: "Invalid Jira connector configuration.",
      };
    }
    try {
      const status = configureJiraConnector(parsed.data);
      await notifyTrackerSources();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: getJiraConnectorStatus(),
        message: safeJiraErrorMessage(error),
      };
    }
  });

  ipcMain.handle(
    "jira-connector:set-credential",
    async (_event, args: unknown) => {
      const parsed = JiraConnectorSetCredentialArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: getJiraConnectorStatus(),
          message: "Enter the Jira account email and API token.",
        };
      }
      try {
        const status = await setJiraCredential({
          email: parsed.data.email,
          token: parsed.data.token,
        });
        await notifyTrackerSources();
        return { ok: true, status };
      } catch (error) {
        return {
          ok: false,
          status: getJiraConnectorStatus(),
          message: safeJiraErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle("jira-connector:clear-credential", async () => {
    try {
      const status = await clearJiraCredential();
      await notifyTrackerSources();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: getJiraConnectorStatus(),
        message: safeJiraErrorMessage(error),
      };
    }
  });

  ipcMain.handle(
    "jira-connector:test-connection",
    async (_event, args: unknown) => {
      const parsed = JiraConnectorTestConnectionArgsSchema.safeParse(
        args ?? {},
      );
      if (!parsed.success) {
        return {
          ok: false,
          status: getJiraConnectorStatus(),
          message: "Invalid Jira connection test.",
        };
      }
      try {
        return { ok: true, status: await testJiraConnection() };
      } catch (error) {
        return {
          ok: false,
          status: getJiraConnectorStatus(),
          message: safeJiraErrorMessage(error),
        };
      }
    },
  );
}
