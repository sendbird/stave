import { ipcMain } from "electron";
import {
  createRoutine,
  listRoutineInformationReferences,
  listRoutines,
  removeRoutine,
  runRoutineNow,
  setRoutineEnabled,
  updateRoutine,
} from "../routine-service";
import {
  RoutineCreateArgsSchema,
  RoutineIdArgsSchema,
  RoutineInformationReferencesArgsSchema,
  RoutineSetEnabledArgsSchema,
  RoutineUpdateArgsSchema,
} from "./schemas";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function registerRoutineHandlers() {
  ipcMain.handle("routines:list", async () => {
    try {
      return { ok: true, snapshot: await listRoutines() };
    } catch (error) {
      return {
        ok: false,
        snapshot: { routines: [], runs: [] },
        message: errorMessage(error, "Failed to load routines."),
      };
    }
  });

  ipcMain.handle("routines:create", async (_event, args: unknown) => {
    const parsed = RoutineCreateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, routine: null, message: "Invalid routine spec." };
    }
    try {
      return { ok: true, routine: await createRoutine(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        routine: null,
        message: errorMessage(error, "Failed to create routine."),
      };
    }
  });

  ipcMain.handle("routines:update", async (_event, args: unknown) => {
    const parsed = RoutineUpdateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, routine: null, message: "Invalid routine update." };
    }
    try {
      return { ok: true, routine: await updateRoutine(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        routine: null,
        message: errorMessage(error, "Failed to update routine."),
      };
    }
  });

  ipcMain.handle("routines:remove", async (_event, args: unknown) => {
    const parsed = RoutineIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid routine id." };
    }
    try {
      await removeRoutine(parsed.data);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: errorMessage(error, "Failed to remove routine."),
      };
    }
  });

  ipcMain.handle("routines:set-enabled", async (_event, args: unknown) => {
    const parsed = RoutineSetEnabledArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, routine: null, message: "Invalid routine update." };
    }
    try {
      return { ok: true, routine: await setRoutineEnabled(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        routine: null,
        message: errorMessage(error, "Failed to update routine."),
      };
    }
  });

  ipcMain.handle("routines:run-now", async (_event, args: unknown) => {
    const parsed = RoutineIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, run: null, message: "Invalid routine id." };
    }
    try {
      return { ok: true, run: await runRoutineNow(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        run: null,
        message: errorMessage(error, "Failed to start routine."),
      };
    }
  });

  ipcMain.handle(
    "routines:list-information-references",
    async (_event, args: unknown) => {
      const parsed = RoutineInformationReferencesArgsSchema.safeParse(args);
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
          options: await listRoutineInformationReferences(parsed.data),
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
