import { ipcMain } from "electron";
import {
  createAutomationInformationResource,
  createAutomation,
  listAutomationInformationReferences,
  listAutomations,
  removeAutomation,
  runAutomationNow,
  setAutomationEnabled,
  setAutomationProviderTimeoutMs,
  updateAutomation,
} from "../automation-service";
import {
  AutomationCreateArgsSchema,
  AutomationIdArgsSchema,
  AutomationInformationResourceCreateArgsSchema,
  AutomationInformationReferencesArgsSchema,
  AutomationSetEnabledArgsSchema,
  AutomationProviderTimeoutArgsSchema,
  AutomationUpdateArgsSchema,
} from "./schemas";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function registerAutomationHandlers() {
  ipcMain.handle(
    "automations:set-provider-timeout",
    async (_event, args: unknown) => {
      const parsed = AutomationProviderTimeoutArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid provider timeout." };
      }
      try {
        await setAutomationProviderTimeoutMs(parsed.data);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: errorMessage(error, "Failed to update provider timeout."),
        };
      }
    },
  );

  ipcMain.handle("automations:list", async () => {
    try {
      return { ok: true, snapshot: await listAutomations() };
    } catch (error) {
      return {
        ok: false,
        snapshot: { automations: [], runs: [] },
        message: errorMessage(error, "Failed to load automations."),
      };
    }
  });

  ipcMain.handle("automations:create", async (_event, args: unknown) => {
    const parsed = AutomationCreateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, automation: null, message: "Invalid automation spec." };
    }
    try {
      return { ok: true, automation: await createAutomation(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        automation: null,
        message: errorMessage(error, "Failed to create automation."),
      };
    }
  });

  ipcMain.handle("automations:update", async (_event, args: unknown) => {
    const parsed = AutomationUpdateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, automation: null, message: "Invalid automation update." };
    }
    try {
      return { ok: true, automation: await updateAutomation(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        automation: null,
        message: errorMessage(error, "Failed to update automation."),
      };
    }
  });

  ipcMain.handle("automations:remove", async (_event, args: unknown) => {
    const parsed = AutomationIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid automation id." };
    }
    try {
      await removeAutomation(parsed.data);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: errorMessage(error, "Failed to remove automation."),
      };
    }
  });

  ipcMain.handle("automations:set-enabled", async (_event, args: unknown) => {
    const parsed = AutomationSetEnabledArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, automation: null, message: "Invalid automation update." };
    }
    try {
      return { ok: true, automation: await setAutomationEnabled(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        automation: null,
        message: errorMessage(error, "Failed to update automation."),
      };
    }
  });

  ipcMain.handle("automations:run-now", async (_event, args: unknown) => {
    const parsed = AutomationIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, run: null, message: "Invalid automation id." };
    }
    try {
      return { ok: true, run: await runAutomationNow(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        run: null,
        message: errorMessage(error, "Failed to start automation."),
      };
    }
  });

  ipcMain.handle(
    "automations:create-information-resource",
    async (_event, args: unknown) => {
      const parsed = AutomationInformationResourceCreateArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          option: null,
          message: "Invalid Information resource.",
        };
      }
      try {
        return {
          ok: true,
          ...(await createAutomationInformationResource(parsed.data)),
        };
      } catch (error) {
        return {
          ok: false,
          option: null,
          message: errorMessage(
            error,
            "Failed to create Information resource.",
          ),
        };
      }
    },
  );

  ipcMain.handle(
    "automations:list-information-references",
    async (_event, args: unknown) => {
      const parsed = AutomationInformationReferencesArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          options: [],
          message: "Invalid workspace id.",
        };
      }
      try {
        return {
          ok: true,
          options: await listAutomationInformationReferences(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          options: [],
          message: errorMessage(
            error,
            "Failed to load Information references.",
          ),
        };
      }
    },
  );
}
